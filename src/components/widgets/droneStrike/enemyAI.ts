/**
 * Enemy drone AI — a pure module (no React/three, no randomness at step
 * time; everything derives from the seeded wave specs).
 *
 * Movement is an orbit patrol: each enemy circles its spawn anchor at the
 * radius/speed the wave seeded into its drift fields, with a vertical bob.
 * An orbit can never enter a building because wave placement already
 * validated the whole envelope (anchor ± radius) against the city. When the
 * player's reticle settles on an enemy inside EVADE_RANGE it evades:
 * reverses its orbit, speeds up and jinks vertically for a short burst.
 * From ENEMY_FIRE_WAVE enemies return fire — slow, unled, line-of-sight
 * checked bolts that a moving player can dodge.
 */
import type { Collider, Vec3 } from '../droneSim/flightModel'
import { boomClipT } from '../droneSim/flightModel'
import type { Projectile, WeaponSpec } from './combatModel'
import { spawnProjectile } from './combatModel'
import type { TargetState } from './waveLayout'
import { MAX_TARGETS } from './waveLayout'

/** Aiming within this half-angle of an enemy (while close) triggers evasion. */
export const EVADE_CONE = 0.12
export const EVADE_RANGE = 45
/** Seconds of reversed, faster orbit per evasion burst. */
export const EVADE_TIME = 1.2
const EVADE_SPEED_MULT = 2.6
const EVADE_JINK = 1.5
/** Enemies only shoot inside this range (and with clear line of sight). */
export const ENEMY_FIRE_RANGE = 50
const BOB_AMP = 1.2

export interface EnemyAIState {
  angle: number
  dir: 1 | -1
  evadeTimer: number
  fireCooldown: number
}

/** One AI slot per target-pool slot (only 'enemy' slots are ever stepped). */
export function createEnemyAIStates(): EnemyAIState[] {
  return Array.from({ length: MAX_TARGETS }, () => ({
    angle: 0,
    dir: 1 as const,
    evadeTimer: 0,
    fireCooldown: 0,
  }))
}

/** Re-seed the AI slots from a freshly loaded wave. The stagger on the
 * first-shot cooldown keeps a pack from firing in one volley. */
export function seedEnemyAIStates(
  states: EnemyAIState[],
  targets: readonly TargetState[],
): void {
  for (let i = 0; i < states.length; i++) {
    const ai = states[i]
    const t = targets[i]
    ai.angle = t.driftPhase
    ai.dir = 1
    ai.evadeTimer = 0
    ai.fireCooldown = 1.5 + (i % 3) * 0.8
  }
}

/**
 * One frame for one enemy: orbit/evade movement (position + true velocity,
 * so shot leading sees the real motion) and, when armed, return fire into
 * the enemy projectile pool.
 */
export function stepEnemy(
  t: TargetState,
  ai: EnemyAIState,
  index: number,
  dt: number,
  playerPos: Vec3,
  /** The player's current aim direction (unit) — evasion trigger. */
  aimDir: Vec3,
  colliders: readonly Collider[],
  canShoot: boolean,
  enemyPool: Projectile[],
  weapon: WeaponSpec,
): void {
  if (!t.alive || t.kind !== 'enemy') return

  const dx = t.pos.x - playerPos.x
  const dy = t.pos.y - playerPos.y
  const dz = t.pos.z - playerPos.z
  const dist = Math.hypot(dx, dy, dz)

  // Evade when the player is drawing a bead on us.
  if (dist > 0 && dist < EVADE_RANGE && ai.evadeTimer <= 0) {
    const dot = (dx * aimDir.x + dy * aimDir.y + dz * aimDir.z) / dist
    if (dot > 0 && Math.acos(Math.min(1, dot)) < EVADE_CONE + Math.atan2(t.radius, dist)) {
      ai.evadeTimer = EVADE_TIME
      ai.dir = ai.dir === 1 ? -1 : 1
    }
  }

  const evading = ai.evadeTimer > 0
  if (evading) ai.evadeTimer -= dt
  const angSpeed = t.driftSpeed * (evading ? EVADE_SPEED_MULT : 1)
  ai.angle += ai.dir * angSpeed * dt

  const prevX = t.pos.x
  const prevY = t.pos.y
  const prevZ = t.pos.z
  const orbitR = t.driftAmp
  const bob =
    Math.sin(ai.angle * 2.3) * BOB_AMP +
    (evading ? Math.sin(ai.evadeTimer * 8) * EVADE_JINK : 0)
  t.pos.x = t.base.x + Math.cos(ai.angle) * orbitR
  t.pos.y = t.base.y + bob
  t.pos.z = t.base.z + Math.sin(ai.angle) * orbitR
  if (dt > 0) {
    t.vel.x = (t.pos.x - prevX) / dt
    t.vel.y = (t.pos.y - prevY) / dt
    t.vel.z = (t.pos.z - prevZ) / dt
  }

  // Return fire: slow, aimed at where the player IS (not led — dodgeable),
  // only with a clear line of sight.
  if (!canShoot) return
  ai.fireCooldown -= dt
  if (ai.fireCooldown > 0 || dist === 0 || dist > ENEMY_FIRE_RANGE) return
  if (boomClipT(t.pos, playerPos, colliders) < 1) return
  const inv = 1 / dist
  FIRE_DIR.x = -dx * inv
  FIRE_DIR.y = -dy * inv
  FIRE_DIR.z = -dz * inv
  spawnProjectile(enemyPool, t.pos, FIRE_DIR, weapon)
  ai.fireCooldown = weapon.cooldown + (index % 3) * 0.4
}

/** Scratch vector reused by every return-fire spawn (allocation-free loop). */
const FIRE_DIR: Vec3 = { x: 0, y: 0, z: -1 }
