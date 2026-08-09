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
/** How a projectile is drawn — a *visual* tag independent of the ballistic
 * `kind`. `'bolt'` is the stretched tracer box (Tracers); `'rocket'` is the
 * warhead + smoke trail (EnemyRockets). Defaults to `'bolt'`. */
export type ProjectileVisual = 'bolt' | 'rocket'

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
  /** How a spawned projectile is drawn (defaults to `'bolt'`). */
  projectile?: ProjectileVisual
  /** Projectiles per trigger pull (default 1). >1 = a shotgun-style fan,
   * spread by `pelletDir`. */
  pellets?: number
  /** Fan half-angle (radians) for multi-pellet weapons. */
  spread?: number
  /** Max turn rate (radians/s) toward the projectile's locked target — a
   * homing missile. 0/absent = no steering. */
  homing?: number
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

/** Enemy return fire (wave 5+): slow and dodgeable by design. Used by drones
 * and AA turrets. */
export const ENEMY_BOLT: WeaponSpec = {
  kind: 'bolt',
  speed: 14,
  cooldown: 2.5,
  gravity: 0,
  maxRange: 70,
  tracerLen: 1.0,
}

/** Rooftop Bazooka Joe soldier: launches a slow rocket you can see incoming
 * and dodge (drawn as a warhead + smoke trail by EnemyRockets). */
export const SOLDIER_ROCKET: WeaponSpec = {
  kind: 'bolt',
  speed: 16,
  cooldown: 3,
  gravity: 0,
  maxRange: 75,
  tracerLen: 1.4,
  projectile: 'rocket',
}

/** Rooftop Scar soldier: an SMG — faster, shorter-cadence bolt bursts from
 * the muzzle (drawn as the tracer box like other bolts). */
export const SOLDIER_SMG: WeaponSpec = {
  kind: 'bolt',
  speed: 40,
  cooldown: 1.4,
  gravity: 0,
  maxRange: 70,
  tracerLen: 1.2,
  projectile: 'bolt',
}

/** The player's hitscan laser: the whole origin→maxRange segment resolves on
 * the spawn frame (`fireHitscan`), so `speed` is nominal (it only sets the SFX
 * character). Balanced by HEAT, not fire rate — but the cooldown is a real
 * fire *tick* (never 0: a per-frame trigger would make DPS and heat gain
 * frame-rate-dependent and the e2e nondeterministic). */
export const LASER: WeaponSpec = {
  kind: 'laser',
  speed: 300,
  cooldown: 0.09,
  gravity: 0,
  maxRange: 80,
  tracerLen: 0,
}

/** The ballistic lob: `gravity > 0` in the same integrator (`stepProjectiles`
 * already applies it), so the shell arcs — aim above the target. Slower and
 * heavier-cadenced than the bolt; paired with the `TrajectoryArc` hint
 * because pure gravity drop frustrates on touch. */
export const LOB: WeaponSpec = {
  kind: 'ballistic',
  speed: 28,
  cooldown: 0.5,
  gravity: 14,
  maxRange: 100,
  tracerLen: 0.9,
}

/** The pump shotgun: one trigger pull fans `pellets` short-range bolts
 * through the same integrator/sweep as any bolt (each pellet does bolt
 * damage, so a point-blank fan can multi-hit one target). Slow pump cadence
 * balances it; the fan itself comes from the deterministic `pelletDir`. */
export const SHOTGUN: WeaponSpec = {
  kind: 'bolt',
  speed: 45,
  cooldown: 0.9,
  gravity: 0,
  maxRange: 45,
  tracerLen: 0.6,
  pellets: 7,
  spread: 0.09,
}

/** Homing missiles: slow rockets (drawn with the warhead + smoke-contrail
 * visual) that STEER toward the target locked at fire time — turn rate
 * capped at `homing` rad/s, so a hard-strafing target can still shake one.
 * Fired without a lock they fly straight. Heavy 1.3 s cadence balances the
 * tracking. */
export const HOMING: WeaponSpec = {
  kind: 'bolt',
  speed: 20,
  cooldown: 1.3,
  gravity: 0,
  maxRange: 90,
  tracerLen: 0,
  projectile: 'rocket',
  homing: 1.8,
}

/** The persisted weapon-picker ids (crate pickups reuse the same ids). */
export type WeaponId = 'bolt' | 'laser' | 'lob' | 'shotgun' | 'homing'
/** Picker/scroll order — the weapon chip and the 1–5 hotkeys index this. */
export const WEAPON_IDS: readonly WeaponId[] = ['bolt', 'laser', 'lob', 'shotgun', 'homing']
/** What a crate can grant — every special (everything but the default). */
export type CrateWeaponId = Exclude<WeaponId, 'bolt'>

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  bolt: BOLT,
  laser: LASER,
  lob: LOB,
  shotgun: SHOTGUN,
  homing: HOMING,
}

