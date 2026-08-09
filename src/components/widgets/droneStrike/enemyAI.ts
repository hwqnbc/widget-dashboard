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
import { MAX_TARGETS, SOLDIER_PLANT_TAIL, soldierPlantHold } from './waveLayout'

/** Aiming within this half-angle of an enemy (while close) triggers evasion. */
export const EVADE_CONE = 0.12
export const EVADE_RANGE = 45
const EVADE_JINK = 1.5
/** Enemies only shoot inside this range (and with clear line of sight). */
export const ENEMY_FIRE_RANGE = 50
const BOB_AMP = 1.2

/* Kamikaze chaser tuning (`variant === 1` enemies). A chaser LURKS on its
 * orbit until the player comes inside CHASER_RANGE, then commits: it flies
 * straight at the player at a capped speed and detonates on contact (the rig
 * owns the detonation). It never fires — the ram is the threat. */
export const CHASER_RANGE = 60
/** Base pursuit speed (u/s), scaled by `move.chaseMult` (difficulty × wave
 * aggression) — tuned to pressure, not outrun, a piloted drone. */
export const CHASER_SPEED = 7
/** Centre-to-centre detonation distance (player sphere + chaser body). */
export const CHASER_CONTACT_R = 1.2
/** Chasers never dive below this altitude (no ground scraping). */
const CHASER_MIN_Y = 1
/** Seconds a soldier's firing pose (recoil / muzzle flash / launch) plays
 * after each shot; SoldierTargets normalises the countdown for the model. */
export const SOLDIER_FIRE_CLIP = 0.5
/** Soldier muzzle offset from the torso hit-sphere (`t.pos`): forward along
 * the aim + a small lift, so the shot leaves the raised weapon, not the chest. */
const SOLDIER_MUZZLE_FWD = 0.7
const SOLDIER_MUZZLE_UP = 0.25

export interface EnemyAIState {
  angle: number
  dir: 1 | -1
  evadeTimer: number
  fireCooldown: number
  /** Kamikaze commitment: set the first time a chaser triggers, never
   * cleared — once a chaser breaks off its orbit it stays committed (it
   * HOVERS, not re-orbits, while the player is pad-safe; see stepEnemy). */
  locked: boolean
}

