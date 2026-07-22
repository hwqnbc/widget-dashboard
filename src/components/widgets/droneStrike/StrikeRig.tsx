import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'
import type {
  BatteryEvent,
  BatteryState,
  Collider,
  ControlInput,
  FlightMode,
  FlightState,
  Tuning,
  Vec3,
  Weather,
} from '../droneSim/flightModel'
import {
  CRASH_DURATION,
  CRASH_SPEED,
  DEAD_INPUT,
  SPAWN,
  sampleWind,
  stepBattery,
  stepCrash,
  stepFlight,
} from '../droneSim/flightModel'
import { PAD_CENTER, PAD_START_RADIUS } from '../droneSim/lapTimer'
import type { ExternalState } from '../droneSim/externalInput'
import { pollGamepad } from '../droneSim/externalInput'
import { CRASH_PULSE, vibrate } from '../droneSim/haptics'
import DroneModel from '../droneSim/DroneModel'
import type { AimAssistLevel, CombatState, WeaponSpec } from './combatModel'
import {
  AIM_BEND,
  AIM_CONE_RAD,
  AIM_CONE_RAD_ZOOM,
  AUTO_FIRE_HOLD_S,
  ENEMY_BOLT,
  bendAim,
  createHitEvents,
  findLockTarget,
  leadPoint,
  spawnProjectile,
  stepProjectiles,
} from './combatModel'
import type { TargetKind, TargetState } from './waveLayout'
import { aliveCount, stepDrift } from './waveLayout'
import type { EnemyAIState } from './enemyAI'
import { stepEnemy, stepTurret } from './enemyAI'
import type { AimOffset } from './aimModel'
import { RECOIL_KICK, ZOOM_SENS, fpvPitchGain } from './aimModel'
import type { AimAngles, AimMode, GimbalState } from './gimbalModel'
import {
  RECENTER_DELAY_MS,
  RECENTER_RATE,
  TRACK_MULT,
  TRACK_RATE,
  aimAngles,
  dirFromAngles,
  recenterGimbal,
  stepGimbalRates,
  trackToward,
} from './gimbalModel'

/** Seconds between HUD DOM writes (~7 Hz — no React renders). */
const HUD_INTERVAL = 0.15
/** Muzzle sits this far ahead of the drone centre along the aim direction. */
const MUZZLE_OFFSET = 0.45
/** Short tick when a bolt connects. */
const HIT_PULSE = 20
/** Double tick when a target pops. */
const KILL_PULSE = [25, 30, 45]
/** The player drone's hit sphere for enemy bolts — generous on purpose so
 * dodging is a skill, not a pixel hunt. */
const PLAYER_HIT_RADIUS = 0.55
/** Camera jolt when the player takes a hit. */
const PLAYER_HIT_KICK = 0.05
/** Minimap blip colours by target kind. */
const BLIP_COLORS: Record<TargetKind, string> = {
  balloon: '#ef5350',
  ringDrone: '#4dd0e1',
  enemy: '#ff1744',
  ground: '#9ccc65',
  turret: '#ff6e40',
}
/** Enemy bolts never hit other targets (no friendly fire). */
const NO_TARGETS: TargetState[] = []
/** Seconds resting on the spawn pad to restore one heart. */
const HEART_RECHARGE_S = 3

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Resting inside the pad zone: essentially landed, within the pad circle. */
function onPad(flight: FlightState): boolean {
  return (
    flight.pos.y < 1.2 &&
    Math.hypot(flight.pos.x - PAD_CENTER.x, flight.pos.z - PAD_CENTER.z) <=
      PAD_START_RADIUS
  )
}

/** Transient crash-tumble state, owned by the body, mutated here (the
 * body creates the literal — same split as the sim's DroneRig). */
export interface CrashState {
  active: boolean
  /** Canvas clock time (s) when the tumble ends and the drone respawns. */
  until: number
  spinX: number
  spinZ: number
}

