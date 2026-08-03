/**
 * Seeded wave generation for Drone Strike. `buildWave(seed, waveIndex,
 * layout)` deterministically places that wave's targets in the (equally
 * seeded) city — the same widget seed always produces the same campaign, so
 * e2e suites can fly to known targets. Target runtime state lives in a
 * pre-allocated fixed-size pool mutated in place (lesson #30: pure module,
 * no Date.now/Math.random inside step functions).
 *
 * Difficulty curve: waves 1–2 are a pure shooting gallery (static balloons,
 * then drifting ring-drones); ENEMY_WAVE_START adds patrolling enemy drones
 * and ENEMY_FIRE_WAVE arms them. From wave 2 the gallery also seeds ground
 * targets — static supply trucks (`ground`, pure points for the gimbal's
 * look-down) — and from TURRET_WAVE, AA turrets (`turret`, a static ground
 * enemy that fires back up, difficulty-gated like the drones).
 */
import type { Vec3 } from '../droneSim/flightModel'
import { SPAWN, WORLD_HALF } from '../droneSim/flightModel'
import type { WorldLayout } from '../droneSim/worldLayout'

export type TargetKind =
  | 'balloon'
  | 'ringDrone'
  | 'enemy'
  | 'ground'
  | 'turret'
  | 'car'

export interface TargetSpec {
  kind: TargetKind
  x: number
  y: number
  z: number
  radius: number
  /** Sinusoidal drift around the anchor; 0 = static. */
  driftAmp: number
  driftSpeed: number
  driftPhase: number
  driftAxis: 0 | 1 | 2
  hp: number
  points: number
}

export interface WaveSpec {
  index: number
  targets: TargetSpec[]
  enemiesShoot: boolean
}

/** Enemy drones appear from this wave... */
export const ENEMY_WAVE_START = 3
/** ...and shoot back from this one (normal; difficulty shifts it). */
export const ENEMY_FIRE_WAVE = 5
/** Ground supply trucks appear from this wave (static points targets). */
export const GROUND_WAVE_START = 2
/** Moving cars (road-bound) appear from this wave — from the very first
 * wave, gently (see the wave-scaled speed in buildWave). */
export const CAR_WAVE_START = 1
/** AA turrets (static ground enemies that fire back) appear from this wave. */
export const TURRET_WAVE = 4
/** Hard cap on simultaneous targets (perf budget: one InstancedMesh).
 * Sized for the worst case: gallery balloons + drifters + enemy drones +
 * ground trucks + moving cars + AA turrets. Pool + instanced capacity are
 * pre-allocated so headroom is free. */
export const MAX_TARGETS = 24

/** Enemy difficulty — scales how hard the AI drones are to hit and how
 * much pressure they apply. Easy is the default (see widgetCatalog). */
export type Difficulty = 'easy' | 'normal' | 'hard'

export interface DifficultyPreset {
  /** Orbit angular-speed multiplier. */
  orbitMult: number
  /** Evade-burst speed multiplier (normal reproduces the old constant). */
  evadeMult: number
  /** Evade-burst duration, seconds. */
  evadeTime: number
  /** Enemy hit points. */
  enemyHp: number
  /** Max simultaneous enemies at high waves. */
  enemyCap: number
  /** Wave from which enemies return fire. */
  fireWave: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  easy: { orbitMult: 0.4, evadeMult: 1.4, evadeTime: 0.7, enemyHp: 1, enemyCap: 2, fireWave: 7 },
  normal: { orbitMult: 1, evadeMult: 2.6, evadeTime: 1.2, enemyHp: 2, enemyCap: 4, fireWave: ENEMY_FIRE_WAVE },
  hard: { orbitMult: 1.3, evadeMult: 3, evadeTime: 1.4, enemyHp: 2, enemyCap: 4, fireWave: 4 },
}

export const coerceDifficulty = (v: unknown): Difficulty | undefined =>
  v === 'easy' || v === 'normal' || v === 'hard' ? v : undefined

