/**
 * Pure combat model for the Drone Strike widget — no React, no three.js.
 *
 * Projectiles live in pre-allocated pools and are stepped in place; every
 * moving bolt is tested as the SEGMENT prev→pos each frame (a point test
 * would tunnel: bolt speed × MAX_DT is metres per step, larger than most
 * targets). World occlusion reuses the drone sim's `boomClipT` slab test;
 * targets are swept spheres via `segmentSphereT`.
 *
 * Weapon behaviour is pure config (`WeaponSpec`): the shipped weapon is a
 * fast tracer bolt; a hitscan laser is the same step with the whole
 * origin→maxRange segment resolved on the spawn frame, and a ballistic
 * variant is `gravity > 0` in the same integrator — see docs/drone-strike.md.
 */
import type { Collider, Vec3 } from '../droneSim/flightModel'
import { boomClipT } from '../droneSim/flightModel'

export type WeaponKind = 'bolt' | 'laser' | 'ballistic'

export interface WeaponSpec {
  kind: WeaponKind
  /** Muzzle speed, world-units/s. */
  speed: number
  /** Seconds between shots (shared by manual and auto fire). */
  cooldown: number
  /** Downward acceleration; 0 for the flat-flying bolt. */
  gravity: number
  /** Bolts despawn beyond this flight distance. */
  maxRange: number
  /** Visible tracer length, world units. */
  tracerLen: number
}

/** The player's gun: fast enough to feel snappy, slow enough that leading
 * a drifting target matters. */
export const BOLT: WeaponSpec = {
  kind: 'bolt',
  speed: 55,
  cooldown: 0.22,
  gravity: 0,
  maxRange: 90,
  tracerLen: 1.4,
}

/** Enemy return fire (wave 5+): slow and dodgeable by design. */
export const ENEMY_BOLT: WeaponSpec = {
  kind: 'bolt',
  speed: 14,
  cooldown: 2.5,
  gravity: 0,
  maxRange: 70,
  tracerLen: 1.0,
}

export const MAX_PLAYER_PROJECTILES = 24
export const MAX_ENEMY_PROJECTILES = 16

export interface Projectile {
  active: boolean
  pos: Vec3
  /** Position at the start of the frame — the swept-segment origin. */
  prev: Vec3
  vel: Vec3
  age: number
  /** Seconds of flight after which the bolt despawns (range/speed). */
  maxAge: number
}

export interface CombatState {
  player: Projectile[]
  enemy: Projectile[]
  /** Seconds until the player's gun can fire again. */
  cooldown: number
  shots: number
  hits: number
}

function createProjectile(): Projectile {
  return {
    active: false,
    pos: { x: 0, y: 0, z: 0 },
    prev: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    age: 0,
    maxAge: 0,
  }
}

export function createCombatState(): CombatState {
  return {
    player: Array.from({ length: MAX_PLAYER_PROJECTILES }, createProjectile),
    enemy: Array.from({ length: MAX_ENEMY_PROJECTILES }, createProjectile),
    cooldown: 0,
    shots: 0,
    hits: 0,
  }
}

export function resetCombatState(c: CombatState): void {
  clearProjectiles(c)
  c.cooldown = 0
  c.shots = 0
  c.hits = 0
}

/** Despawn every bolt in flight (wave transitions) — stats stay. */
export function clearProjectiles(c: CombatState): void {
  for (const p of c.player) p.active = false
  for (const p of c.enemy) p.active = false
}

/** Anything a bolt can hit: targets and (for enemy fire) the player drone. */
export interface Hittable {
  alive: boolean
  pos: Vec3
  radius: number
}

export interface HitEvent {
  kind: 'target' | 'world' | 'player'
  /** Index into the targets array for kind 'target'; -1 otherwise. */
  targetIdx: number
  x: number
  y: number
  z: number
}

/** Fixed-capacity event ring reused every frame — reset count, never realloc. */
export interface HitEvents {
  count: number
  items: HitEvent[]
}

const MAX_HIT_EVENTS = MAX_PLAYER_PROJECTILES + MAX_ENEMY_PROJECTILES

export function createHitEvents(): HitEvents {
  return {
    count: 0,
    items: Array.from({ length: MAX_HIT_EVENTS }, () => ({
      kind: 'world' as const,
      targetIdx: -1,
      x: 0,
      y: 0,
      z: 0,
    })),
  }
}