export const coerceWeapon = (v: unknown): WeaponId | undefined =>
  v === 'bolt' || v === 'laser' || v === 'lob' || v === 'shotgun' || v === 'homing'
    ? v
    : undefined

/** Golden angle (radians) — even ring coverage without randomness. */
const GOLDEN = 2.399963229728653

/**
 * Direction of pellet `index` in a `count`-pellet fan around unit `dir`:
 * pellet 0 flies true, the rest ring the axis at golden-angle azimuths and
 * index-jittered radii up to `spread` radians — deterministic (no
 * Math.random), so suites can assert the exact fan. Writes into `out`
 * (allocation-free) and returns it.
 */
export function pelletDir(
  dir: Vec3,
  index: number,
  spread: number,
  out: Vec3,
): Vec3 {
  if (index === 0) {
    out.x = dir.x
    out.y = dir.y
    out.z = dir.z
    return out
  }
  // Orthonormal basis perpendicular to dir (fall back off the world-up axis
  // when aiming straight up/down).
  let rx = -dir.z
  let ry = 0
  let rz = dir.x
  let rl = Math.hypot(rx, ry, rz)
  if (rl < 1e-6) {
    rx = 1
    ry = 0
    rz = 0
    rl = 1
  }
  rx /= rl
  ry /= rl
  rz /= rl
  // up = dir × right
  const ux = dir.y * rz - dir.z * ry
  const uy = dir.z * rx - dir.x * rz
  const uz = dir.x * ry - dir.y * rx
  const az = index * GOLDEN
  const jitter = index * 0.618
  const r = spread * (0.45 + 0.55 * (jitter - Math.floor(jitter)))
  const ox = Math.cos(az) * r
  const oy = Math.sin(az) * r
  out.x = dir.x + rx * ox + ux * oy
  out.y = dir.y + ry * ox + uy * oy
  out.z = dir.z + rz * ox + uz * oy
  const len = Math.hypot(out.x, out.y, out.z)
  out.x /= len
  out.y /= len
  out.z /= len
  return out
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
  /** How to draw it — set from the firing weapon's `projectile` (default
   * `'bolt'`). Lets one enemy pool render as a mix of bolts and rockets. */
  visual: ProjectileVisual
  /** Index into the targets array a homing weapon steers toward; -1 = none
   * (flies straight). Cleared when the target dies mid-flight. */
  targetIdx: number
}

export interface CombatState {
  player: Projectile[]
  enemy: Projectile[]
  /** Seconds until the player's gun can fire again. */
  cooldown: number
  shots: number
  hits: number
  /** Laser heat, 0–100. Each shot adds HEAT_PER_SHOT; cools when not firing. */
  heat: number
  /** Latched at 100 heat — the gun is offline until heat falls to HEAT_RESET. */
  overheated: boolean
}

function createProjectile(): Projectile {
  return {
    active: false,
    pos: { x: 0, y: 0, z: 0 },
    prev: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    age: 0,
    maxAge: 0,
    visual: 'bolt',
    targetIdx: -1,
  }
}

export function createCombatState(): CombatState {
  return {
    player: Array.from({ length: MAX_PLAYER_PROJECTILES }, createProjectile),
    enemy: Array.from({ length: MAX_ENEMY_PROJECTILES }, createProjectile),
    cooldown: 0,
    shots: 0,
    hits: 0,
    heat: 0,
    overheated: false,
  }
}

export function resetCombatState(c: CombatState): void {
  clearProjectiles(c)
  c.cooldown = 0
  c.shots = 0
  c.hits = 0
  c.heat = 0
  c.overheated = false
}

/** Despawn every bolt in flight (wave transitions) — stats stay. */
export function clearProjectiles(c: CombatState): void {
  for (const p of c.player) p.active = false
  for (const p of c.enemy) p.active = false
}

/* -------------------------------- heat ---------------------------------- */

/** Heat added per laser shot. */
export const HEAT_PER_SHOT = 7
/** Cooling rate, heat units/s (always cooling — firing just outpaces it). */
export const HEAT_COOL = 26
export const HEAT_MAX = 100
/** The overheat latch clears once heat falls back to this (hysteresis, the
 * battery-revive pattern — no flickering at the threshold). */