export const POINTS: Record<TargetKind, number> = {
  balloon: 10,
  ringDrone: 15,
  enemy: 25,
  ground: 20,
  turret: 30,
  car: 25,
}

/** Same PRNG as the world builder — copied, not exported from worldLayout,
 * so the two modules stay independent. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MIN_TARGET_GAP = 6
const MIN_FROM_SPAWN = 14
const ALT_MIN = 3
const ALT_MAX = 22

/** Would a target (with its drift envelope) intersect a building? */
function clearOfBuildings(
  layout: WorldLayout,
  x: number,
  y: number,
  z: number,
  reach: number,
): boolean {
  return !layout.buildings.some(
    (b) =>
      Math.abs(x - b.x) < b.w / 2 + reach &&
      Math.abs(z - b.z) < b.d / 2 + reach &&
      b.h > y - reach,
  )
}

/**
 * Build wave `waveIndex` (1-based) for a world seed. Draws from its own
 * PRNG stream (seed ⊕ wave hash) so waves are independent of each other and
 * of the world-builder stream.
 */
export function buildWave(
  seed: number,
  waveIndex: number,
  layout: WorldLayout,
  difficulty: Difficulty = 'normal',
): WaveSpec {
  const diff = DIFFICULTY[difficulty]
  const rand = mulberry32((seed ^ Math.imul(waveIndex, 0x9e3779b1)) >>> 0)
  const targets: TargetSpec[] = []

  const place = (spec: Omit<TargetSpec, 'x' | 'y' | 'z'>): void => {
    if (targets.length >= MAX_TARGETS) return
    // Ground targets (trucks, AA turrets) sit on the deck; their hit-sphere
    // centre rides just above ground rather than in the altitude band.
    const onDeck = spec.kind === 'ground' || spec.kind === 'turret'
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = (rand() * 2 - 1) * (WORLD_HALF - 8)
      const z = (rand() * 2 - 1) * (WORLD_HALF - 8)
      // Keep the whole drift envelope above the ground band.
      const yLo = ALT_MIN + spec.driftAmp
      const y = onDeck ? 1 : yLo + rand() * Math.max(1, ALT_MAX - yLo)
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < MIN_FROM_SPAWN) continue
      const reach = spec.radius + spec.driftAmp + 0.5
      if (!clearOfBuildings(layout, x, y, z, reach)) continue
      if (
        targets.some(
          (t) =>
            Math.hypot(x - t.x, z - t.z) <
            MIN_TARGET_GAP + spec.driftAmp + t.driftAmp,
        )
      ) {
        continue
      }
      targets.push({ ...spec, x, y, z })
      return
    }
    // Sampling exhausted (dense seed): stack a fallback high (or on the deck
    // for ground targets) near the pad approach where nothing can occlude it.
    targets.push({
      ...spec,
      x: 0,
      y: onDeck ? 1 : ALT_MAX + 4 + targets.length,
      z: -10,
      driftAmp: 0,
    })
  }

  // Gallery targets: count and drift scale with the wave, size shrinks.
  const balloons = Math.min(5 + waveIndex, 9)
  const radius = Math.max(0.8, 1.4 - waveIndex * 0.06)
  const drifters = waveIndex >= 2 ? Math.ceil(balloons / 2) : 0
  for (let i = 0; i < balloons; i++) {
    const drifting = i < drifters
    place({
      kind: drifting ? 'ringDrone' : 'balloon',
      radius,
      driftAmp: drifting ? 1.5 + rand() * (1 + waveIndex * 0.3) : 0,
      driftSpeed: drifting ? 0.6 + rand() * 0.8 : 0,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: drifting ? ((Math.floor(rand() * 3) % 3) as 0 | 1 | 2) : 0,
      hp: 1,
      points: drifting ? POINTS.ringDrone : POINTS.balloon,
    })
  }

  // Ground supply trucks (wave 2+): static points targets rewarding the
  // gimbal look-down. Fully difficulty-independent (count AND position), so
  // drawn before the difficulty-gated enemy block keeps their placement
  // identical across Easy/Normal/Hard — pure target practice.
  const trucks =
    waveIndex >= GROUND_WAVE_START
      ? Math.min(2 + Math.floor(waveIndex / 3), 4)
      : 0
  for (let i = 0; i < trucks; i++) {
    place({
      kind: 'ground',
      radius: 1.1,
      driftAmp: 0,
      driftSpeed: 0,
      driftPhase: 0,
      driftAxis: 0,
      hp: 1,
      points: POINTS.ground,
    })
  }

  // Moving cars (wave 3+): road-bound targets that drive the city's lanes,
  // reusing the world's road network + the decorative-traffic motion model
  // (see stepDrift's 'car' branch). Drawn before the difficulty-gated enemy
  // block so their count and road/speed draws stay difficulty-independent.
  const cars =
    layout.roads.length > 0 && waveIndex >= CAR_WAVE_START
      ? Math.min(1 + Math.floor(waveIndex / 3), 3, layout.roads.length)
      : 0
  for (let i = 0; i < cars; i++) {
    if (targets.length >= MAX_TARGETS) break
    const road = layout.roads[i % layout.roads.length]
    const dir = rand() < 0.5 ? 1 : -1
    // Wave-scaled speed: gentle movers early (wave 1 ≈ 2.5–5 u/s) ramping to
    // ≈4–8 by wave 5 — fair to lead as a new mechanic, harder as waves climb.
    const speed = (4 + rand() * 4) * Math.min(1, 0.5 + 0.12 * waveIndex) * dir
    const start = rand() * WORLD_HALF * 2
    // Ride one side of the lane, matching RichWorld's decorative traffic.
    const lane = road.at + (dir > 0 ? 0.8 : -0.8)
    const alongX = road.axis === 'x'
    targets.push({
      kind: 'car',
      // The moving axis is overwritten each frame; the fixed axis is the
      // lane. y ≈ 1 seats the hit sphere just above the deck.
      x: alongX ? 0 : lane,
      y: 1,
      z: alongX ? lane : 0,
      radius: 1,
      driftAmp: 0,
      driftSpeed: speed, // signed → direction of travel
      driftPhase: start, // start offset along the road
      driftAxis: alongX ? 0 : 2,
      hp: 1,
      points: POINTS.car,
    })
  }

  // Enemy drones (wave 3+): placed like targets, moved by the AI at runtime.
  // The drift fields carry their orbit: amp = orbit radius (so placement
  // clears the whole envelope), speed = angular rate, phase = start angle.
  const enemies =
    waveIndex >= ENEMY_WAVE_START
      ? Math.min(waveIndex - ENEMY_WAVE_START + 1, diff.enemyCap)
      : 0
  for (let i = 0; i < enemies; i++) {
    place({
      kind: 'enemy',
      radius: 0.6,
      driftAmp: 4 + rand() * 4,
      driftSpeed: 0.5 + rand() * 0.4,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: 0,
      hp: diff.enemyHp,
      points: POINTS.enemy,
    })
  }

  // AA turrets (TURRET_WAVE+): static ground enemies that fire back up.
  // Gated by difficulty like the drones (count clamped by enemyCap, hp and
  // return fire follow the preset).
  const turrets =
    waveIndex >= TURRET_WAVE
      ? Math.min(1 + Math.floor((waveIndex - TURRET_WAVE) / 2), 2, diff.enemyCap)
      : 0
  for (let i = 0; i < turrets; i++) {
    place({
      kind: 'turret',
      radius: 1,
      driftAmp: 0,
      driftSpeed: 0,
      driftPhase: 0,
      driftAxis: 0,
      hp: diff.enemyHp,
      points: POINTS.turret,
    })
  }

  return { index: waveIndex, targets, enemiesShoot: waveIndex >= diff.fireWave }
}