/** Standard-layout gamepad: right trigger (7) or right shoulder (5) fires. */
function gamepadFireHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    return Boolean(pad.buttons[7]?.pressed || pad.buttons[5]?.pressed)
  }
  return false
}

/** Gamepad left trigger (6) holds ADS zoom. */
function gamepadZoomHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    return Boolean(pad.buttons[6]?.pressed)
  }
  return false
}

/**
 * The Drone Strike sim loop. Every frame: poll external input, step the
 * flight model, drift the targets, resolve fire intent (button / keyboard /
 * gamepad / auto-fire) against the weapon cooldown, sweep the projectile
 * pools, apply hit events, detect the wave clearing, pose the drone, and
 * throttle-write the data-* telemetry the HUD and e2e suites read.
 */
export default function StrikeRig({
  controls,
  flight,
  external,
  fireHeldRef,
  tuning,
  flightMode,
  colliders,
  weather,
  windRef,
  batteryMode,
  batteryRef,
  batteryBarRef,
  onBatteryEvent,
  crashMode,
  crashRef,
  onCrash,
  onCrashEnd,
  canHeal,
  onHeal,
  padStateRef,
  padChipRef,
  targets,
  enemyAI,
  enemiesShoot,
  combat,
  aimRef,
  weapon,
  assist,
  autoFire,
  waveActive,
  wave,
  hp,
  zoom,
  onZoomHold,
  aimMode,
  gimbalRef,
  aimInputRef,
  enemyMove,
  scoreRef,
  onWaveCleared,
  onTargetDown,
  onPlayerHit,
  hudRef,
  reticleRef,
  scoreChipRef,
  minimapDroneRef,
  minimapTargetRefs,
}: {
  controls: ControlInput
  flight: FlightState
  external: { current: ExternalState }
  /** True while the fire button / Space / mouse is held. */
  fireHeldRef: { current: boolean }
  tuning: Tuning
  /** 'hold' (altitude hold) or 'acro' (attitude + thrust under gravity). */
  flightMode: FlightMode
  colliders: readonly Collider[]
  weather: Weather
  windRef: { current: { x: number; y: number } }
  batteryMode: boolean
  batteryRef: { current: BatteryState }
  /** Battery bar fill — width/colour/data-level written on the tick. */
  batteryBarRef: RefObject<HTMLDivElement | null>
  onBatteryEvent: (event: BatteryEvent) => void
  /** Hard wall impacts tumble the drone, cost a heart and respawn it. */
  crashMode: boolean
  crashRef: { current: CrashState }
  /** Crash started (the body deducts the heart + banners). */
  onCrash: () => void
  /** Tumble over — the body respawns the drone at the pad. */
  onCrashEnd: () => void
  /** Resting on the spawn pad restores hearts while this is true. */
  canHeal: boolean
  onHeal: () => void
  /** Safe-pad visual state, read by SafePadRing inside the canvas. */
  padStateRef: { current: 'idle' | 'active' }
  /** Pad status chip — display/text/state written when it changes. */
  padChipRef: RefObject<HTMLDivElement | null>
  targets: TargetState[]
  /** Parallel AI slots for the 'enemy' targets. */
  enemyAI: EnemyAIState[]
  /** True from ENEMY_FIRE_WAVE — enemies return fire. */
  enemiesShoot: boolean
  combat: CombatState
  /** Shared aim offset (gyro fine-aim + recoil) — also read by the camera. */
  aimRef: { current: AimOffset }
  weapon: WeaponSpec
  assist: AimAssistLevel
  autoFire: boolean
  waveActive: boolean
  wave: number
  /** Player hit points this wave attempt (telemetry only — the body owns it). */
  hp: number
  /** ADS: tighter lock cone + gentler pitch follow on the fire path. */
  zoom: boolean
  /** Gamepad left-trigger zoom hold — edge-reported to the body. */
  onZoomHold: (held: boolean) => void
  /** Aim-control mode (gimbal reticle / gunner cam / hover gunner). */
  aimMode: AimMode
  /** The weapon gimbal, shared with the camera rig and the drag input. */
  gimbalRef: { current: GimbalState }
  /** performance.now() of the last manual aim input (drag) — the rig also
   * bumps it on hover-stick activity; idle-recenter waits on it. */
  aimInputRef: { current: number }
  /** Difficulty movement scaling for the enemy AI (orbit + evade). */
  enemyMove: { orbitMult: number; evadeMult: number; evadeTime: number }
  /** Session score — runtime-only, rendered via the telemetry tick. */
  scoreRef: { current: number }
  onWaveCleared: () => void
  /** A target went down (points awarded) — drives the hit-marker pops. */
  onTargetDown: (points: number) => void
  /** An enemy bolt connected with the player. */
  onPlayerHit: () => void
  hudRef: RefObject<HTMLDivElement | null>
  reticleRef: RefObject<HTMLDivElement | null>
  scoreChipRef: RefObject<HTMLDivElement | null>
  minimapDroneRef: RefObject<SVGGElement | null>
  minimapTargetRefs: RefObject<(SVGCircleElement | null)[]>
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const outerRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const angles = useRef<AimAngles>({ yaw: 0, pitch: 0 }).current
  // Hover mode: lateral flight input is ignored — the right stick slews
  // the gimbal instead. `left` aliases the live controls (throttle/yaw
  // stay flyable); `right` stays zero.
  const hoverInput = useRef<ControlInput>({
    left: controls.left,
    right: { x: 0, y: 0 },
  }).current
  const reticlePos = useRef({ x: 50, y: 50 })
  const hudClock = useRef(0)
  const events = useRef(createHitEvents()).current
  const fireDir = useRef<Vec3>({ x: 0, y: 0, z: -1 }).current
  const muzzle = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const aimPoint = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const lockIdxRef = useRef(-1)
  const lockHold = useRef(0)
  const clearedSent = useRef(false)
  const padZoomRef = useRef(false)
  const healClock = useRef(0)

  useFrame(({ clock }, dt) => {
    if (!waveActive) clearedSent.current = false
    pollGamepad(external.current, controls)

    // Gamepad LT holds zoom — edge-detected so React state changes only
    // when the trigger state actually flips.
    const padZoom = gamepadZoomHeld()
    if (padZoom !== padZoomRef.current) {
      padZoomRef.current = padZoom
      onZoomHold(padZoom)
    }

    const wind = windRef.current
    if (weather === 'storm') {
      sampleWind(clock.elapsedTime, wind)
    } else {
      wind.x = 0
      wind.y = 0
    }

    const crash = crashRef.current
    const battery = batteryRef.current
    if (crash.active) {
      // Tumble: controls and combat systems dead, gravity wins.
      stepCrash(flight, dt, colliders)
      crash.spinX += 6 * dt
      crash.spinZ += 4.5 * dt
      if (clock.elapsedTime >= crash.until) {
        crash.active = false
        crash.spinX = 0
        crash.spinZ = 0
        onCrashEnd()
      }
    } else {
      // The spawn pad is the service station: it recharges the battery and
      // (while a wave is live) restores hearts.
      const onSpawnPad = onPad(flight)

      // Battery bookkeeping first — a dead battery kills the sticks (gentle
      // auto-descent) and unpowers the gun until a pad recharge revives it.
      let effectiveControls: ControlInput =
        aimMode === 'hover' ? hoverInput : controls
      if (batteryMode) {
        const activity = Math.max(
          Math.abs(controls.left.x),
          Math.abs(controls.left.y),
          Math.abs(controls.right.x),
          Math.abs(controls.right.y),
        )
        const event = stepBattery(battery, activity, onSpawnPad, dt)
        if (event) onBatteryEvent(event)
        if (battery.dead) effectiveControls = DEAD_INPUT
      }

      const impact = stepFlight(
        flight,
        effectiveControls,
        dt,
        colliders,
        weather === 'storm' ? wind : undefined,
        flightMode,
        tuning,
      )
      if (crashMode && impact >= CRASH_SPEED) {
        crash.active = true
        crash.until = clock.elapsedTime + CRASH_DURATION
        crash.spinX = 0
        crash.spinZ = 0
        vibrate(CRASH_PULSE)
        onCrash()
      }

      // Heart recharge: rest on the pad for HEART_RECHARGE_S per heart.
      if (canHeal && onSpawnPad) {
        healClock.current += dt
        if (healClock.current >= HEART_RECHARGE_S) {
          healClock.current = 0
          onHeal()
        }
      } else {
        healClock.current = 0
      }
    }

    // Safe zone: resting on the pad (post-step position). Enemies hold
    // their fire, bolts in flight pass through, and the player's own gun
    // goes offline — the pad is for resting, not sniping.
    const playerSafe = !crash.active && onPad(flight)
    padStateRef.current = playerSafe ? 'active' : 'idle'

    const aim = aimRef.current
    const gimbal = gimbalRef.current
    const basePitch = flight.tiltPitch * fpvPitchGain(zoom, flightMode)

    // Classic (default) is the original fly-to-aim: the gimbal stays frozen
    // at boresight — no hover-stick slew, no soft-track, no idle-recenter.
    const gimballed = aimMode !== 'classic'

    // Hover mode: the right stick (touch or arrow keys — both feed the
    // same shared ControlInput) slews the gimbal at a rate.
    if (aimMode === 'hover' && !crash.active) {
      if (Math.abs(controls.right.x) > 0.02 || Math.abs(controls.right.y) > 0.02) {
        aimInputRef.current = performance.now()
      }
      stepGimbalRates(
        gimbal,
        controls.right.x,
        controls.right.y,
        zoom ? ZOOM_SENS : 1,
        dt,
      )
    }

    // Soft track: while last frame's lock is alive, the gimbal slews toward
    // the led target (error-reducing, arc-clamped, strength per assist) —
    // the sensor-operator's track mode that makes fast evaders hittable.
    const trackMult = gimballed ? TRACK_MULT[assist] : 0
    const tracking =
      trackMult > 0 && lockIdxRef.current >= 0 && !crash.active &&
      targets[lockIdxRef.current]?.alive
    if (tracking) {
      const t = targets[lockIdxRef.current]
      leadPoint(flight.pos, t.pos, t.vel, weapon.speed, aimPoint)
      const dx = aimPoint.x - flight.pos.x
      const dy = aimPoint.y - flight.pos.y
      const dz = aimPoint.z - flight.pos.z
      const desYaw = wrapAngle(Math.atan2(-dx, -dz) - flight.yaw - aim.yaw)
      const desPitch = Math.atan2(dy, Math.hypot(dx, dz)) - basePitch - aim.pitch
      trackToward(gimbal, desYaw, desPitch, TRACK_RATE * trackMult * dt)
    } else if (
      // Idle: no lock/track and no recent manual aim → ease the gimbal back
      // to boresight (a gimbal camera resting to centre), unless assist is
      // off (then the aim is yours to keep). Skip in hover while the stick
      // is held (that's the aim input).
      !crash.active &&
      trackMult > 0 &&
      lockIdxRef.current < 0 &&
      performance.now() - aimInputRef.current > RECENTER_DELAY_MS
    ) {
      recenterGimbal(gimbal, RECENTER_RATE * dt)
    }

    // The single aim composition (fire path, lock cone, reticle, gunner
    // camera all share it): flight yaw + tilt follow + gimbal + gyro.
    // Recoil stays camera-only.
    aimAngles(flight.yaw, basePitch, gimbal, aim.yaw, aim.pitch, angles)
    dirFromAngles(angles.yaw, angles.pitch, fireDir)

    // Gallery targets drift deterministically off the canvas clock; enemies
    // orbit/evade (and possibly return fire) while the wave is live.
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      stepDrift(t, clock.elapsedTime)
      if (waveActive && t.kind === 'enemy') {
        stepEnemy(
          t,
          enemyAI[i],
          i,
          dt,
          flight.pos,
          fireDir,
          colliders,
          enemiesShoot && !playerSafe,
          combat.enemy,
          ENEMY_BOLT,
          enemyMove,
        )
      } else if (waveActive && t.kind === 'turret') {
        stepTurret(
          t,
          enemyAI[i],
          i,
          dt,
          flight.pos,
          colliders,
          enemiesShoot && !playerSafe,
          combat.enemy,
          ENEMY_BOLT,
        )
      }
      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt)
    }

    // Reticle lock: nearest angular match inside the assist cone (the
    // scoped cone is ~half the hip cone — 2× view, 2× expected precision).
    const lockIdx = findLockTarget(
      flight.pos,
      fireDir,
      targets,
      colliders,
      (zoom ? AIM_CONE_RAD_ZOOM : AIM_CONE_RAD)[assist],
      weapon.maxRange,
    )
    if (lockIdx !== lockIdxRef.current) {
      lockIdxRef.current = lockIdx
      lockHold.current = 0
      const reticle = reticleRef.current
      if (reticle) {
        reticle.dataset.lock = String(lockIdx)
        reticle.style.borderColor = lockIdx >= 0 ? '#ffb300' : 'rgba(255,255,255,0.75)'
        reticle.style.color = lockIdx >= 0 ? '#ffb300' : 'rgba(255,255,255,0.9)'
        reticle.style.transform = lockIdx >= 0 ? 'scale(1.18)' : 'scale(1)'
      }
    } else if (lockIdx >= 0) {
      lockHold.current += dt
    }

    // Gimbal-mode reticle: the camera stays flight-locked, so project the
    // aim direction into camera space and move the reticle element across
    // the screen (left/top writes — the lock styling owns transform).
    const reticleEl = reticleRef.current
    if (reticleEl) {
      if (aimMode === 'gimbal') {
        const dYaw = wrapAngle(angles.yaw - flight.yaw)
        const dPitch = angles.pitch - basePitch
        const vHalf = Math.tan((camera.fov * Math.PI) / 360)
        const hHalf = vHalf * camera.aspect
        const xPct = Math.min(
          96,
          Math.max(4, 50 + (Math.tan(-dYaw) / hHalf) * 50),
        )
        const yPct = Math.min(
          96,
          Math.max(4, 50 - (Math.tan(dPitch) / vHalf) * 50),
        )
        const pos = reticlePos.current
        if (Math.abs(xPct - pos.x) > 0.15 || Math.abs(yPct - pos.y) > 0.15) {
          pos.x = xPct
          pos.y = yPct
          reticleEl.style.left = `${xPct.toFixed(2)}%`
          reticleEl.style.top = `${yPct.toFixed(2)}%`
        }
      } else if (reticleEl.style.left !== '') {
        reticleEl.style.left = ''
        reticleEl.style.top = ''
        reticlePos.current.x = 50
        reticlePos.current.y = 50
      }
    }

    // Fire intent: held trigger (button/Space/mouse/gamepad) or auto-fire
    // after the lock has held steady. One cooldown for both — auto-fire is a
    // convenience, not a rate buff. A dead battery can't power the gun.
    combat.cooldown = Math.max(0, combat.cooldown - dt)
    const wantsFire =
      waveActive &&
      !crash.active &&
      !playerSafe &&
      !(batteryMode && battery.dead) &&
      (fireHeldRef.current ||
        gamepadFireHeld() ||
        (autoFire && lockIdx >= 0 && lockHold.current >= AUTO_FIRE_HOLD_S))
    if (wantsFire && combat.cooldown === 0) {
      if (lockIdx >= 0) {
        const t = targets[lockIdx]
        // Lead the moving target, then bend the bolt by the assist level.
        leadPoint(flight.pos, t.pos, t.vel, weapon.speed, aimPoint)
        bendAim(fireDir, flight.pos, aimPoint, AIM_BEND[assist])
      }
      muzzle.x = flight.pos.x + fireDir.x * MUZZLE_OFFSET
      muzzle.y = flight.pos.y + fireDir.y * MUZZLE_OFFSET
      muzzle.z = flight.pos.z + fireDir.z * MUZZLE_OFFSET
      if (spawnProjectile(combat.player, muzzle, fireDir, weapon)) {
        combat.cooldown = weapon.cooldown
        combat.shots++
        aim.recoil += RECOIL_KICK
      }
    }

    // Sweep the player pool against world + targets.
    events.count = 0
    stepProjectiles(combat.player, weapon, dt, colliders, targets, null, 0, events)
    for (let i = 0; i < events.count; i++) {
      const e = events.items[i]
      if (e.kind !== 'target') continue
      const t = targets[e.targetIdx]
      if (!t.alive) continue
      combat.hits++
      t.hp--
      t.hitFlash = 0.25
      if (t.hp <= 0) {
        t.alive = false
        scoreRef.current += t.points
        vibrate(KILL_PULSE)
        onTargetDown(t.points)
      } else {
        vibrate(HIT_PULSE)
      }
    }

    // Sweep the enemy pool against the world + the player drone. A drone
    // already tumbling from a crash is not hit again (no double punishment).
    events.count = 0
    stepProjectiles(
      combat.enemy,
      ENEMY_BOLT,
      dt,
      colliders,
      NO_TARGETS,
      waveActive && !crash.active && !playerSafe ? flight.pos : null,
      PLAYER_HIT_RADIUS,
      events,
    )
    for (let i = 0; i < events.count; i++) {
      if (events.items[i].kind !== 'player') continue
      vibrate(CRASH_PULSE)
      aim.recoil += PLAYER_HIT_KICK
      onPlayerHit()
    }

    if (waveActive && !clearedSent.current && aliveCount(targets) === 0) {
      clearedSent.current = true
      onWaveCleared()
    }

    // Pose the drone + blob shadow.
    const outer = outerRef.current
    if (outer) {
      outer.position.set(flight.pos.x, flight.pos.y, flight.pos.z)
      outer.rotation.y = flight.yaw
    }
    const tilt = tiltRef.current
    if (tilt) {
      // Crash overrides the aerodynamic tilt with an accelerating tumble.
      tilt.rotation.x = crash.active ? crash.spinX : flight.tiltPitch
      tilt.rotation.z = crash.active ? crash.spinZ : flight.tiltRoll
    }
    const shadow = shadowRef.current
    if (shadow) {
      shadow.position.set(flight.pos.x, 0.02, flight.pos.z)
      const grow = 1 + flight.pos.y * 0.04
      shadow.scale.set(grow, grow, 1)
      const mat = shadow.material as MeshBasicMaterial
      mat.opacity = Math.min(0.35, Math.max(0.06, 0.35 - flight.pos.y * 0.008))
    }

    // Throttled telemetry — the HUD text and the e2e data-* contract.
    hudClock.current += dt
    if (hudClock.current >= HUD_INTERVAL) {
      hudClock.current = 0
      const hud = hudRef.current
      if (hud) {
        const alt = flight.pos.y
        const speed = Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z)
        const left = aliveCount(targets)
        hud.textContent = `ALT ${alt.toFixed(1)}m · SPD ${speed.toFixed(1)} · TGT ${left}`
        hud.dataset.alt = alt.toFixed(1)
        hud.dataset.speed = speed.toFixed(1)
        hud.dataset.x = flight.pos.x.toFixed(2)
        hud.dataset.z = flight.pos.z.toFixed(2)
        hud.dataset.yaw = flight.yaw.toFixed(3)
        // data-wave / data-wave-state are React-owned (low-frequency props
        // on the hud element) — writing them here too would create dual
        // ownership and a stale-attribute window at wave transitions.
        hud.dataset.score = String(scoreRef.current)
        hud.dataset.shots = String(combat.shots)
        hud.dataset.hits = String(combat.hits)
        hud.dataset.targetsLeft = String(left)
        hud.dataset.lock = String(lockIdxRef.current)
        let proj = 0
        for (const p of combat.player) if (p.active) proj++
        hud.dataset.proj = String(proj)
        let enemyProj = 0
        for (const p of combat.enemy) if (p.active) enemyProj++
        hud.dataset.enemyProj = String(enemyProj)
        hud.dataset.hp = String(hp)
        hud.dataset.crashState = crash.active ? 'tumbling' : 'none'
        hud.dataset.safe = playerSafe ? 'on' : 'off'
        hud.dataset.zoom = zoom ? 'on' : 'off'
        hud.dataset.gimbalYaw = gimbal.yaw.toFixed(3)
        hud.dataset.gimbalPitch = gimbal.pitch.toFixed(3)
        hud.dataset.inputSource = external.current.owner ?? 'touch'
        // Nearest alive target — the closed-loop aim beacon for the e2e
        // suites (no window globals; lesson #31).
        let nearest: TargetState | null = null
        let nearestDist = Infinity
        for (const t of targets) {
          if (!t.alive) continue
          const d = Math.hypot(
            t.pos.x - flight.pos.x,
            t.pos.y - flight.pos.y,
            t.pos.z - flight.pos.z,
          )
          if (d < nearestDist) {
            nearestDist = d
            nearest = t
          }
        }
        if (nearest) {
          hud.dataset.tgtX = nearest.pos.x.toFixed(2)
          hud.dataset.tgtY = nearest.pos.y.toFixed(2)
          hud.dataset.tgtZ = nearest.pos.z.toFixed(2)
          hud.dataset.tgtKind = nearest.kind
        } else {
          hud.dataset.tgtKind = 'none'
        }
      }
      const chip = scoreChipRef.current
      if (chip) {
        chip.textContent = `WAVE ${wave} · SCORE ${scoreRef.current}`
        chip.dataset.score = String(scoreRef.current)
        chip.dataset.wave = String(wave)
      }
      const padChip = padChipRef.current
      if (padChip) {
        const state = playerSafe ? (canHeal ? 'charging' : 'safe') : 'off'
        if (padChip.dataset.padState !== state) {
          padChip.dataset.padState = state
          padChip.style.display = state === 'off' ? 'none' : 'block'
          padChip.textContent =
            state === 'charging'
              ? 'SAFE ZONE · WEAPONS OFF · ♥ CHARGING'
              : 'SAFE ZONE · WEAPONS OFF · ♥ FULL'
        }
      }
      const bar = batteryBarRef.current
      if (bar) {
        const level = batteryRef.current.level
        bar.style.width = `${level}%`
        bar.style.backgroundColor =
          level > 40 ? '#66bb6a' : level > 15 ? '#ffb300' : '#ef5350'
        bar.dataset.level = level.toFixed(0)
      }
      const marker = minimapDroneRef.current
      if (marker) {
        marker.setAttribute(
          'transform',
          `translate(${flight.pos.x.toFixed(2)} ${flight.pos.z.toFixed(2)}) rotate(${(
            (-flight.yaw * 180) /
            Math.PI
          ).toFixed(1)})`,
        )
      }
      const blips = minimapTargetRefs.current
      if (blips) {
        for (let i = 0; i < targets.length; i++) {
          const el = blips[i]
          if (!el) continue
          const t = targets[i]
          if (t.alive) {
            el.setAttribute('cx', t.pos.x.toFixed(1))
            el.setAttribute('cy', t.pos.z.toFixed(1))
            el.setAttribute('fill', BLIP_COLORS[t.kind])
            el.removeAttribute('display')
          } else {
            el.setAttribute('display', 'none')
          }
        }
      }
    }
  })

  return (
    <>
      <group ref={outerRef} position={[SPAWN.x, SPAWN.y, SPAWN.z]}>
        <group ref={tiltRef}>
          <DroneModel controls={controls} />
        </group>
      </group>
      <mesh
        ref={shadowRef}
        rotation-x={-Math.PI / 2}
        position={[SPAWN.x, 0.02, SPAWN.z]}
      >
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </>
  )
}
