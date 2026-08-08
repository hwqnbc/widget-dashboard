/**
 * Pooled one-shot spark bursts for the Drone Strike widget — muzzle flashes at
 * the gun and impact showers at hit points. Pure module (no React/three): flat
 * pre-allocated arrays stepped in place, so the whole system is one `<points>`
 * draw call (`SparkField`) and the logic is e2e-testable off-canvas.
 *
 * A burst is a contiguous block of `SPARK_PER` particles; bursts recycle
 * through a ring of `SPARK_BURSTS` blocks (graceful overwrite under fire
 * churn). Directions/speeds derive from the particle index (golden-angle
 * azimuth + index-fraction jitter) — **no Math.random**, so two pools given
 * the same calls produce identical arrays and suites can assert exact state.
 */

export type SparkKind = 'muzzle' | 'impact'

/** Ring capacity: concurrent visible bursts. */
export const SPARK_BURSTS = 24
/** Particles per burst. */
export const SPARK_PER = 12
export const SPARK_CAP = SPARK_BURSTS * SPARK_PER

/** Seconds a particle lives, by kind (muzzle = a quick pop, impact lingers). */
export const SPARK_LIFE_MUZZLE = 0.22
export const SPARK_LIFE_IMPACT = 0.5
/** Downward pull on flying sparks (world units/s²). */
export const SPARK_GRAVITY = 7
/** Dormant sentinel — slots at/above this age are skipped (and alpha 0). */
const DEAD_AGE = 999
/** Golden angle (radians) — spreads azimuths evenly without randomness. */
const GOLDEN = 2.399963229728653

export interface SparkPool {
  /** xyz per particle — the live geometry position attribute array. */
  pos: Float32Array
  vel: Float32Array
  /** Seconds alive; DEAD_AGE = dormant slot. */
  age: Float32Array
  /** Per-particle lifetime (set by kind at spawn). */
  life: Float32Array
  /** 0..1 fade, derived by stepSparks — the geometry alpha attribute array. */
  alpha: Float32Array
  /** rgb per particle — the geometry tint attribute array. */
  color: Float32Array
  /** Next burst block to (re)use. */
  cursor: number
  /** Monotonic burst counter — published as `data-sparks` telemetry. */
  spawned: number
}

export function createSparkPool(): SparkPool {
  return {
    pos: new Float32Array(SPARK_CAP * 3),
    vel: new Float32Array(SPARK_CAP * 3),
    age: new Float32Array(SPARK_CAP).fill(DEAD_AGE),
    life: new Float32Array(SPARK_CAP).fill(1),
    alpha: new Float32Array(SPARK_CAP),
    color: new Float32Array(SPARK_CAP * 3),
    cursor: 0,
    spawned: 0,
  }
}

/** Deterministic 0..1 fraction from a particle index (per-index jitter). */
function fract(x: number): number {
  return x - Math.floor(x)
}

/**
 * Emit one burst at (x, y, z). Muzzle: a small omni yellow pop. Impact: an
 * up-biased orange/white shower that falls under gravity. Overwrites the
 * oldest burst block when the ring is full.
 */
export function spawnBurst(pool: SparkPool, x: number, y: number, z: number, kind: SparkKind): void {
  const b = pool.cursor
  pool.cursor = (b + 1) % SPARK_BURSTS
  pool.spawned++
  const impact = kind === 'impact'
  const life = impact ? SPARK_LIFE_IMPACT : SPARK_LIFE_MUZZLE
  for (let j = 0; j < SPARK_PER; j++) {
    const idx = b * SPARK_PER + j
    const az = j * GOLDEN
    const f1 = fract(j * 0.618 + 0.17)
    const f2 = fract(j * 0.383 + 0.29)
    const speed = impact ? 3 + 3 * f1 : 1.5 + 1.5 * f1
    // Impact sparks shower up-and-out; muzzle scatters around the barrel.
    const dirY = impact ? 0.35 + 0.55 * f2 : (f2 - 0.5) * 0.8
    const horiz = Math.sqrt(Math.max(0, 1 - dirY * dirY))
    pool.pos[idx * 3] = x
    pool.pos[idx * 3 + 1] = y
    pool.pos[idx * 3 + 2] = z
    pool.vel[idx * 3] = Math.cos(az) * horiz * speed
    pool.vel[idx * 3 + 1] = dirY * speed
    pool.vel[idx * 3 + 2] = Math.sin(az) * horiz * speed
    pool.age[idx] = 0
    pool.life[idx] = life
    pool.alpha[idx] = 1
    if (impact) {
      // Every third spark white-hot, the rest ember orange.
      const hot = j % 3 === 0
      pool.color[idx * 3] = 1
      pool.color[idx * 3 + 1] = hot ? 0.95 : 0.55
      pool.color[idx * 3 + 2] = hot ? 0.8 : 0.15
    } else {
      pool.color[idx * 3] = 1
      pool.color[idx * 3 + 1] = 0.84
      pool.color[idx * 3 + 2] = 0.31
    }
  }
}

/**
 * Age, fade and fly every live particle (dt clamped like the other steppers so
 * a background-tab hitch doesn't teleport sparks). Dormant slots stay dormant.
 */
export function stepSparks(pool: SparkPool, dt: number): void {
  const step = Math.min(dt, 0.05)
  for (let j = 0; j < SPARK_CAP; j++) {
    if (pool.age[j] >= DEAD_AGE) {
      pool.alpha[j] = 0
      continue
    }
    pool.age[j] += step
    if (pool.age[j] >= pool.life[j]) {
      pool.age[j] = DEAD_AGE
      pool.alpha[j] = 0
      continue
    }
    pool.alpha[j] = 1 - pool.age[j] / pool.life[j]
    pool.pos[j * 3] += pool.vel[j * 3] * step
    pool.pos[j * 3 + 1] += pool.vel[j * 3 + 1] * step
    pool.pos[j * 3 + 2] += pool.vel[j * 3 + 2] * step
    pool.vel[j * 3 + 1] -= SPARK_GRAVITY * step
  }
}