/* --------------------------- runtime target pool ------------------------- */

export interface TargetState {
  alive: boolean
  kind: TargetKind
  pos: Vec3
  /** Live velocity (drift derivative / AI motion) — feeds shot leading. */
  vel: Vec3
  radius: number
  hp: number
  points: number
  /** Drift anchor. */
  base: Vec3
  driftAmp: number
  driftSpeed: number
  driftPhase: number
  driftAxis: 0 | 1 | 2
  /** Seconds of hit-flash tint remaining. */
  hitFlash: number
}

export function createTargetStates(): TargetState[] {
  return Array.from({ length: MAX_TARGETS }, () => ({
    alive: false,
    kind: 'balloon' as TargetKind,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 1,
    hp: 1,
    points: 0,
    base: { x: 0, y: 0, z: 0 },
    driftAmp: 0,
    driftSpeed: 0,
    driftPhase: 0,
    driftAxis: 0 as 0 | 1 | 2,
    hitFlash: 0,
  }))
}

/** Load a wave into the pool (slots beyond the wave go dormant). */
export function loadWave(states: TargetState[], wave: WaveSpec): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i]
    const spec = wave.targets[i]
    if (!spec) {
      s.alive = false
      continue
    }
    s.alive = true
    s.kind = spec.kind
    s.pos.x = spec.x
    s.pos.y = spec.y
    s.pos.z = spec.z
    s.base.x = spec.x
    s.base.y = spec.y
    s.base.z = spec.z
    s.vel.x = 0
    s.vel.y = 0
    s.vel.z = 0
    s.radius = spec.radius
    s.hp = spec.hp
    s.points = spec.points
    s.driftAmp = spec.driftAmp
    s.driftSpeed = spec.driftSpeed
    s.driftPhase = spec.driftPhase
    s.driftAxis = spec.driftAxis
    s.hitFlash = 0
  }
}

