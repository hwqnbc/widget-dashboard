/**
 * Seeded analytic heightfield terrain for the Tank Battle widget — no React,
 * no three.js. Unlike the drones' flat city, the terrain IS the driving
 * model: `heightAt` is the single ground truth shared by rendering (the
 * displaced plane), physics (tank grounding, grade limits), gunnery (shell
 * sweeps, line of sight) and the e2e suites (the bundled module predicts the
 * exact ground height under the tank).
 *
 * The field is a sum of seeded parts, all cheap closed-form math (a few sin
 * pairs + gaussian hills per query, allocation-free):
 *   - 3 low-amplitude rolling waves (sin×sin) — the base undulation,
 *   - ~16 gaussian hills/basins — the ridges and hollows that make cover,
 *   - a spawn-basin envelope that flattens everything near the spawn pad so
 *     the player always starts on level ground, on every seed.
 */
import type { Vec3 } from '../droneSim/flightModel'

export const TANK_WORLD_HALF = 80
/** The player spawn — southern middle of the map, kept flat by the basin
 * envelope below. */
export const TANK_SPAWN = { x: 0, z: 62 }
/** Terrain height is forced to ~0 inside this radius of the spawn... */
const SPAWN_FLAT_R = 10
/** ...and untouched beyond this one (smoothstep between). */
const SPAWN_FADE_R = 26

export const DEFAULT_TANK_SEED = 20260719

/** Terrain roughness setting — scales hill/wave amplitude at build time. */
export type Roughness = 'gentle' | 'rolling' | 'rugged'

export const coerceRoughness = (v: unknown): Roughness | undefined =>
  v === 'gentle' || v === 'rolling' || v === 'rugged' ? v : undefined

export const ROUGHNESS_AMP: Record<Roughness, number> = {
  gentle: 0.55,
  rolling: 1,
  rugged: 1.45,
}

export interface HillSpec {
  x: number
  z: number
  /** Gaussian radius (u) — the hill's footprint. */
  r: number
  /** Peak height; negative for a shallow basin. */
  h: number
}

export interface WaveSpec {
  fx: number
  fz: number
  px: number
  pz: number
  amp: number
}

export interface RockSpec {
  x: number
  z: number
  r: number
  /** Seeded rotation for rendering variety. */
  rot: number
}

export interface TreeSpec {
  x: number
  z: number
  s: number
}

export interface TerrainSpec {
  seed: number
  roughness: Roughness
  hills: HillSpec[]
  waves: WaveSpec[]
  rocks: RockSpec[]
  trees: TreeSpec[]
}

/** Same PRNG as the drone world builder (copied so the modules stay
 * independent — the waveLayout precedent). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothstep = (lo: number, hi: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** Ground height (world y) at world (x, z). The single source of truth. */
export function heightAt(spec: TerrainSpec, x: number, z: number): number {
  let h = 0
  for (const w of spec.waves) {
    h += Math.sin(x * w.fx + w.px) * Math.sin(z * w.fz + w.pz) * w.amp
  }
  for (const hill of spec.hills) {
    const dx = x - hill.x
    const dz = z - hill.z
    const d2 = (dx * dx + dz * dz) / (hill.r * hill.r)
    if (d2 < 9) h += hill.h * Math.exp(-d2)
  }
  // Spawn basin: level ground near the pad on every seed.
  const ds = Math.hypot(x - TANK_SPAWN.x, z - TANK_SPAWN.z)
  return h * smoothstep(SPAWN_FLAT_R, SPAWN_FADE_R, ds)
}

const GRAD_EPS = 0.6

/** Terrain gradient (∂h/∂x, ∂h/∂z) by central differences — slope steepness
 * is the gradient magnitude (rise/run). Writes into `out` (x, z reused). */
export function gradientAt(
  spec: TerrainSpec,
  x: number,
  z: number,
  out: { x: number; z: number },
): void {
  out.x =
    (heightAt(spec, x + GRAD_EPS, z) - heightAt(spec, x - GRAD_EPS, z)) /
    (2 * GRAD_EPS)
  out.z =
    (heightAt(spec, x, z + GRAD_EPS) - heightAt(spec, x, z - GRAD_EPS)) /
    (2 * GRAD_EPS)
}

/**
 * Earliest t ∈ (0, 1] where the segment from→to dips under the terrain
 * (plus `clearance`), or 1 when the path is clear — the heightfield's
 * answer to the city's `boomClipT`. Used for enemy line of sight, the
 * camera-boom ground clamp and the shell sweeps. Marches in ~`step`-unit
 * samples; fine enough because the terrain has no cliffs (bounded gradient).
 */
export function terrainClearT(
  spec: TerrainSpec,
  from: Vec3,
  to: Vec3,
  clearance: number,
  step = 1.2,
): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  const n = Math.max(2, Math.ceil(len / step))
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const y = from.y + dy * t
    if (heightAt(spec, from.x + dx * t, from.z + dz * t) + clearance >= y) {
      return (i - 0.5) / n
    }
  }
  return 1
}

