/**
 * Pure shell/combat model for Tank Battle — pooled ballistic projectiles,
 * swept as SEGMENTS each frame (lesson #42: a point test tunnels), resolved
 * against the terrain heightfield, target hit-spheres and the player.
 *
 * Shells are deliberately slow and arced (gravity > 0): a 1–2 s flight at
 * range plus the contour is the skill — lobbing over a crest onto a hull is
 * the tank shot. Splash damage on ground impact keeps near-misses relevant.
 * Enemy shells are slower, splashless and unled — dodgeable by driving,
 * the Drone Strike fairness rule.
 */
import type { Vec3 } from '../droneSim/flightModel'
import type { TerrainSpec } from './terrain'
import { heightAt } from './terrain'

export interface ShellSpec {
  /** Muzzle speed, u/s. */
  speed: number
  /** Seconds between shots (the reload). */
  cooldown: number
  /** Downward acceleration — the arc. */
  gravity: number
  /** Max flight distance before despawn. */
  maxRange: number
  /** Visible tracer length. */
  tracerLen: number
  /** Ground-impact splash radius (0 = direct hits only). */
  splash: number
}

/** The player's cannon: one deliberate shot, then a real reload. */
export const SHELL: ShellSpec = {
  speed: 34,
  cooldown: 2.4,
  gravity: 10,
  maxRange: 95,
  tracerLen: 1.1,
  splash: 3.2,
}

/** Enemy return fire: slower, no splash, aimed at where you WERE. */
export const ENEMY_SHELL: ShellSpec = {
  speed: 26,
  cooldown: 3.4,
  gravity: 10,
  maxRange: 90,
  tracerLen: 1.0,
  splash: 0,
}

export const MAX_PLAYER_SHELLS = 8
export const MAX_ENEMY_SHELLS = 14

/** Hit-sphere centre height above a tank's ground position (turret mass). */
export const TARGET_CENTER_Y = 1.1
/** Player hit sphere — generous so dodging is driving skill, not pixels. */
export const PLAYER_HIT_RADIUS = 1.9

export interface Shell {
  active: boolean
  pos: Vec3
  prev: Vec3
  vel: Vec3
  age: number
  maxAge: number
}

export interface ShellCombat {
  player: Shell[]
  enemy: Shell[]
  /** Seconds until the player's gun reloads. */
  cooldown: number
  shots: number
  hits: number
}

function createShell(): Shell {
  return {
    active: false,
    pos: { x: 0, y: 0, z: 0 },
    prev: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    age: 0,
    maxAge: 0,
  }
}

export function createShellCombat(): ShellCombat {
  return {
    player: Array.from({ length: MAX_PLAYER_SHELLS }, createShell),
    enemy: Array.from({ length: MAX_ENEMY_SHELLS }, createShell),
    cooldown: 0,
    shots: 0,
    hits: 0,
  }
}

export function resetShellCombat(c: ShellCombat): void {
  clearShells(c)
  c.cooldown = 0
  c.shots = 0
  c.hits = 0
}

export function clearShells(c: ShellCombat): void {
  for (const s of c.player) s.active = false
  for (const s of c.enemy) s.active = false
}

/** Anything a shell can hit directly: `pos` is the GROUND position; the hit
 * sphere is centred TARGET_CENTER_Y above it. */
export interface TankHittable {
  alive: boolean
  pos: Vec3
  radius: number
}

export interface ShellHit {
  kind: 'target' | 'world' | 'player'
  targetIdx: number
  x: number
  y: number
  z: number
}

export interface ShellHits {
  count: number
  items: ShellHit[]
}

const MAX_HITS = MAX_PLAYER_SHELLS + MAX_ENEMY_SHELLS

export function createShellHits(): ShellHits {
  return {
    count: 0,
    items: Array.from({ length: MAX_HITS }, () => ({
      kind: 'world' as const,
      targetIdx: -1,
      x: 0,
      y: 0,
      z: 0,
    })),
  }
}

function pushHit(
  events: ShellHits,
  kind: ShellHit['kind'],
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

export function spawnShell(
  pool: Shell[],
  origin: Vec3,
  dir: Vec3,
  spec: ShellSpec,
): boolean {
  for (const s of pool) {
    if (s.active) continue
    s.active = true
    s.pos.x = origin.x
    s.pos.y = origin.y
    s.pos.z = origin.z
    s.prev.x = origin.x
    s.prev.y = origin.y
    s.prev.z = origin.z
    s.vel.x = dir.x * spec.speed
    s.vel.y = dir.y * spec.speed
    s.vel.z = dir.z * spec.speed
    s.age = 0
    // Arcs fly longer than the straight-line range; pad the lifetime.
    s.maxAge = (spec.maxRange / spec.speed) * 1.8
    return true
  }
  return false
}

/** Earliest t ∈ [0,1] where segment from→to enters the sphere (copied from
 * the strike combatModel so the games' pure modules stay independent). */
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
  if (c <= 0) return 0
  const a = dx * dx + dy * dy + dz * dz
  if (a === 0) return Infinity
  const b = 2 * (fx * dx + fy * dy + fz * dz)
  const disc = b * b - 4 * a * c
  if (disc < 0) return Infinity
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t >= 0 && t <= 1 ? t : Infinity
}

/** Earliest t where the segment dips under the heightfield — sampled march,
 * fine because shell steps are short (≤ ~1.7 u) and the terrain is smooth. */
function segmentTerrainT(spec: TerrainSpec, from: Vec3, to: Vec3): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const len = Math.hypot(dx, dy, dz)
  const n = Math.max(1, Math.ceil(len / 0.6))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    if (heightAt(spec, from.x + dx * t, from.z + dz * t) >= from.y + dy * t) {
      return Math.max(0, (i - 0.5) / n)
    }
  }
  return Infinity
}