function pushHit(
  events: HitEvents,
  kind: HitEvent['kind'],
  targetIdx: number,
  x: number,
  y: number,
  z: number,
): void {
  if (events.count >= events.items.length) return
  const e = events.items[events.count++]
  e.kind = kind
  e.targetIdx = targetIdx
  e.x = x
  e.y = y
  e.z = z
}

/**
 * Fire a bolt from `origin` along unit `dir`. Returns false when the pool is
 * exhausted (the oldest shots simply keep flying — never steal a live bolt).
 */
export function spawnProjectile(
  pool: Projectile[],
  origin: Vec3,
  dir: Vec3,
  weapon: WeaponSpec,
): boolean {
  for (const p of pool) {
    if (p.active) continue
    p.active = true
    p.pos.x = origin.x
    p.pos.y = origin.y
    p.pos.z = origin.z
    p.prev.x = origin.x
    p.prev.y = origin.y
    p.prev.z = origin.z
    p.vel.x = dir.x * weapon.speed
    p.vel.y = dir.y * weapon.speed
    p.vel.z = dir.z * weapon.speed
    p.age = 0
    p.maxAge = weapon.maxRange / weapon.speed
    return true
  }
  return false
}

/**
 * Earliest t ∈ [0, 1] where the segment from→to enters the sphere at
 * (cx, cy, cz) with radius r, or Infinity on a miss. A segment starting
 * inside the sphere hits at t = 0.
 */
export function segmentSphereT(
  from: Vec3,
  to: Vec3,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const fx = from.x - cx
  const fy = from.y - cy
  const fz = from.z - cz
  const c = fx * fx + fy * fy + fz * fz - r * r
  if (c <= 0) return 0 // started inside
  const a = dx * dx + dy * dy + dz * dz
  if (a === 0) return Infinity
  const b = 2 * (fx * dx + fy * dy + fz * dz)
  const disc = b * b - 4 * a * c
  if (disc < 0) return Infinity
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t >= 0 && t <= 1 ? t : Infinity
}

/**
 * One frame for a projectile pool. Integrates each active bolt, then resolves
 * the earliest hit along its swept segment: building (boomClipT), ground,
 * any alive target sphere, or — for enemy bolts — the player drone sphere.
 * Hits are appended to `events`; the caller applies game consequences.
 */
export function stepProjectiles(
  pool: Projectile[],
  weapon: WeaponSpec,
  dt: number,
  colliders: readonly Collider[],
  targets: readonly Hittable[],
  playerPos: Vec3 | null,
  playerRadius: number,
  events: HitEvents,
): void {
  for (const p of pool) {
    if (!p.active) continue
    p.prev.x = p.pos.x
    p.prev.y = p.pos.y
    p.prev.z = p.pos.z
    p.vel.y -= weapon.gravity * dt
    p.pos.x += p.vel.x * dt
    p.pos.y += p.vel.y * dt
    p.pos.z += p.vel.z * dt
    p.age += dt

    // Earliest hit along the swept segment wins.
    let bestT = Infinity
    let bestKind: HitEvent['kind'] = 'world'
    let bestIdx = -1

    const tWorld = boomClipT(p.prev, p.pos, colliders)
    if (tWorld < 1) {
      bestT = tWorld
      bestKind = 'world'
    }
    // Ground plane.
    if (p.pos.y <= 0 && p.prev.y > 0) {
      const tGround = p.prev.y / (p.prev.y - p.pos.y)
      if (tGround < bestT) {
        bestT = tGround
        bestKind = 'world'
      }
    }
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      if (!t.alive) continue
      const hitT = segmentSphereT(p.prev, p.pos, t.pos.x, t.pos.y, t.pos.z, t.radius)
      if (hitT < bestT) {
        bestT = hitT
        bestKind = 'target'
        bestIdx = i
      }
    }
    if (playerPos) {
      const hitT = segmentSphereT(
        p.prev,
        p.pos,
        playerPos.x,
        playerPos.y,
        playerPos.z,
        playerRadius,
      )
      if (hitT < bestT) {
        bestT = hitT
        bestKind = 'player'
        bestIdx = -1
      }
    }

    if (bestT <= 1) {
      p.active = false
      pushHit(
        events,
        bestKind,
        bestIdx,
        p.prev.x + (p.pos.x - p.prev.x) * bestT,
        p.prev.y + (p.pos.y - p.prev.y) * bestT,
        p.prev.z + (p.pos.z - p.prev.z) * bestT,
      )
      continue
    }
    if (p.age >= p.maxAge) p.active = false
  }
}

