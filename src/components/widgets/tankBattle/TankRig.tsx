import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { ControlInput, Tuning, Vec3 } from '../droneSim/flightModel'
import { damp } from '../droneSim/flightModel'
import type { ExternalState } from '../droneSim/externalInput'
import { pollGamepad } from '../droneSim/externalInput'
import { CRASH_PULSE, vibrate } from '../droneSim/haptics'
import type { AimOffset } from '../droneStrike/aimModel'
import { ZOOM_SENS } from '../droneStrike/aimModel'
import type { TerrainSpec } from './terrain'
import { aimPointOnTerrain } from './terrain'
import type { CamAim, TankState } from './tankModel'
import {
  CAM_BOOM,
  CAM_PITCH_MAX,
  CAM_PITCH_MIN,
  CAM_PIVOT_Y,
  BARREL_PITCH_MAX,
  TANK_THUD_SPEED,
  TURRET_HEIGHT,
  camForward,
  fireSolution,
  muzzlePos,
  stepCamAim,
  stepTank,
  stepTurret,
  turretWorldYaw,
} from './tankModel'
import type { AimAssistLevel, ShellCombat } from './shellModel'
import {
  AIM_BEND,
  AIM_CONE_RAD,
  AIM_CONE_RAD_ZOOM,
  AUTO_FIRE_HOLD_S,
  ENEMY_SHELL,
  SHELL,
  TARGET_CENTER_Y,
  bendAim,
  createShellHits,
  findTankLock,
  leadPoint,
  spawnShell,
  stepShells,
} from './shellModel'
import type { TankTargetState } from './battleLayout'
import { aliveTankCount } from './battleLayout'
import type { TankAIState } from './tankAI'
import { stepEnemyTank } from './tankAI'
import type { BattleMode } from './battleLayout'
import TankModel3D from './TankModel3D'
import { PLAYER_TANK_COLORS } from './tankColors'

/** Seconds between HUD DOM writes (~7 Hz — no React renders). */
const HUD_INTERVAL = 0.15
/** Cannon recoil camera kick (bigger gun than the drone's bolt). */
const RECOIL_KICK = 0.035
/** Haptics. */
const FIRE_PULSE = [18, 12, 30]
const HIT_PULSE = 20
const KILL_PULSE = [25, 30, 45]
const THUD_COOLDOWN_S = 0.5
/** Direct hit / splash damage to a target. */
const DIRECT_DAMAGE = 2
const SPLASH_DAMAGE = 1
/** Enemy shells never hit other enemies (no friendly fire). */
const NO_TARGETS: TankTargetState[] = []

function gamepadFireHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    return Boolean(pad.buttons[7]?.pressed || pad.buttons[5]?.pressed)
  }
  return false
}

function gamepadZoomHeld(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    return Boolean(pad.buttons[6]?.pressed)
  }
  return false
}

/**
 * The Tank Battle sim loop. Every frame: poll external input, step the
 * camera aim + hull driving + turret traverse, resolve the reticle's aim
 * point and ballistic solution, apply fire intent against the reload, step
 * the enemy FSMs, sweep both shell pools, detect the battle clearing, pose
 * the player tank and throttle-write the data-* telemetry contract.
 */
