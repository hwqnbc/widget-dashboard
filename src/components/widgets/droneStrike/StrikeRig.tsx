import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type {
  Collider,
  ControlInput,
  FlightState,
  Tuning,
  Vec3,
  Weather,
} from '../droneSim/flightModel'
import { SPAWN, sampleWind, stepFlight } from '../droneSim/flightModel'
import type { ExternalState } from '../droneSim/externalInput'
import { pollGamepad } from '../droneSim/externalInput'
import { vibrate } from '../droneSim/haptics'
import DroneModel from '../droneSim/DroneModel'
import type { AimAssistLevel, CombatState, WeaponSpec } from './combatModel'
import {
  AIM_BEND,
  AIM_CONE_RAD,
  AUTO_FIRE_HOLD_S,
  bendAim,
  createHitEvents,
  findLockTarget,
  leadPoint,
  spawnProjectile,
  stepProjectiles,
} from './combatModel'
import type { TargetState } from './waveLayout'
import { aliveCount, stepDrift } from './waveLayout'
import type { AimOffset } from './aimModel'
import { FPV_PITCH_GAIN, RECOIL_KICK } from './aimModel'

/** Seconds between HUD DOM writes (~7 Hz — no React renders). */
const HUD_INTERVAL = 0.15
/** Muzzle sits this far ahead of the drone centre along the aim direction. */
const MUZZLE_OFFSET = 0.45
/** Short tick when a bolt connects. */
const HIT_PULSE = 20
/** Double tick when a target pops. */
const KILL_PULSE = [25, 30, 45]

/** Standard-layout gamepad: right trigger (7) or right shoulder (5) fires. */
function gamepadFireHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    return Boolean(pad.buttons[7]?.pressed || pad.buttons[5]?.pressed)
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
  colliders,
  weather,
  windRef,
  targets,
  combat,
  aimRef,
  weapon,
  assist,
  autoFire,
  waveActive,
  wave,
  waveState,
  scoreRef,
  onWaveCleared,
  hudRef,
  reticleRef,
  scoreChipRef,
}: {
  controls: ControlInput
  flight: FlightState
  external: { current: ExternalState }
  /** True while the fire button / Space / mouse is held. */
  fireHeldRef: { current: boolean }
  tuning: Tuning
  colliders: readonly Collider[]
  weather: Weather
  windRef: { current: { x: number; y: number } }
  targets: TargetState[]
  combat: CombatState
  /** Shared aim offset (gyro fine-aim + recoil) — also read by the camera. */
  aimRef: { current: AimOffset }
  weapon: WeaponSpec
  assist: AimAssistLevel
  autoFire: boolean
  waveActive: boolean
  wave: number
  waveState: string
  /** Session score — runtime-only, rendered via the telemetry tick. */
  scoreRef: { current: number }
  onWaveCleared: () => void
  hudRef: RefObject<HTMLDivElement | null>
  reticleRef: RefObject<HTMLDivElement | null>
  scoreChipRef: RefObject<HTMLDivElement | null>
}) {
  const outerRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const hudClock = useRef(0)
  const events = useRef(createHitEvents()).current
  const fireDir = useRef<Vec3>({ x: 0, y: 0, z: -1 }).current
  const muzzle = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const aimPoint = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const lockIdxRef = useRef(-1)
  const lockHold = useRef(0)
  const clearedSent = useRef(false)

  useFrame(({ clock }, dt) => {
    if (!waveActive) clearedSent.current = false
    pollGamepad(external.current, controls)

    const wind = windRef.current
    if (weather === 'storm') {
      sampleWind(clock.elapsedTime, wind)
    } else {
      wind.x = 0
      wind.y = 0
    }

    stepFlight(
      flight,
      controls,
      dt,
      colliders,
      weather === 'storm' ? wind : undefined,
      'hold',
      tuning,
    )

    // Targets drift deterministically off the canvas clock.
    for (const t of targets) {
      stepDrift(t, clock.elapsedTime)
      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt)
    }

    // Aim direction = the FPV camera forward (minus recoil, which is a
    // visual kick only): yaw + gentle tilt follow + the gyro offset.
    const aim = aimRef.current
    const pitch = flight.tiltPitch * FPV_PITCH_GAIN + aim.pitch
    const yaw = flight.yaw + aim.yaw
    const cosP = Math.cos(pitch)
    fireDir.x = -Math.sin(yaw) * cosP
    fireDir.y = Math.sin(pitch)
    fireDir.z = -Math.cos(yaw) * cosP

    // Reticle lock: nearest angular match inside the assist cone.
    const lockIdx = findLockTarget(
      flight.pos,
      fireDir,
      targets,
      colliders,
      AIM_CONE_RAD[assist],
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

    // Fire intent: held trigger (button/Space/mouse/gamepad) or auto-fire
    // after the lock has held steady. One cooldown for both — auto-fire is a
    // convenience, not a rate buff.
    combat.cooldown = Math.max(0, combat.cooldown - dt)
    const wantsFire =
      waveActive &&
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
      } else {
        vibrate(HIT_PULSE)
      }
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
      tilt.rotation.x = flight.tiltPitch
      tilt.rotation.z = flight.tiltRoll
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
        hud.dataset.wave = String(wave)
        hud.dataset.waveState = waveState
        hud.dataset.score = String(scoreRef.current)
        hud.dataset.shots = String(combat.shots)
        hud.dataset.hits = String(combat.hits)
        hud.dataset.targetsLeft = String(left)
        hud.dataset.lock = String(lockIdxRef.current)
        let proj = 0
        for (const p of combat.player) if (p.active) proj++
        hud.dataset.proj = String(proj)
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
