/**
 * Seeded world builder. `buildWorldLayout(seed)` deterministically produces
 * the city, the gate rings and their derived collision/gate data — the same
 * seed always yields the same course, so a widget instance's persisted
 * `worldSeed` recreates its world across reloads while the "new course"
 * button just re-rolls the seed. Specs are plain data (buildings are AABBs
 * for the collision pass).
 */
import type { Collider } from './flightModel'
import { DRONE_RADIUS, SPAWN, WORLD_HALF } from './flightModel'

export interface BuildingSpec {
  x: number
  z: number
  w: number
  d: number
  h: number
  /** Multiplier on the palette building colour for per-instance variety. */
  shade: number
}

export interface RingSpec {
  x: number
  y: number
  z: number
  yaw: number
}

export interface Gate {
  center: Vec3G
  /** Unit normal of the ring plane (torus axis after rotation-y). */
  normal: Vec3G
  /** Pass counts when the crossing point is within this distance of centre. */
  passRadius: number
}
interface Vec3G {
  x: number
  y: number
  z: number
}

export interface TreeSpec {
  x: number
  z: number
  /** Canopy height (trunk is a fixed fraction). */
  h: number
  r: number
  shade: number
}

export interface RoadSpec {
  /** 'x' runs along the X axis at z = at; 'z' runs along Z at x = at. */
  axis: 'x' | 'z'
  at: number
}

export interface TrafficSpec {
  road: number
  offset: number
  speed: number
  dir: 1 | -1
  /** 0..1 — picks the dot colour. */
  hue: number
}

export interface CloudSpec {
  x: number
  y: number
  z: number
  scale: number
}

export interface RoofSpec {
  building: number
  kind: 'antenna' | 'tank'
}

export interface WorldLayout {
  buildings: readonly BuildingSpec[]
  rings: readonly RingSpec[]
  colliders: readonly Collider[]
  gates: readonly Gate[]
  trees: readonly TreeSpec[]
  roads: readonly RoadSpec[]
  traffic: readonly TrafficSpec[]
  clouds: readonly CloudSpec[]
  roofs: readonly RoofSpec[]
}

/** Torus major radius of a gate ring (see GateRings geometry). */
export const RING_RADIUS = 2.4

/** The original hand-tuned course; also the ring fallback if sampling fails. */
export const DEFAULT_SEED = 0x5eed
const CLASSIC_RINGS: readonly RingSpec[] = [
  { x: 0, y: 6, z: -6, yaw: 0 },
  { x: -18, y: 10, z: -22, yaw: Math.PI / 4 },
  { x: 20, y: 14, z: -30, yaw: -Math.PI / 5 },
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildCity(rand: () => number): BuildingSpec[] {
  const specs: BuildingSpec[] = []
  let guard = 0
  while (specs.length < 36 && guard++ < 500) {
    const x = (rand() * 2 - 1) * 55
    const z = (rand() * 2 - 1) * 55
    // Keep the spawn corridor (drone starts at z=18 looking toward -Z) and
    // the area near the origin breathable.
    if (Math.abs(x) < 10 && z > 8) continue
    if (Math.hypot(x, z) < 9) continue
    specs.push({
      x,
      z,
      w: 2 + rand() * 4,
      d: 2 + rand() * 4,
      h: 3 + rand() * 15,
      shade: 0.75 + rand() * 0.5,
    })
  }
  return specs
}

function ringFits(
  ring: RingSpec,
  others: readonly RingSpec[],
  buildings: readonly BuildingSpec[],
): boolean {
  if (Math.hypot(ring.x - SPAWN.x, ring.z - SPAWN.z) < 12) return false
  if (others.some((o) => Math.hypot(ring.x - o.x, ring.z - o.z) < 18)) {
    return false
  }
  // Reject rings whose disc could overlap a building: centre inside the
  // footprint inflated by the ring radius while the roof reaches the ring.
  const clear = RING_RADIUS + 0.5
  return !buildings.some(
    (b) =>
      Math.abs(ring.x - b.x) < b.w / 2 + clear &&
      Math.abs(ring.z - b.z) < b.d / 2 + clear &&
      b.h > ring.y - RING_RADIUS,
  )
}

function buildRings(
  rand: () => number,
  buildings: readonly BuildingSpec[],
): RingSpec[] {
  const rings: RingSpec[] = []
  for (let i = 0; i < CLASSIC_RINGS.length; i++) {
    let placed = false
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const ring: RingSpec = {
        x: (rand() * 2 - 1) * 40,
        z: (rand() * 2 - 1) * 40,
        y: 5 + rand() * 11,
        yaw: (rand() * 2 - 1) * Math.PI,
      }
      if (Math.abs(ring.x) > WORLD_HALF - 5 || Math.abs(ring.z) > WORLD_HALF - 5) {
        continue
      }
      if (ringFits(ring, rings, buildings)) {
        rings.push(ring)
        placed = true
      }
    }
    if (!placed) rings.push(CLASSIC_RINGS[i])
  }
  return rings
}