export default function TankRig({
  controls,
  tank,
  camAim,
  aimOffset,
  external,
  fireHeldRef,
  tuning,
  terrain,
  targets,
  tankAI,
  enemiesShoot,
  combat,
  assist,
  autoFire,
  autoTurn,
  battleActive,
  mode,
  wave,
  hp,
  zoom,
  onZoomHold,
  scoreRef,
  onCleared,
  onTargetDown,
  onPlayerHit,
  hudRef,
  reticleRef,
  scoreChipRef,
  minimapTankRef,
  minimapTargetRefs,
}: {
  controls: ControlInput
  tank: TankState
  camAim: CamAim
  aimOffset: { current: AimOffset }
  external: { current: ExternalState }
  fireHeldRef: { current: boolean }
  /** speed = drive multiplier, yaw = traverse/aim multiplier, expo = sticks. */
  tuning: Tuning
  terrain: TerrainSpec
  targets: TankTargetState[]
  tankAI: TankAIState[]
  enemiesShoot: boolean
  combat: ShellCombat
  assist: AimAssistLevel
  autoFire: boolean
  /** Hull follows the camera heading while driving (manual steer overrides). */
  autoTurn: boolean
  battleActive: boolean
  mode: BattleMode
  wave: number
  hp: number
  zoom: boolean
  onZoomHold: (held: boolean) => void
  scoreRef: { current: number }
  onCleared: () => void
  onTargetDown: (points: number) => void
  onPlayerHit: () => void
  hudRef: RefObject<HTMLDivElement | null>
  reticleRef: RefObject<HTMLDivElement | null>
  scoreChipRef: RefObject<HTMLDivElement | null>
  minimapTankRef: RefObject<SVGGElement | null>
  minimapTargetRefs: RefObject<(SVGCircleElement | null)[]>
}) {
  const outerRef = useRef<Group>(null)
  const turretRef = useRef<Group>(null)
  const barrelRef = useRef<Group>(null)
  const hudClock = useRef(0)
  const events = useRef(createShellHits()).current
  const eye = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const fwd = useRef<Vec3>({ x: 0, y: 0, z: -1 }).current
  const aimPoint = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const fireDir = useRef<Vec3>({ x: 0, y: 0, z: -1 }).current
  const muzzle = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const shooter = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const targetCenter = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current
  const lockIdxRef = useRef(-1)
  const solRef = useRef(true)
  const lockHold = useRef(0)
  const clearedSent = useRef(false)
  /** The clear check only arms after this active phase has actually shown
   * live targets. The canvas is a separate React root, so its props lag the
   * body's synchronous pool mutations by a frame — a restart that empties
   * the pool would otherwise read as "cleared" against a stale
   * battleActive=true prop. */
  const seenAlive = useRef(false)
  const padZoomRef = useRef(false)
  const thudCooldown = useRef(0)

  useFrame((_, dt) => {
    if (!battleActive) {
      clearedSent.current = false
      seenAlive.current = false
    }
    pollGamepad(external.current, controls)

    const padZoom = gamepadZoomHeld()
    if (padZoom !== padZoomRef.current) {
      padZoomRef.current = padZoom
      onZoomHold(padZoom)
    }

    // Camera aim (right stick / arrows / gamepad right stick), scoped rates
    // halved — a 2× view magnifies motion.
    const aimSens = tuning.yaw * (zoom ? ZOOM_SENS : 1)
    stepCamAim(camAim, controls, dt, aimSens, tuning.expo)

    // Total aim = stick orbit + gyro offset (recoil stays visual-only).
    const off = aimOffset.current
    const totalYaw = camAim.yaw + off.yaw
    const totalPitch = Math.min(
      CAM_PITCH_MAX,
      Math.max(CAM_PITCH_MIN, camAim.pitch + off.pitch),
    )

    // Hull driving (left stick / WASD); auto-turn feeds the camera heading
    // as the hull-yaw target while driving forward with no manual steer.
    const impact = stepTank(
      tank,
      controls,
      dt,
      terrain,
      {
        speed: tuning.speed,
        yaw: 1,
        expo: tuning.expo,
      },
      autoTurn ? totalYaw : null,
    )
    thudCooldown.current = Math.max(0, thudCooldown.current - dt)
    if (impact > TANK_THUD_SPEED && thudCooldown.current === 0) {
      thudCooldown.current = THUD_COOLDOWN_S
      vibrate(Math.min(60, Math.round(impact * 10)))
    }

    // Turret chases the camera yaw (gyro offset included, recoil excluded —
    // recoil is a visual kick only, the strike rule).
    stepTurret(tank, totalYaw, dt, tuning.yaw)

    // The reticle ray: eye behind the pivot, forward along the aim.
    camForward(totalYaw, totalPitch, fwd)
    eye.x = tank.pos.x - fwd.x * CAM_BOOM
    eye.y = tank.pos.y + CAM_PIVOT_Y - fwd.y * CAM_BOOM
    eye.z = tank.pos.z - fwd.z * CAM_BOOM

    // Lock + aim point: locked → first-order lead on the target's centre;
    // free → wherever the reticle ray strikes the terrain.
    const cone = (zoom ? AIM_CONE_RAD_ZOOM : AIM_CONE_RAD)[assist]
    const lockIdx = findTankLock(eye, fwd, targets, terrain, cone, SHELL.maxRange)
    if (lockIdx >= 0) {
      const t = targets[lockIdx]
      shooter.x = tank.pos.x
      shooter.y = tank.pos.y + TURRET_HEIGHT
      shooter.z = tank.pos.z
      targetCenter.x = t.pos.x
      targetCenter.y = t.pos.y + TARGET_CENTER_Y
      targetCenter.z = t.pos.z
      leadPoint(shooter, targetCenter, t.vel, SHELL.speed, aimPoint)
    } else {
      aimPointOnTerrain(terrain, eye, fwd, SHELL.maxRange, aimPoint)
    }

    // Automatic gun elevation: solve the low arc onto the aim point. No
    // in-arc solution (target tucked under a crest, or beyond reach) greys
    // the reticle — but the gun still fires at its maximum arc along the
    // aim heading (tank games let you lob at the horizon; refusing the
    // trigger reads as a broken button).
    const solution = fireSolution(
      tank,
      aimPoint,
      SHELL.speed,
      SHELL.gravity,
      fireDir,
      muzzle,
    )
    if (!solution) {
      camForward(totalYaw, BARREL_PITCH_MAX, fireDir)
      muzzlePos(tank.pos, totalYaw, BARREL_PITCH_MAX, muzzle)
    }

    // Reticle feedback — imperative writes only on state changes.
    if (lockIdx !== lockIdxRef.current || solution !== solRef.current) {
      if (lockIdx !== lockIdxRef.current) lockHold.current = 0
      lockIdxRef.current = lockIdx
      solRef.current = solution
      const reticle = reticleRef.current
      if (reticle) {
        reticle.dataset.lock = String(lockIdx)
        reticle.dataset.sol = solution ? 'ok' : 'none'
        const color = !solution
          ? 'rgba(160,160,160,0.55)'
          : lockIdx >= 0
            ? '#ffb300'
            : 'rgba(255,255,255,0.75)'
        reticle.style.borderColor = color
        reticle.style.color = !solution
          ? 'rgba(160,160,160,0.6)'
          : lockIdx >= 0
            ? '#ffb300'
            : 'rgba(255,255,255,0.9)'
        reticle.style.transform = lockIdx >= 0 && solution ? 'scale(1.18)' : 'scale(1)'
      }
    } else if (lockIdx >= 0) {
      lockHold.current += dt
    }

    // Barrel visual chases the live solution.
    tank.barrelPitch = damp(
      tank.barrelPitch,
      solution ? Math.asin(Math.min(1, Math.max(-1, fireDir.y))) : 0.04,
      8,
      dt,
    )

    // Fire intent: held trigger or auto-fire on a settled lock (auto-fire
    // does insist on a real solution — it should never lob into a hill).
    combat.cooldown = Math.max(0, combat.cooldown - dt)
    const wantsFire =
      battleActive &&
      (fireHeldRef.current ||
        gamepadFireHeld() ||
        (autoFire && solution && lockIdx >= 0 && lockHold.current >= AUTO_FIRE_HOLD_S))
    if (wantsFire && combat.cooldown === 0) {
      if (solution) bendAim(fireDir, muzzle, aimPoint, AIM_BEND[assist])
      if (spawnShell(combat.player, muzzle, fireDir, SHELL)) {
        combat.cooldown = SHELL.cooldown
        combat.shots++
        off.recoil += RECOIL_KICK
        vibrate(FIRE_PULSE)
      }
    }

    // Enemy tanks: patrol/engage/attack — alive slots only. They keep
    // patrolling between waves; they only shoot while the battle is live.
    const canShoot = battleActive && enemiesShoot
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      stepEnemyTank(t, tankAI[i], i, dt, terrain, tank.pos, canShoot, combat.enemy, ENEMY_SHELL)
      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt)
    }

    // Player shells: direct hits + ground splash.
    events.count = 0
    stepShells(combat.player, SHELL, dt, terrain, targets, null, events)
    for (let i = 0; i < events.count; i++) {
      const e = events.items[i]
      if (e.kind === 'target') {
        const t = targets[e.targetIdx]
        if (t.alive) {
          combat.hits++
          damageTarget(t, DIRECT_DAMAGE, scoreRef, onTargetDown)
        }
      } else if (e.kind === 'world' && SHELL.splash > 0) {
        let splashed = false
        for (const t of targets) {
          if (!t.alive) continue
          const d = Math.hypot(
            e.x - t.pos.x,
            e.y - (t.pos.y + TARGET_CENTER_Y),
            e.z - t.pos.z,
          )
          if (d < SHELL.splash + t.radius * 0.5) {
            splashed = true
            damageTarget(t, SPLASH_DAMAGE, scoreRef, onTargetDown)
          }
        }
        if (splashed) combat.hits++
      }
    }

    // Enemy shells vs the player hull.
    events.count = 0
    stepShells(
      combat.enemy,
      ENEMY_SHELL,
      dt,
      terrain,
      NO_TARGETS,
      battleActive ? tank.pos : null,
      events,
    )
    for (let i = 0; i < events.count; i++) {
      if (events.items[i].kind !== 'player') continue
      vibrate(CRASH_PULSE)
      off.recoil += 0.05
      onPlayerHit()
    }

    if (battleActive) {
      const alive = aliveTankCount(targets)
      if (alive > 0) {
        seenAlive.current = true
      } else if (seenAlive.current && !clearedSent.current) {
        clearedSent.current = true
        onCleared()
      }
    }

    // Pose the player tank.
    const outer = outerRef.current
    if (outer) {
      outer.position.set(tank.pos.x, tank.pos.y, tank.pos.z)
      outer.rotation.order = 'YXZ'
      outer.rotation.y = tank.hullYaw
      outer.rotation.x = tank.pitch
      outer.rotation.z = tank.roll
    }
    const turret = turretRef.current
    if (turret) turret.rotation.y = tank.turretRel
    const barrel = barrelRef.current
    if (barrel) barrel.rotation.x = -tank.barrelPitch

    // Throttled telemetry — the HUD text and the e2e data-* contract.
    hudClock.current += dt
    if (hudClock.current >= HUD_INTERVAL) {
      hudClock.current = 0
      const hud = hudRef.current
      if (hud) {
        const speed = Math.abs(tank.speed)
        const left = aliveTankCount(targets)
        const reloading = combat.cooldown > 0.05
        hud.textContent = `SPD ${speed.toFixed(1)} · ${reloading ? 'RELOADING' : 'GUN READY'} · TGT ${left}`
        hud.dataset.x = tank.pos.x.toFixed(2)
        hud.dataset.z = tank.pos.z.toFixed(2)
        hud.dataset.alt = tank.pos.y.toFixed(2)
        hud.dataset.speed = speed.toFixed(1)
        hud.dataset.hullYaw = tank.hullYaw.toFixed(3)
        hud.dataset.turretYaw = turretWorldYaw(tank).toFixed(3)
        hud.dataset.camYaw = totalYaw.toFixed(3)
        hud.dataset.camPitch = totalPitch.toFixed(3)
        hud.dataset.pitch = tank.pitch.toFixed(3)
        hud.dataset.roll = tank.roll.toFixed(3)
        hud.dataset.score = String(scoreRef.current)
        hud.dataset.shots = String(combat.shots)
        hud.dataset.hits = String(combat.hits)
        hud.dataset.targetsLeft = String(left)
        hud.dataset.lock = String(lockIdxRef.current)
        hud.dataset.sol = solRef.current ? 'ok' : 'none'
        hud.dataset.reload = combat.cooldown.toFixed(2)
        let proj = 0
        for (const s of combat.player) if (s.active) proj++
        hud.dataset.proj = String(proj)
        let enemyProj = 0
        for (const s of combat.enemy) if (s.active) enemyProj++
        hud.dataset.enemyProj = String(enemyProj)
        hud.dataset.hp = String(hp)
        hud.dataset.zoom = zoom ? 'on' : 'off'
        hud.dataset.inputSource = external.current.owner ?? 'touch'
        // Nearest alive enemy — the closed-loop aim beacon (lesson #45).
        let nearest: TankTargetState | null = null
        let nearestDist = Infinity
        for (const t of targets) {
          if (!t.alive) continue
          const d = Math.hypot(t.pos.x - tank.pos.x, t.pos.z - tank.pos.z)
          if (d < nearestDist) {
            nearestDist = d
            nearest = t
          }
        }
        if (nearest) {
          hud.dataset.tgtX = nearest.pos.x.toFixed(2)
          hud.dataset.tgtY = (nearest.pos.y + TARGET_CENTER_Y).toFixed(2)
          hud.dataset.tgtZ = nearest.pos.z.toFixed(2)
          hud.dataset.tgtKind = nearest.heavy ? 'heavy' : 'tank'
        } else {
          hud.dataset.tgtKind = 'none'
        }
      }
      const chip = scoreChipRef.current
      if (chip) {
        const left = aliveTankCount(targets)
        chip.textContent =
          mode === 'waves'
            ? `WAVE ${wave} · SCORE ${scoreRef.current}`
            : `HUNT ${left} LEFT · SCORE ${scoreRef.current}`
        chip.dataset.score = String(scoreRef.current)
        chip.dataset.wave = String(wave)
        chip.dataset.left = String(left)
      }
      const marker = minimapTankRef.current
      if (marker) {
        marker.setAttribute(
          'transform',
          `translate(${tank.pos.x.toFixed(2)} ${tank.pos.z.toFixed(2)}) rotate(${(
            (-tank.hullYaw * 180) /
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
            el.setAttribute('fill', t.heavy ? '#b388ff' : '#ff5252')
            el.removeAttribute('display')
          } else {
            el.setAttribute('display', 'none')
          }
        }
      }
    }
  })

  return (
    <group ref={outerRef} position={[tank.pos.x, tank.pos.y, tank.pos.z]}>
      <TankModel3D
        colors={PLAYER_TANK_COLORS}
        turretRef={turretRef}
        barrelRef={barrelRef}
      />
      <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.1, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Apply damage to an enemy; kills award points and pop the hit marker. */
function damageTarget(
  t: TankTargetState,
  dmg: number,
  scoreRef: { current: number },
  onTargetDown: (points: number) => void,
): void {
  t.hp -= dmg
  t.hitFlash = 0.3
  if (t.hp <= 0) {
    t.alive = false
    scoreRef.current += t.points
    vibrate(KILL_PULSE)
    onTargetDown(t.points)
  } else {
    vibrate(HIT_PULSE)
  }
}
