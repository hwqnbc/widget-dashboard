/**
 * Deterministic world layout. A seeded PRNG (evaluated once at module load)
 * keeps the city identical across reloads and test runs while still looking
 * scattered. Specs are plain data so a future collision pass can treat each
 * building as an AABB.
 */

import type { Collider } from './flightModel'
import { DRONE_RADIUS } from './flightModel'

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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildCity(): BuildingSpec[] {
  const rand = mulberry32(0x5eed)
  const specs: BuildingSpec[] = []
  let guard = 0
  while (specs.length < 36 && guard++ < 500) {
    const x = (rand() * 2 - 1) * 55
    const z = (rand() * 2 - 1) * 55
    // Keep the spawn corridor (drone starts at z=18 looking toward -Z) and
    // the ring area near the origin breathable.
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

export const BUILDINGS: readonly BuildingSpec[] = buildCity()

/** Building AABBs pre-inflated for point-vs-box tests (see Collider docs). */
export const COLLIDERS: readonly Collider[] = BUILDINGS.map((b) => ({
  minX: b.x - b.w / 2 - DRONE_RADIUS,
  maxX: b.x + b.w / 2 + DRONE_RADIUS,
  minZ: b.z - b.d / 2 - DRONE_RADIUS,
  maxZ: b.z + b.d / 2 + DRONE_RADIUS,
  top: b.h + DRONE_RADIUS,
}))

/** Score gates, flown in order. */
export const RINGS: readonly RingSpec[] = [
  { x: 0, y: 6, z: -6, yaw: 0 },
  { x: -18, y: 10, z: -22, yaw: Math.PI / 4 },
  { x: 20, y: 14, z: -30, yaw: -Math.PI / 5 },
]

/** Torus major radius of a gate ring (see WorldScene/GateRings geometry). */
export const RING_RADIUS = 2.4

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

export const GATES: readonly Gate[] = RINGS.map((r) => ({
  center: { x: r.x, y: r.y, z: r.z },
  normal: { x: Math.sin(r.yaw), y: 0, z: Math.cos(r.yaw) },
  passRadius: RING_RADIUS - 0.3,
}))

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