/** Pick road lanes with the most clearance from building centres. */
function buildRoads(rand: () => number, buildings: readonly BuildingSpec[]): RoadSpec[] {
  const laneScore = (axis: 'x' | 'z', at: number) =>
    Math.min(
      ...buildings.map((b) => Math.abs((axis === 'x' ? b.z : b.x) - at)),
    )
  const pick = (axis: 'x' | 'z'): RoadSpec => {
    let best = 0
    let bestScore = -1
    for (let i = 0; i < 8; i++) {
      const at = (rand() * 2 - 1) * 45
      if (Math.abs(at - (axis === 'x' ? SPAWN.z : SPAWN.x)) < 6) continue
      const score = laneScore(axis, at)
      if (score > bestScore) {
        bestScore = score
        best = at
      }
    }
    return { axis, at: Math.round(best * 10) / 10 }
  }
  return [pick('x'), pick('x'), pick('z'), pick('z')]
}

function buildTrees(
  rand: () => number,
  buildings: readonly BuildingSpec[],
  roads: readonly RoadSpec[],
): TreeSpec[] {
  const trees: TreeSpec[] = []
  let guard = 0
  while (trees.length < 40 && guard++ < 400) {
    const x = (rand() * 2 - 1) * 55
    const z = (rand() * 2 - 1) * 55
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) continue
    if (
      buildings.some(
        (b) => Math.abs(x - b.x) < b.w / 2 + 1.2 && Math.abs(z - b.z) < b.d / 2 + 1.2,
      )
    ) {
      continue
    }
    if (roads.some((r) => Math.abs((r.axis === 'x' ? z : x) - r.at) < 3)) continue
    trees.push({
      x,
      z,
      h: 1.6 + rand() * 2.4,
      r: 0.8 + rand() * 0.8,
      shade: 0.7 + rand() * 0.6,
    })
  }
  return trees
}

function buildTraffic(rand: () => number, roadCount: number): TrafficSpec[] {
  const cars: TrafficSpec[] = []
  for (let i = 0; i < 12; i++) {
    cars.push({
      road: i % roadCount,
      offset: rand() * WORLD_HALF * 2,
      speed: 3 + rand() * 5,
      dir: rand() < 0.5 ? 1 : -1,
      hue: rand(),
    })
  }
  return cars
}

function buildClouds(rand: () => number): CloudSpec[] {
  const clouds: CloudSpec[] = []
  for (let i = 0; i < 8; i++) {
    clouds.push({
      x: (rand() * 2 - 1) * 65,
      y: 28 + rand() * 8,
      z: (rand() * 2 - 1) * 65,
      scale: 1.5 + rand() * 2,
    })
  }
  return clouds
}

function buildRoofs(rand: () => number, buildings: readonly BuildingSpec[]): RoofSpec[] {
  const roofs: RoofSpec[] = []
  buildings.forEach((b, i) => {
    if (b.h > 10 && rand() < 0.5) {
      roofs.push({ building: i, kind: rand() < 0.5 ? 'antenna' : 'tank' })
    }
  })
  return roofs
}

export function buildWorldLayout(seed: number): WorldLayout {
  const rand = mulberry32(seed)
  const buildings = buildCity(rand)
  // The default seed keeps the original hand-placed course so existing
  // widgets (and their persisted best laps) are unchanged by the seed model.
  const rings =
    seed === DEFAULT_SEED ? CLASSIC_RINGS : buildRings(rand, buildings)
  // Rich-world extras draw from the stream AFTER buildings/rings, so every
  // pre-existing seed keeps its exact course.
  const roads = buildRoads(rand, buildings)
  const trees = buildTrees(rand, buildings, roads)
  const traffic = buildTraffic(rand, roads.length)
  const clouds = buildClouds(rand)
  const roofs = buildRoofs(rand, buildings)

  const colliders: Collider[] = buildings.map((b) => ({
    minX: b.x - b.w / 2 - DRONE_RADIUS,
    maxX: b.x + b.w / 2 + DRONE_RADIUS,
    minZ: b.z - b.d / 2 - DRONE_RADIUS,
    maxZ: b.z + b.d / 2 + DRONE_RADIUS,
    top: b.h + DRONE_RADIUS,
  }))
  const gates: Gate[] = rings.map((r) => ({
    center: { x: r.x, y: r.y, z: r.z },
    normal: { x: Math.sin(r.yaw), y: 0, z: Math.cos(r.yaw) },
    passRadius: RING_RADIUS - 0.3,
  }))
  return { buildings, rings, colliders, gates, trees, roads, traffic, clouds, roofs }
}

/**
 * Did the segment prev→cur cross the gate's plane inside the ring? Detects a
 * sign change of the signed plane distance and checks the interpolated
 * crossing point against passRadius. Direction-agnostic on purpose.
 */
export function crossedGate(
  prev: Vec3G,
  cur: Vec3G,
  gate: Gate,
): boolean {
  const { center: c, normal: n } = gate
  const dPrev =
    (prev.x - c.x) * n.x + (prev.y - c.y) * n.y + (prev.z - c.z) * n.z
  const dCur = (cur.x - c.x) * n.x + (cur.y - c.y) * n.y + (cur.z - c.z) * n.z
  if (dPrev === dCur || dPrev * dCur > 0) return false
  const t = dPrev / (dPrev - dCur)
  const hx = prev.x + (cur.x - prev.x) * t - c.x
  const hy = prev.y + (cur.y - prev.y) * t - c.y
  const hz = prev.z + (cur.z - prev.z) * t - c.z
  return Math.hypot(hx, hy, hz) <= gate.passRadius
}