/* ------------------------------ aim assist ------------------------------ */

export type AimAssistLevel = 'off' | 'mild' | 'strong'

export const coerceAimAssist = (v: unknown): AimAssistLevel | undefined =>
  v === 'off' || v === 'mild' || v === 'strong' ? v : undefined

/** Lock-cone half-angle (radians) per assist level. Every level keeps a
 * small cone so the reticle can still telegraph "on target". */
export const AIM_CONE_RAD: Record<AimAssistLevel, number> = {
  off: 0.02,
  mild: 0.06,
  strong: 0.11,
}

/** The scoped (ADS) cone — about half of the hip cone per level: the 2×
 * view doubles apparent precision, so the assist demands it back. */
export const AIM_CONE_RAD_ZOOM: Record<AimAssistLevel, number> = {
  off: 0.01,
  mild: 0.03,
  strong: 0.055,
}

/** How far the fired bolt bends toward the locked target (0..1). The
 * magnetism bends the bolt, never the camera. */
export const AIM_BEND: Record<AimAssistLevel, number> = {
  off: 0,
  mild: 0.35,
  strong: 0.6,
}

/**
 * The target the reticle is on: smallest angular error inside the cone
 * (widened by each target's angular size), line-of-sight checked against the
 * buildings, within weapon range. Returns the target index or -1.
 */
export function findLockTarget(
  camPos: Vec3,
  dir: Vec3,
  targets: readonly Hittable[],
  colliders: readonly Collider[],
  coneRad: number,
  maxRange: number,
): number {
  let best = -1
  let bestErr = Infinity
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (!t.alive) continue
    const dx = t.pos.x - camPos.x
    const dy = t.pos.y - camPos.y
    const dz = t.pos.z - camPos.z
    const dist = Math.hypot(dx, dy, dz)
    if (dist === 0 || dist > maxRange) continue
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist
    if (dot <= 0) continue
    const angle = Math.acos(Math.min(1, dot))
    // The cone is generous by the target's angular radius: grazing the
    // silhouette counts as "on target".
    const err = angle - Math.atan2(t.radius, dist)
    if (err > coneRad || err >= bestErr) continue
    if (boomClipT(camPos, t.pos, colliders) < 1) continue // occluded
    best = i
    bestErr = err
  }
  return best
}

/** Bend `dir` (unit, in place) toward `aimPoint` by `strength` 0..1. */
export function bendAim(
  dir: Vec3,
  from: Vec3,
  aimPoint: Vec3,
  strength: number,
): void {
  if (strength <= 0) return
  const dx = aimPoint.x - from.x
  const dy = aimPoint.y - from.y
  const dz = aimPoint.z - from.z
  const len = Math.hypot(dx, dy, dz)
  if (len === 0) return
  dir.x += (dx / len - dir.x) * strength
  dir.y += (dy / len - dir.y) * strength
  dir.z += (dz / len - dir.z) * strength
  const norm = Math.hypot(dir.x, dir.y, dir.z)
  if (norm > 0) {
    dir.x /= norm
    dir.y /= norm
    dir.z /= norm
  }
}

/** First-order intercept: where to aim so a bolt at `projSpeed` meets a
 * target moving at `tVel`. Writes into `out` (allocation-free). */
export function leadPoint(
  shooter: Vec3,
  tPos: Vec3,
  tVel: Vec3,
  projSpeed: number,
  out: Vec3,
): void {
  const dist = Math.hypot(tPos.x - shooter.x, tPos.y - shooter.y, tPos.z - shooter.z)
  const time = dist / projSpeed
  out.x = tPos.x + tVel.x * time
  out.y = tPos.y + tVel.y * time
  out.z = tPos.z + tVel.z * time
}

/** Auto-fire only triggers after the reticle has held a lock this long. */
export const AUTO_FIRE_HOLD_S = 0.12