/** Deterministic sinusoidal drift around the anchor; also writes the
 * velocity derivative so shot leading sees the real motion. */
export function stepDrift(t: TargetState, timeS: number): void {
  if (!t.alive) return
  // Cars drive along a road lane at constant speed, wrapping at the world
  // edge — the same pure linear-wrap the decorative traffic uses (RichWorld),
  // so the target rides the visible road. Velocity is the constant travel
  // speed (not a pos delta), so the once-per-lap wrap never spikes leading.
  if (t.kind === 'car') {
    const span = WORLD_HALF * 2
    const raw = t.driftPhase + t.driftSpeed * timeS
    const along = (((raw % span) + span) % span) - WORLD_HALF
    t.pos.y = t.base.y
    if (t.driftAxis === 0) {
      t.pos.x = along
      t.pos.z = t.base.z
      t.vel.x = t.driftSpeed
      t.vel.y = 0
      t.vel.z = 0
    } else {
      t.pos.z = along
      t.pos.x = t.base.x
      t.vel.x = 0
      t.vel.y = 0
      t.vel.z = t.driftSpeed
    }
    return
  }
  if (t.driftAmp === 0 || t.kind === 'enemy') return
  const phase = timeS * t.driftSpeed + t.driftPhase
  const offset = Math.sin(phase) * t.driftAmp
  const deriv = Math.cos(phase) * t.driftAmp * t.driftSpeed
  t.vel.x = 0
  t.vel.y = 0
  t.vel.z = 0
  if (t.driftAxis === 0) {
    t.pos.x = t.base.x + offset
    t.vel.x = deriv
  } else if (t.driftAxis === 1) {
    t.pos.y = t.base.y + offset
    t.vel.y = deriv
  } else {
    t.pos.z = t.base.z + offset
    t.vel.z = deriv
  }
}

export function aliveCount(states: readonly TargetState[]): number {
  let n = 0
  for (const s of states) if (s.alive) n++
  return n
}
