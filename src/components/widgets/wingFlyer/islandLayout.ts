/**
 * Wing Flyer's seeded island — pure, React-free (lesson #30). `islandHeight`
 * is the ONE ground truth shared by rendering, the flight model's ground
 * contact, the chase-camera clamp and the e2e suites (lesson #49).
 *
 * Built on Tank Battle's analytic terrain, imported in place and NOT
 * modified: its `heightAt` is sampled at stretched coordinates (× TERRAIN
 * SCALE horizontally, × HEIGHT_SCALE vertically) for the rolling base, and
 * the island's own features are layered on top:
 *   - a shoreline: land fades into the sea outside ISLAND_R,
 *   - the airstrip: a flat level rectangle at STRIP_Y with a fade apron,
 *   - the town: a flattened pad with seeded instanced blocks (AABB colliders),
 *   - a ridge: a long gaussian wall in the north (slope lift, later rounds),
 *   - a lake: a gaussian hollow below sea level, so the water plane fills it.
 * Seeded generation is append-only (lesson #54): new tables go at the end of
 * the stream so existing seeds keep their layout.
 */
import { buildTerrain, heightAt as tankHeightAt } from '../tankBattle/terrain'
import type { TerrainSpec } from '../tankBattle/terrain'

/** Half-size of the playable square, metres (≈ 880 m across). */
export const WORLD_HALF = 440
/** Land fades to sea between these radii from the centre. */
export const ISLAND_R = 330
export const SHORE_R = 410
export const SEA_LEVEL = 0
/** Base land height above the sea, metres. */
export const LAND_BASE = 3
/** Sea floor depth (rendered under the water plane). */
export const SEA_FLOOR = -8
/** Tank terrain sampled at x/TERRAIN_SCALE; heights × HEIGHT_SCALE. */
export const TERRAIN_SCALE = 5.5
export const HEIGHT_SCALE = 3.2

/** The airstrip: centred at (x, z), runway along +X/−X. */
export const STRIP = {
  x: 0,
  z: 230,
  length: 200,
  width: 30,
  /** Flat-apron width around the runway before the hills resume. */
  apron: 30,
  /** Heading of the runway's take-off direction (rad; π/2 = east, +X). */
  heading: Math.PI / 2,
} as const
export const STRIP_Y = LAND_BASE + 1

/** Where the pilot stands: beside the west end of the runway, facing
 * along it (east). */
export const PILOT = { x: STRIP.x - STRIP.length / 2 + 6, z: STRIP.z + STRIP.width / 2 + 4 } as const

export const TOWN = { x: -170, z: -40, r: 75 } as const
export const RIDGE = { x: 0, z: -300, halfLength: 220, width: 38, height: 55 } as const
export const LAKE = { x: 190, z: 40, r: 70, depth: 12 } as const

export const DEFAULT_ISLAND_SEED = 20261010

export interface IslandBuilding {
  x: number
  z: number
  /** Footprint half-sizes and height, metres. */
  hw: number
  hd: number
  h: number
  /** Ground under it. */
  y: number
}

export interface IslandTree {
  x: number
  z: number
  s: number
}

export interface IslandSpec {
  seed: number
  terrain: TerrainSpec
  buildings: IslandBuilding[]
  trees: IslandTree[]
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** 0 on the runway rectangle (+ apron), 1 beyond the apron's fade. */
function stripMask(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - STRIP.x) - STRIP.length / 2)
  const dz = Math.max(0, Math.abs(z - STRIP.z) - STRIP.width / 2)
  const d = Math.hypot(dx, dz)
  return smoothstep(STRIP.apron * 0.4, STRIP.apron, d)
}

/** True when (x, z) is on the paved runway. */
export function onStrip(x: number, z: number): boolean {
  return Math.abs(x - STRIP.x) <= STRIP.length / 2 && Math.abs(z - STRIP.z) <= STRIP.width / 2
}

/** Approach glide slope, radians — steeper than full size (RC style). */
export const GLIDE_SLOPE = (7 * Math.PI) / 180
/** Approach guide: hoops from this far out (m) to the threshold. */
export const APPROACH_LENGTH = 160
export const APPROACH_HOOPS = 6

export interface ApproachPoint {
  x: number
  y: number
  z: number
}

/**
 * The approach path onto one end of the runway: points along the extended
 * centreline, outermost first, on the glide slope down to the touchdown
 * aim point (a quarter of the way in). `end` = −1 lands EASTBOUND (comes in
 * over the west end), +1 lands WESTBOUND. Pure data — the hoops draw it and
 * a future auto-land assist flies it.
 */
export function approachPath(end: -1 | 1, hoops = APPROACH_HOOPS): ApproachPoint[] {
  const aimX = STRIP.x + end * (STRIP.length / 4)
  const pts: ApproachPoint[] = []
  for (let i = hoops; i >= 1; i--) {
    const d = (APPROACH_LENGTH / hoops) * i + STRIP.length / 4
    pts.push({ x: aimX + end * d, y: STRIP_Y + 1.5 + d * Math.tan(GLIDE_SLOPE), z: STRIP.z })
  }
  return pts
}

