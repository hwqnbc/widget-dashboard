/**
 * Deterministic world layout. A seeded PRNG (evaluated once at module load)
 * keeps the city identical across reloads and test runs while still looking
 * scattered. Specs are plain data so a future collision pass can treat each
 * building as an AABB.
 */

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

/** Decorative gates for now; future scoring hooks. */
export const RINGS: readonly RingSpec[] = [
  { x: 0, y: 6, z: -6, yaw: 0 },
  { x: -18, y: 10, z: -22, yaw: Math.PI / 4 },
  { x: 20, y: 14, z: -30, yaw: -Math.PI / 5 },
]