/**
 * March a ray from `eye` along unit `dir` until it strikes the terrain
 * (writes the hit into `out`, returns the distance), or place `out` at
 * `maxDist` on a clean miss. This is the aim-point resolver: the reticle
 * ray lands here and the gun solves its elevation to converge on it.
 */
export function aimPointOnTerrain(
  spec: TerrainSpec,
  eye: Vec3,
  dir: Vec3,
  maxDist: number,
  out: Vec3,
): number {
  const step = 1.4
  let prev = 0
  for (let d = step; d <= maxDist; d += step) {
    const x = eye.x + dir.x * d
    const y = eye.y + dir.y * d
    const z = eye.z + dir.z * d
    if (heightAt(spec, x, z) >= y) {
      // Binary refine between prev (clear) and d (under ground).
      let lo = prev
      let hi = d
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2
        if (heightAt(spec, eye.x + dir.x * mid, eye.z + dir.z * mid) >= eye.y + dir.y * mid) {
          hi = mid
        } else {
          lo = mid
        }
      }
      const hit = (lo + hi) / 2
      out.x = eye.x + dir.x * hit
      out.y = eye.y + dir.y * hit
      out.z = eye.z + dir.z * hit
      return hit
    }
    prev = d
  }
  out.x = eye.x + dir.x * maxDist
  out.y = eye.y + dir.y * maxDist
  out.z = eye.z + dir.z * maxDist
  return maxDist
}

const HILL_COUNT = 16
const WAVE_COUNT = 3
const ROCK_COUNT = 26
const TREE_COUNT = 44
/** Scenery keeps out of the spawn basin. */
const SCENERY_SPAWN_GAP = 12

/** Scratch for build-time slope checks. */
const buildGrad = { x: 0, z: 0 }

/**
 * Build a deterministic terrain from a seed. Same stream-order rule as the
 * drone world builder: waves, then hills, then rocks, then trees — appending
 * new tables later keeps existing seeds' terrain bit-identical. Roughness
 * scales amplitudes at build time (baked into the spec), so a roughness
 * change is a terrain change and callers confirm-guard it.
 */
export function buildTerrain(
  seed: number,
  roughness: Roughness = 'rolling',
): TerrainSpec {
  const rand = mulberry32(seed)
  const amp = ROUGHNESS_AMP[roughness]

  const waves: WaveSpec[] = []
  for (let i = 0; i < WAVE_COUNT; i++) {
    waves.push({
      fx: 0.045 + rand() * 0.055,
      fz: 0.045 + rand() * 0.055,
      px: rand() * Math.PI * 2,
      pz: rand() * Math.PI * 2,
      amp: (0.5 + rand() * 0.9) * amp,
    })
  }

  const hills: HillSpec[] = []
  for (let i = 0; i < HILL_COUNT; i++) {
    const basin = rand() < 0.2
    hills.push({
      x: (rand() * 2 - 1) * (TANK_WORLD_HALF - 12),
      z: (rand() * 2 - 1) * (TANK_WORLD_HALF - 12),
      r: 10 + rand() * 14,
      h: (basin ? -(1.5 + rand() * 2) : 2.5 + rand() * 6.5) * amp,
    })
  }

  const spec: TerrainSpec = { seed, roughness, hills, waves, rocks: [], trees: [] }

  // Rocks: prefer flat-ish spots (they're drive-around obstacles, not
  // mountain goats), out of the spawn basin, spread apart.
  for (let i = 0; i < ROCK_COUNT; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (rand() * 2 - 1) * (TANK_WORLD_HALF - 6)
      const z = (rand() * 2 - 1) * (TANK_WORLD_HALF - 6)
      if (Math.hypot(x - TANK_SPAWN.x, z - TANK_SPAWN.z) < SCENERY_SPAWN_GAP) continue
      gradientAt(spec, x, z, buildGrad)
      if (Math.hypot(buildGrad.x, buildGrad.z) > 0.4) continue
      if (spec.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < 7)) continue
      spec.rocks.push({ x, z, r: 0.9 + rand() * 1.1, rot: rand() * Math.PI * 2 })
      break
    }
  }

  // Trees: decorative (shells and tanks pass through — documented), spread.
  for (let i = 0; i < TREE_COUNT; i++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (rand() * 2 - 1) * (TANK_WORLD_HALF - 4)
      const z = (rand() * 2 - 1) * (TANK_WORLD_HALF - 4)
      if (Math.hypot(x - TANK_SPAWN.x, z - TANK_SPAWN.z) < SCENERY_SPAWN_GAP) continue
      if (spec.trees.some((t) => Math.hypot(x - t.x, z - t.z) < 4.5)) continue
      if (spec.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < 3)) continue
      spec.trees.push({ x, z, s: 0.8 + rand() * 0.8 })
      break
    }
  }

  return spec
}
