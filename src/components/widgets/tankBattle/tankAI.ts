/**
 * Enemy tank AI — a pure module, no randomness at step time (aim scatter is
 * a deterministic hash of the shot index; lesson #30). The classic tank FSM
 * every write-up converges on, kept tiny:
 *
 *   PATROL  — drive a seeded circle around the anchor (throttle only while
 *             roughly facing the next waypoint — tracked vehicles turn
 *             first, then move).
 *   ENGAGE  — player inside range with terrain line of sight: halt, creep
 *             the hull around to face the threat, slew the turret onto the
 *             player at a rate-limited traverse.
 *   ATTACK  — turret aligned + reload done: solve the same ballistics the
 *             player uses toward the player's CURRENT position (unled —
 *             dodgeable by driving, the fairness rule) plus a seeded
 *             scatter that shrinks with wave difficulty.
 *
 * Terrain occlusion works both ways: hull-down behind a crest breaks their
 * lock exactly like it breaks yours.
 */
import type { Vec3 } from '../droneSim/flightModel'
import { MAX_DT, damp } from '../droneSim/flightModel'
import type { TerrainSpec } from './terrain'
import { heightAt } from './terrain'
import type { TankTargetState } from './battleLayout'
import type { Shell, ShellSpec } from './shellModel'
import { spawnShell, tankLOS } from './shellModel'
import {
  MAX_GRADE,
  TURRET_HEIGHT,
  groundPose,
  solveShellPitch,
  wrapAngle,
} from './tankModel'

/** Enemies notice and engage inside this range (with line of sight). */
export const ENGAGE_RANGE = 55
/** Turret must be within this yaw error of the player to fire. */
export const FIRE_ALIGN = 0.06
export const ENEMY_SPEED = 3.2
export const ENEMY_TURN = 1.0
export const ENEMY_TRAVERSE = 1.1
/** Eye/muzzle heights for the LOS checks. */
const LOS_EYE = TURRET_HEIGHT + 0.2

export interface TankAIState {
  /** Patrol waypoint angle on the anchor circle. */
  wpAngle: number
  fireCooldown: number
  /** Deterministic scatter stream index. */
  shotCount: number
  engaged: boolean
}

export function createTankAIStates(n: number): TankAIState[] {
  return Array.from({ length: n }, () => ({
    wpAngle: 0,
    fireCooldown: 0,
    shotCount: 0,
    engaged: false,
  }))
}

/** Re-seed the AI slots from a freshly loaded battle. The stagger keeps a
 * garrison from firing in one synchronized volley. */
export function seedTankAIStates(
  states: TankAIState[],
  targets: readonly TankTargetState[],
): void {
  for (let i = 0; i < states.length; i++) {
    const ai = states[i]
    ai.wpAngle = targets[i].phase
    ai.fireCooldown = 2.5 + (i % 4) * 0.9
    ai.shotCount = i * 7
    ai.engaged = false
  }
}

/** Deterministic pseudo-random in [-1, 1) from an integer stream. */
const hash11 = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}

const scratchPose = { y: 0, pitch: 0, roll: 0 }
const FIRE_DIR: Vec3 = { x: 0, y: 0, z: 0 }
const MUZZLE: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * One frame for one enemy tank. `playerPos` is the player's GROUND position.
 * Movement writes true velocity (shot leading sees real motion).
 */