export const HEAT_RESET = 30

export type HeatEvent = 'overheated' | 'ready'

/** One laser shot's heat. Returns 'overheated' the instant the latch trips. */
export function addHeat(c: CombatState): HeatEvent | null {
  c.heat = Math.min(HEAT_MAX, c.heat + HEAT_PER_SHOT)
  if (c.heat >= HEAT_MAX && !c.overheated) {
    c.overheated = true
    return 'overheated'
  }
  return null
}

/** Cool the gun each frame; clears the overheat latch at HEAT_RESET and
 * reports 'ready' once (the battery-event pattern — the caller banners it). */
export function stepHeat(c: CombatState, dt: number): HeatEvent | null {
  if (c.heat <= 0) return null
  c.heat = Math.max(0, c.heat - HEAT_COOL * dt)
  if (c.overheated && c.heat <= HEAT_RESET) {
    c.overheated = false
    return 'ready'
  }
  return null
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
  targetIdx = -1,
): boolean {
  for (const p of pool) {
    if (p.active) continue
    p.active = true
    p.targetIdx = targetIdx
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
    p.visual = weapon.projectile ?? 'bolt'
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
    // Homing: steer toward the locked target at a capped turn rate (constant
    // speed, nlerp of the direction — close enough to a true arc and cheap).
    // A dead target releases the missile to fly straight on.
    if (weapon.homing && p.targetIdx >= 0) {
      const t = targets[p.targetIdx]
      if (!t || !t.alive) {
        p.targetIdx = -1
      } else {
        const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z)
        let dx = t.pos.x - p.pos.x
        let dy = t.pos.y - p.pos.y
        let dz = t.pos.z - p.pos.z
        const dist = Math.hypot(dx, dy, dz)
        if (speed > 0 && dist > 1e-6) {
          dx /= dist
          dy /= dist
          dz /= dist
          const inv = 1 / speed
          const cx = p.vel.x * inv
          const cy = p.vel.y * inv
          const cz = p.vel.z * inv
          const dot = Math.max(-1, Math.min(1, cx * dx + cy * dy + cz * dz))
          const angle = Math.acos(dot)
          if (angle > 1e-5) {
            const k = Math.min(1, (weapon.homing * dt) / angle)
            let nx = cx + (dx - cx) * k
            let ny = cy + (dy - cy) * k
            let nz = cz + (dz - cz) * k
            const nl = Math.hypot(nx, ny, nz)
            if (nl > 1e-6) {
              nx /= nl
              ny /= nl
              nz /= nl
              p.vel.x = nx * speed
              p.vel.y = ny * speed
              p.vel.z = nz * speed
            }
          }
        }
      }
    }
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

/* ------------------------------- hitscan -------------------------------- */

/** A hitscan shot's outcome — a caller-owned scratch object (mutate in place,
 * allocation-free). At most ONE hit per shot, so no event ring: the rig feeds
 * this straight through its shared player-hit consequence path, and the beam
 * renderer uses (x, y, z) as the beam end point. */
export interface HitscanResult {
  /** 'target' | 'world', or null when the beam flew out to maxRange. */
  hit: 'target' | 'world' | null
  /** Index into the targets array for a 'target' hit; -1 otherwise. */
  targetIdx: number
  /** Beam end: the impact point, or origin + dir·maxRange on a miss. */
  x: number
  y: number
  z: number
}

export function createHitscanResult(): HitscanResult {
  return { hit: null, targetIdx: -1, x: 0, y: 0, z: 0 }
}

/** Scratch segment endpoints reused by every hitscan (allocation-free). */
const SCAN_FROM: Vec3 = { x: 0, y: 0, z: 0 }
const SCAN_TO: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * Fire a hitscan weapon: resolve the ENTIRE origin → origin + dir·maxRange
 * segment on the spawn frame through the exact tests `stepProjectiles` sweeps
 * a moving bolt with (building slabs, ground plane, alive target spheres) —
 * earliest hit wins. Writes the outcome into `out` and returns it.
 */
export function fireHitscan(
  origin: Vec3,
  dir: Vec3,
  weapon: WeaponSpec,
  colliders: readonly Collider[],
  targets: readonly Hittable[],
  out: HitscanResult,
): HitscanResult {
  SCAN_FROM.x = origin.x
  SCAN_FROM.y = origin.y
  SCAN_FROM.z = origin.z
  SCAN_TO.x = origin.x + dir.x * weapon.maxRange
  SCAN_TO.y = origin.y + dir.y * weapon.maxRange
  SCAN_TO.z = origin.z + dir.z * weapon.maxRange

  let bestT = Infinity
  let bestKind: 'target' | 'world' = 'world'
  let bestIdx = -1

  const tWorld = boomClipT(SCAN_FROM, SCAN_TO, colliders)
  if (tWorld < 1) bestT = tWorld
  if (SCAN_TO.y <= 0 && SCAN_FROM.y > 0) {
    const tGround = SCAN_FROM.y / (SCAN_FROM.y - SCAN_TO.y)
    if (tGround < bestT) bestT = tGround
  }
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (!t.alive) continue
    const hitT = segmentSphereT(SCAN_FROM, SCAN_TO, t.pos.x, t.pos.y, t.pos.z, t.radius)
    if (hitT < bestT) {
      bestT = hitT
      bestKind = 'target'
      bestIdx = i
    }
  }

  const hit = bestT <= 1
  const t = hit ? bestT : 1
  out.hit = hit ? bestKind : null
  out.targetIdx = hit && bestKind === 'target' ? bestIdx : -1
  out.x = SCAN_FROM.x + (SCAN_TO.x - SCAN_FROM.x) * t
  out.y = SCAN_FROM.y + (SCAN_TO.y - SCAN_FROM.y) * t
  out.z = SCAN_FROM.z + (SCAN_TO.z - SCAN_FROM.z) * t
  return out
}

