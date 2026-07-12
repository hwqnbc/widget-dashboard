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

export interface WorldLayout {
  buildings: readonly BuildingSpec[]
  rings: readonly RingSpec[]
  colliders: readonly Collider[]
  gates: readonly Gate[]
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

export function buildWorldLayout(seed: number): WorldLayout {
  const rand = mulberry32(seed)
  const buildings = buildCity(rand)
  // The default seed keeps the original hand-placed course so existing
  // widgets (and their persisted best laps) are unchanged by the seed model.
  const rings =
    seed === DEFAULT_SEED ? CLASSIC_RINGS : buildRings(rand, buildings)

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
  return { buildings, rings, colliders, gates }
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