/** One AI slot per target-pool slot (only 'enemy' slots are ever stepped). */
export function createEnemyAIStates(): EnemyAIState[] {
  return Array.from({ length: MAX_TARGETS }, () => ({
    angle: 0,
    dir: 1 as const,
    evadeTimer: 0,
    fireCooldown: 0,
    locked: false,
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
    ai.locked = false
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
  /** Difficulty + wave movement scaling: orbit rate, evade burst, the
   * vertical evade jink (`jinkScale`, 1 = full; low early waves make the
   * drone a near-static hover), and the chaser pursuit multiplier. */
  move: {
    orbitMult: number
    evadeMult: number
    evadeTime: number
    jinkScale?: number
    chaseMult?: number
  },
  /** Chasers pursue only while this is true (false while the player rests on
   * the spawn pad — the sanctuary rule the return fire already follows). */
  canChase = true,
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
      ai.evadeTimer = move.evadeTime
      ai.dir = ai.dir === 1 ? -1 : 1
    }
  }

  const evading = ai.evadeTimer > 0
  if (evading) ai.evadeTimer -= dt
  const angSpeed = t.driftSpeed * move.orbitMult * (evading ? move.evadeMult : 1)
  ai.angle += ai.dir * angSpeed * dt

  const prevX = t.pos.x
  const prevY = t.pos.y
  const prevZ = t.pos.z
  // A chaser (`variant === 1`) LURKS on its orbit until the player first
  // comes inside CHASER_RANGE, then commits (`ai.locked`) and pursues.
  if (t.variant === 1 && !ai.locked && canChase && dist > 0 && dist < CHASER_RANGE) {
    ai.locked = true
  }
  if (t.variant === 1 && ai.locked) {
    if (canChase && dist > 0) {
      // CHASE: integrate straight toward the player at a capped speed. Clip
      // the step against the buildings (boomClipT) — a blocked chaser CLIMBS
      // straight up instead (every building has a top), so it can never fly
      // into geometry even though its path leaves the placement-validated
      // orbit envelope.
      const speed = CHASER_SPEED * (move.chaseMult ?? 1)
      const step = Math.min(speed * dt, dist)
      const inv = 1 / dist
      DESIRED.x = t.pos.x - dx * inv * step
      DESIRED.y = Math.max(CHASER_MIN_Y, t.pos.y - dy * inv * step)
      DESIRED.z = t.pos.z - dz * inv * step
      if (boomClipT(t.pos, DESIRED, colliders) < 1) {
        t.pos.y += speed * dt
      } else {
        t.pos.x = DESIRED.x
        t.pos.y = DESIRED.y
        t.pos.z = DESIRED.z
      }
    } else {
      // HOVER: the player is pad-safe. Hold position (small bob) — falling
      // back to the absolute orbit write would TELEPORT the drone onto its
      // ring, because the orbit is parametrized, not integrated.
      t.pos.y = Math.max(CHASER_MIN_Y, prevY + Math.sin(ai.angle * 2.3) * BOB_AMP * dt)
    }
  } else {
    const orbitR = t.driftAmp
    const bob =
      Math.sin(ai.angle * 2.3) * BOB_AMP +
      (evading ? Math.sin(ai.evadeTimer * 8) * EVADE_JINK * (move.jinkScale ?? 1) : 0)
    t.pos.x = t.base.x + Math.cos(ai.angle) * orbitR
    t.pos.y = t.base.y + bob
    t.pos.z = t.base.z + Math.sin(ai.angle) * orbitR
  }
  if (dt > 0) {
    t.vel.x = (t.pos.x - prevX) / dt
    t.vel.y = (t.pos.y - prevY) / dt
    t.vel.z = (t.pos.z - prevZ) / dt
  }

  // Return fire: slow, aimed at where the player IS (not led — dodgeable),
  // only with a clear line of sight. Chasers never fire — the ram IS the
  // threat (and it telegraphs their role).
  if (t.variant === 1) return
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

/**
 * One frame for one static emplacement — an AA turret OR a rooftop soldier:
 * no movement, just the return-fire half of `stepEnemy`. When armed, within
 * range and with a clear line of sight, it fires a slow bolt at the player
 * (unled, so a moving drone can dodge it). Shares the `fireCooldown` slot.
 * Both kinds are stationed shooters with identical fire behaviour, so they
 * share this step; the soldier differs only in how it renders (SoldierTargets).
 */
export function stepTurret(
  t: TargetState,
  ai: EnemyAIState,
  index: number,
  dt: number,
  playerPos: Vec3,
  colliders: readonly Collider[],
  canShoot: boolean,
  enemyPool: Projectile[],
  weapon: WeaponSpec,
): void {
  if (!t.alive || (t.kind !== 'turret' && t.kind !== 'soldier' && t.kind !== 'jet')) return
  if (!canShoot) return

  const dx = t.pos.x - playerPos.x
  const dy = t.pos.y - playerPos.y
  const dz = t.pos.z - playerPos.z
  const dist = Math.hypot(dx, dy, dz)

  ai.fireCooldown -= dt
  // A clear shot = in range with an unobstructed line (the LOS raycast only runs
  // once in range). Rocket soldiers use it to PLANT a beat before the shot (halt
  // + kneel windup) and hold through it, so the launch reads as a deliberate
  // planted rocket; StrikeRig freezes the patrol while `plantTimer > 0`.
  const hasShot = dist > 0 && dist <= ENEMY_FIRE_RANGE && boomClipT(t.pos, playerPos, colliders) >= 1
  if (t.kind === 'soldier') {
    t.plantTimer = soldierPlantHold(t.variant, hasShot, ai.fireCooldown, t.plantTimer)
  }
  if (ai.fireCooldown > 0 || !hasShot) return
  const inv = 1 / dist
  FIRE_DIR.x = -dx * inv
  FIRE_DIR.y = -dy * inv
  FIRE_DIR.z = -dz * inv
  // Soldiers and jet troopers fire from the raised weapon's muzzle (forward +
  // up of the torso), not the chest, and play their firing pose (fireTimer
  // drives the model's flash/recoil via the pool's AimPose); the static AA
  // turret keeps its own origin (`t.pos`).
  if (t.kind === 'soldier' || t.kind === 'jet') {
    MUZZLE.x = t.pos.x + FIRE_DIR.x * SOLDIER_MUZZLE_FWD
    MUZZLE.y = t.pos.y + FIRE_DIR.y * SOLDIER_MUZZLE_FWD + SOLDIER_MUZZLE_UP
    MUZZLE.z = t.pos.z + FIRE_DIR.z * SOLDIER_MUZZLE_FWD
    spawnProjectile(enemyPool, MUZZLE, FIRE_DIR, weapon)
    t.fireTimer = SOLDIER_FIRE_CLIP
    // Keep the rocketeer planted through the shot's kneel-read before it stands.
    if (t.kind === 'soldier' && t.variant === 0) t.plantTimer = Math.max(t.plantTimer, SOLDIER_PLANT_TAIL)
  } else {
    spawnProjectile(enemyPool, t.pos, FIRE_DIR, weapon)
  }
  ai.fireCooldown = weapon.cooldown + (index % 3) * 0.4
}

/** Scratch vector reused by every return-fire spawn (allocation-free loop). */
const FIRE_DIR: Vec3 = { x: 0, y: 0, z: -1 }
/** Scratch chaser step endpoint (allocation-free pursuit). */
const DESIRED: Vec3 = { x: 0, y: 0, z: 0 }
/** Scratch muzzle position for soldier fire (allocation-free). */
const MUZZLE: Vec3 = { x: 0, y: 0, z: 0 }