/**
 * One frame for a shell pool: integrate under gravity, then resolve each
 * shell's swept segment against terrain, targets and (for enemy shells) the
 * player. Earliest hit wins; consequences (damage, splash) are the caller's.
 */
export function stepShells(
  pool: Shell[],
  spec: ShellSpec,
  dt: number,
  terrain: TerrainSpec,
  targets: readonly TankHittable[],
  playerPos: Vec3 | null,
  events: ShellHits,
): void {
  for (const s of pool) {
    if (!s.active) continue
    s.prev.x = s.pos.x
    s.prev.y = s.pos.y
    s.prev.z = s.pos.z
    s.vel.y -= spec.gravity * dt
    s.pos.x += s.vel.x * dt
    s.pos.y += s.vel.y * dt
    s.pos.z += s.vel.z * dt
    s.age += dt

    let bestT = Infinity
    let bestKind: ShellHit['kind'] = 'world'
    let bestIdx = -1

    const tGround = segmentTerrainT(terrain, s.prev, s.pos)
    if (tGround < bestT) {
      bestT = tGround
      bestKind = 'world'
    }
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      if (!t.alive) continue
      const hitT = segmentSphereT(
        s.prev,
        s.pos,
        t.pos.x,
        t.pos.y + TARGET_CENTER_Y,
        t.pos.z,
        t.radius,
      )
      if (hitT < bestT) {
        bestT = hitT
        bestKind = 'target'
        bestIdx = i
      }
    }
    if (playerPos) {
      const hitT = segmentSphereT(
        s.prev,
        s.pos,
        playerPos.x,
        playerPos.y + TARGET_CENTER_Y,
        playerPos.z,
        PLAYER_HIT_RADIUS,
      )
      if (hitT < bestT) {
        bestT = hitT
        bestKind = 'player'
        bestIdx = -1
      }
    }

    if (bestT <= 1) {
      s.active = false
      pushHit(
        events,
        bestKind,
        bestIdx,
        s.prev.x + (s.pos.x - s.prev.x) * bestT,
        s.prev.y + (s.pos.y - s.prev.y) * bestT,
        s.prev.z + (s.pos.z - s.prev.z) * bestT,
      )
      continue
    }
    if (s.age >= s.maxAge) s.active = false
  }
}

/* ------------------------------ aim assist ------------------------------ */

export type AimAssistLevel = 'off' | 'mild' | 'strong'

export const coerceAimAssist = (v: unknown): AimAssistLevel | undefined =>
  v === 'off' || v === 'mild' || v === 'strong' ? v : undefined

/** Lock-cone half-angle per assist level (hip / scoped). */
export const AIM_CONE_RAD: Record<AimAssistLevel, number> = {
  off: 0.02,
  mild: 0.06,
  strong: 0.11,
}
export const AIM_CONE_RAD_ZOOM: Record<AimAssistLevel, number> = {
  off: 0.01,
  mild: 0.03,
  strong: 0.055,
}

/** How far the fired shell bends toward the locked target — bends the
 * SHELL, never the camera (no steering theft). */
export const AIM_BEND: Record<AimAssistLevel, number> = {
  off: 0,
  mild: 0.35,
  strong: 0.6,
}

/** Auto-fire triggers after the reticle holds a lock this long (given a
 * loaded gun and a valid ballistic solution). */
export const AUTO_FIRE_HOLD_S = 0.15

const losFrom: Vec3 = { x: 0, y: 0, z: 0 }
const losTo: Vec3 = { x: 0, y: 0, z: 0 }

/** Terrain-occlusion-checked line of sight between two elevated points. */
export function tankLOS(
  terrain: TerrainSpec,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  losFrom.x = ax
  losFrom.y = ay
  losFrom.z = az
  losTo.x = bx
  losTo.y = by
  losTo.z = bz
  // Local import avoided (module cycle-free): terrainClearT lives in terrain.
  return clearT(terrain, losFrom, losTo) >= 1
}

// Minimal march (duplicating terrainClearT's core keeps this module's only
// dependency on terrain.ts the heightAt function).
function clearT(spec: TerrainSpec, from: Vec3, to: Vec3): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  const n = Math.max(2, Math.ceil(len / 1.2))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    if (heightAt(spec, from.x + dx * t, from.z + dz * t) + 0.35 >= from.y + dy * t) {
      return (i - 0.5) / n
    }
  }
  return 1
}

/**
 * The target the reticle is on: smallest angular error inside the cone
 * (widened by the target's angular size), terrain-occlusion checked, within
 * range. Angles are measured against the hit-sphere CENTRE (ground + offset).
 */
export function findTankLock(
  eye: Vec3,
  dir: Vec3,
  targets: readonly TankHittable[],
  terrain: TerrainSpec,
  coneRad: number,
  maxRange: number,
): number {
  let best = -1
  let bestErr = Infinity
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (!t.alive) continue
    const cy = t.pos.y + TARGET_CENTER_Y
    const dx = t.pos.x - eye.x
    const dy = cy - eye.y
    const dz = t.pos.z - eye.z
    const dist = Math.hypot(dx, dy, dz)
    if (dist === 0 || dist > maxRange) continue
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist
    if (dot <= 0) continue
    const angle = Math.acos(Math.min(1, dot))
    const err = angle - Math.atan2(t.radius, dist)
    if (err > coneRad || err >= bestErr) continue
    if (!tankLOS(terrain, eye.x, eye.y, eye.z, t.pos.x, cy, t.pos.z)) continue
    best = i
    bestErr = err
  }
  return best
}

/** Bend `dir` (unit, in place) toward `aimPoint` by `strength` 0..1 —
 * assist magnetism bends the shell, never the camera. */
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

/** First-order intercept for a moving target (writes into `out`). */
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