/** Heading (rad) of a landing onto `end` (see approachPath). */
export const landingHeading = (end: -1 | 1) => (end === -1 ? Math.PI / 2 : -Math.PI / 2)

/** Max ground slope (rise/run) a plane can land on. */
export const LANDABLE_SLOPE = 0.18

/** Ground height (world y) at (x, z). The single source of truth. */
export function islandHeight(spec: IslandSpec, x: number, z: number): number {
  // Rolling base from the tank terrain, stretched to island scale.
  let h = LAND_BASE + Math.max(-1.5, tankHeightAt(spec.terrain, x / TERRAIN_SCALE, z / TERRAIN_SCALE) * HEIGHT_SCALE)
  // Ridge: a long gaussian wall along X.
  const rx = Math.max(0, Math.abs(x - RIDGE.x) - RIDGE.halfLength)
  const rz = z - RIDGE.z
  h += RIDGE.height * Math.exp(-(rz * rz) / (RIDGE.width * RIDGE.width) - (rx * rx) / 3600)
  // Town: flatten toward the base around the town centre.
  const td = Math.hypot(x - TOWN.x, z - TOWN.z)
  const tm = smoothstep(TOWN.r, TOWN.r * 1.5, td)
  h = LAND_BASE + 1 + (h - LAND_BASE - 1) * tm
  // Lake: a hollow below sea level.
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z) / LAKE.r
  h -= (LAKE.depth + Math.max(0, h - LAND_BASE)) * Math.exp(-ld * ld * 1.6)
  // Airstrip: dead flat at STRIP_Y.
  const sm = stripMask(x, z)
  h = STRIP_Y + (h - STRIP_Y) * sm
  // Shoreline: land → sea floor outside the island radius.
  const r = Math.hypot(x, z)
  const shore = smoothstep(ISLAND_R, SHORE_R, r)
  return h + (SEA_FLOOR - h) * shore
}

/** True when the ground at (x, z) is under water (sea or lake). */
export const isWater = (spec: IslandSpec, x: number, z: number) => islandHeight(spec, x, z) < SEA_LEVEL

/** Ground slope (gradient magnitude) at (x, z). */
export function slopeAt(spec: IslandSpec, x: number, z: number): number {
  const e = 1
  const sx = (islandHeight(spec, x + e, z) - islandHeight(spec, x - e, z)) / (2 * e)
  const sz = (islandHeight(spec, x, z + e) - islandHeight(spec, x, z - e)) / (2 * e)
  return Math.hypot(sx, sz)
}

/** Can a plane touch down here? The runway, or dry, gentle grass. */
export function isLandable(spec: IslandSpec, x: number, z: number): boolean {
  if (onStrip(x, z)) return true
  if (islandHeight(spec, x, z) < SEA_LEVEL + 0.3) return false
  return slopeAt(spec, x, z) <= LANDABLE_SLOPE
}

const BUILDING_COUNT = 30
const TREE_COUNT = 180

/** Build the island from a seed: base terrain, then buildings, then trees
 * (stream order is append-only). */
export function buildIsland(seed: number = DEFAULT_ISLAND_SEED): IslandSpec {
  const terrain = buildTerrain(seed, 'rolling')
  const rand = mulberry32(seed ^ 0x51a7d)
  const spec: IslandSpec = { seed, terrain, buildings: [], trees: [] }

  for (let i = 0; i < BUILDING_COUNT; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * (TOWN.r - 12)
      const x = TOWN.x + Math.cos(a) * d
      const z = TOWN.z + Math.sin(a) * d
      const hw = 4 + rand() * 5
      const hd = 4 + rand() * 5
      // Taller toward the middle of town.
      const h = 5 + rand() * 10 + (1 - d / TOWN.r) * 14
      const clash = spec.buildings.some(
        (b) => Math.abs(b.x - x) < b.hw + hw + 5 && Math.abs(b.z - z) < b.hd + hd + 5,
      )
      if (clash) continue
      spec.buildings.push({ x, z, hw, hd, h, y: islandHeight(spec, x, z) })
      break
    }
  }

  for (let i = 0; i < TREE_COUNT; i++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (rand() * 2 - 1) * ISLAND_R
      const z = (rand() * 2 - 1) * ISLAND_R
      const y = islandHeight(spec, x, z)
      if (y < SEA_LEVEL + 1) continue
      if (stripMask(x, z) < 1) continue
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.r + 8) continue
      if (spec.trees.some((t) => Math.hypot(x - t.x, z - t.z) < 9)) continue
      spec.trees.push({ x, z, s: 0.9 + rand() * 0.9 })
      break
    }
  }
  return spec
}