export function stepEnemyTank(
  t: TankTargetState,
  ai: TankAIState,
  index: number,
  dt: number,
  terrain: TerrainSpec,
  playerPos: Vec3,
  canShoot: boolean,
  enemyPool: Shell[],
  weapon: ShellSpec,
): void {
  if (!t.alive) return
  const step = Math.min(dt, MAX_DT)

  const dx = playerPos.x - t.pos.x
  const dz = playerPos.z - t.pos.z
  const dist = Math.hypot(dx, dz)
  const los =
    dist < ENGAGE_RANGE &&
    tankLOS(
      terrain,
      t.pos.x,
      t.pos.y + LOS_EYE,
      t.pos.z,
      playerPos.x,
      playerPos.y + LOS_EYE,
      playerPos.z,
    )
  ai.engaged = los

  const prevX = t.pos.x
  const prevZ = t.pos.z

  if (los) {
    // ENGAGE: halt, face the threat, slew the turret onto the player.
    t.speed = damp(t.speed, 0, 3, step)
    const yawToPlayer = Math.atan2(-dx, -dz)
    const hullErr = wrapAngle(yawToPlayer - t.hullYaw)
    const hullStep = 0.45 * step
    t.hullYaw = wrapAngle(
      t.hullYaw + Math.min(hullStep, Math.max(-hullStep, hullErr)),
    )
    const turretErr = wrapAngle(yawToPlayer - t.turretYaw)
    const slew = ENEMY_TRAVERSE * step
    t.turretYaw = wrapAngle(
      t.turretYaw + Math.min(slew, Math.max(-slew, turretErr)),
    )

    // ATTACK: aligned + loaded → lob a shell at where the player IS, with
    // seeded scatter (deterministic per shot — no Math.random at step time).
    if (canShoot && t.fires) {
      ai.fireCooldown -= dt
      if (ai.fireCooldown <= 0 && Math.abs(turretErr) < FIRE_ALIGN) {
        ai.shotCount++
        const ex = hash11(ai.shotCount * 3 + index * 101) * t.aimErr
        const ez = hash11(ai.shotCount * 3 + index * 101 + 1) * t.aimErr
        const tx = playerPos.x + ex
        const tz = playerPos.z + ez
        const ty = heightAt(terrain, tx, tz) + 1.0
        MUZZLE.x = t.pos.x + -Math.sin(t.turretYaw) * 2.3
        MUZZLE.y = t.pos.y + TURRET_HEIGHT
        MUZZLE.z = t.pos.z + -Math.cos(t.turretYaw) * 2.3
        const dxz = Math.hypot(tx - MUZZLE.x, tz - MUZZLE.z)
        const pitch = solveShellPitch(weapon.speed, weapon.gravity, dxz, ty - MUZZLE.y)
        if (pitch !== null) {
          t.barrelPitch = pitch
          const cosP = Math.cos(pitch)
          const yaw = Math.atan2(-(tx - MUZZLE.x), -(tz - MUZZLE.z))
          FIRE_DIR.x = -Math.sin(yaw) * cosP
          FIRE_DIR.y = Math.sin(pitch)
          FIRE_DIR.z = -Math.cos(yaw) * cosP
          spawnShell(enemyPool, MUZZLE, FIRE_DIR, weapon)
          ai.fireCooldown = weapon.cooldown + (index % 3) * 0.5
        } else {
          // No ballistic solution (too close under a crest): try again soon.
          ai.fireCooldown = 1.2
        }
      }
    }
  } else {
    // PATROL: circle the anchor — turn toward the waypoint, drive only when
    // roughly facing it, advance the waypoint on arrival.
    const wx = t.anchor.x + Math.cos(ai.wpAngle) * t.patrolR
    const wz = t.anchor.z + Math.sin(ai.wpAngle) * t.patrolR
    const wdx = wx - t.pos.x
    const wdz = wz - t.pos.z
    const wDist = Math.hypot(wdx, wdz)
    if (wDist < 2.5) {
      ai.wpAngle += 1.9
    } else {
      const yawToWp = Math.atan2(-wdx, -wdz)
      const err = wrapAngle(yawToWp - t.hullYaw)
      const turnStep = ENEMY_TURN * step
      t.hullYaw = wrapAngle(
        t.hullYaw + Math.min(turnStep, Math.max(-turnStep, err)),
      )
      const facing = Math.abs(err) < 0.5 ? 1 : 0
      // Same grade rule as the player: uphill scrubs speed.
      const fx = -Math.sin(t.hullYaw)
      const fz = -Math.cos(t.hullYaw)
      const hHere = heightAt(terrain, t.pos.x, t.pos.z)
      const hAhead = heightAt(terrain, t.pos.x + fx * 3, t.pos.z + fz * 3)
      const grade = (hAhead - hHere) / 3
      const slopeScale = grade > 0 ? Math.max(0, 1 - grade / MAX_GRADE) : 1
      t.speed = damp(t.speed, ENEMY_SPEED * facing * slopeScale, 2, step)
      t.pos.x += fx * t.speed * step
      t.pos.z += fz * t.speed * step
    }
    // Turret stows forward, barrel level, while unaware.
    const stow = wrapAngle(t.hullYaw - t.turretYaw)
    const slew = ENEMY_TRAVERSE * 0.6 * step
    t.turretYaw = wrapAngle(
      t.turretYaw + Math.min(slew, Math.max(-slew, stow)),
    )
    t.barrelPitch = damp(t.barrelPitch, 0, 3, step)
  }

  // Grounding + damped attitude, same four-point rule as the player.
  groundPose(terrain, t.pos.x, t.pos.z, t.hullYaw, scratchPose)
  t.pos.y = scratchPose.y
  t.pitch = damp(t.pitch, scratchPose.pitch, 6, step)
  t.roll = damp(t.roll, scratchPose.roll, 6, step)

  if (step > 0) {
    t.vel.x = (t.pos.x - prevX) / step
    t.vel.z = (t.pos.z - prevZ) / step
    t.vel.y = 0
  }
}