/* ---------------------------- trajectory arc ---------------------------- */

/**
 * Sample a weapon's flight path from `origin` along unit `dir` into `out`
 * (xyz triplets), using the SAME integration `stepProjectiles` applies to a
 * live shell (`vy −= gravity·dt` then Euler position) — so the drawn hint IS
 * the real trajectory, not an approximation. Stops at the ground (final point
 * clamped to y = 0) or at the weapon's maxAge. Returns the point count (for
 * `setDrawRange`). Pure + allocation-free: the arc renderer owns `out`.
 */
export function sampleTrajectory(
  origin: Vec3,
  dir: Vec3,
  weapon: WeaponSpec,
  out: Float32Array,
  maxPts: number,
  dtStep: number,
): number {
  let px = origin.x
  let py = origin.y
  let pz = origin.z
  const vx = dir.x * weapon.speed
  let vy = dir.y * weapon.speed
  const vz = dir.z * weapon.speed
  const maxAge = weapon.maxRange / weapon.speed
  out[0] = px
  out[1] = py
  out[2] = pz
  let n = 1
  let age = 0
  while (n < maxPts && age < maxAge) {
    vy -= weapon.gravity * dtStep
    px += vx * dtStep
    py += vy * dtStep
    pz += vz * dtStep
    age += dtStep
    if (py <= 0) {
      out[n * 3] = px
      out[n * 3 + 1] = 0
      out[n * 3 + 2] = pz
      n++
      break
    }
    out[n * 3] = px
    out[n * 3 + 1] = py
    out[n * 3 + 2] = pz
    n++
  }
  return n
}

/* ----------------------------- laser beams ------------------------------ */

/** Seconds a fired laser beam stays visible (fading by thickness). */
export const BEAM_LIFE = 0.12
/** Concurrent visible beams — at the laser's ~11 shots/s tick, 4 suffice;
 * spares keep ring overwrites invisible. */
export const MAX_BEAMS = 8

/** One fired beam: a start→end segment + its age. Plain mutable slots the rig
 * writes (`spawnLaserBeam`) and the LaserBeams renderer ages — the aimRefs
 * pattern (zero React renders). */
export interface LaserBeam {
  active: boolean
  sx: number
  sy: number
  sz: number
  ex: number
  ey: number
  ez: number
  age: number
}

export function createLaserBeams(): LaserBeam[] {
  return Array.from({ length: MAX_BEAMS }, () => ({
    active: false,
    sx: 0,
    sy: 0,
    sz: 0,
    ex: 0,
    ey: 0,
    ez: 0,
    age: 0,
  }))
}

/** Queue a beam from the muzzle to the hitscan end point (ring overwrite —
 * the oldest slot is recycled when all are live). */
export function spawnLaserBeam(
  beams: LaserBeam[],
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ey: number,
  ez: number,
): void {
  let slot = beams[0]
  for (const b of beams) {
    if (!b.active) {
      slot = b
      break
    }
    if (b.age > slot.age) slot = b
  }
  slot.active = true
  slot.sx = sx
  slot.sy = sy
  slot.sz = sz
  slot.ex = ex
  slot.ey = ey
  slot.ez = ez
  slot.age = 0
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
