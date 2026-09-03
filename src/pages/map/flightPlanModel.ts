/**
 * Pure building-aware flight planner for the drone flight tool — no ArcGIS
 * imports, bundled by e2e/run.mjs and unit-tested offline.
 *
 * Buildings come from OSM (via the Overpass client in overpass.ts): a
 * footprint ring plus a height that is often ESTIMATED (`height` tag when
 * present, else levels × 3 m, else 10 m), so clearances over untagged
 * buildings are approximate. Building tops are measured from the leg's
 * interpolated ground line (flat-terrain approximation — fine for a city,
 * documented in docs/map.md).
 *
 * Per leg the planner picks, in order: DIRECT (nothing tall crosses the
 * leg), CLIMB (allowed and the required altitude fits under the ceiling —
 * a trapezoid profile over the whole leg), DETOUR (best feasible path via
 * an A* visibility graph over clearance-inflated footprint corners of the
 * WHOLE data bbox, searched in widening tiers, flown at cruise), else
 * BLOCKED — which now genuinely means enclosed: an endpoint sealed inside
 * an inflated footprint, or every gap narrower than 2×clearance, with the
 * full corner graph exhausted (never a truncated search).
 */

import type { FlightPoint } from './flightPathModel'

export type LonLat = [number, number]

export interface Building {
  /** Footprint ring, WGS84 lon/lat (closed or open — treated as cyclic). */
  ring: LonLat[]
  /** Height above ground, meters. */
  height: number
}

export interface PlanOptions {
  /** Extra meters kept above obstacle tops and around footprints. */
  clearance?: number
  /** May the planner raise the flight height over obstacles? */
  allowClimb: boolean
  /** Max flight height above ground, meters (AGL), when climbing. */
  ceiling: number
  /** Cruise height above ground, meters — the default leg altitude. */
  cruise: number
}

export type LegMode = 'direct' | 'climb' | 'detour' | 'blocked'

export interface PlannedLeg {
  mode: LegMode
  /** The leg's flown path (start/end included). Blocked legs hold the
   * straight line for drawing only. */
  path: FlightPoint[]
}

export interface FlightPlan {
  legs: PlannedLeg[]
  /** Concatenated flyable path (empty when any leg is blocked). */
  path: FlightPoint[]
  climbs: number
  detours: number
  blocked: number
}

/** A planner input point: where the user clicked plus its ground z. */
export interface PlanPoint {
  lon: number
  lat: number
  ground: number
}

const EARTH_M_PER_DEG = 111_320
const DEFAULT_CLEARANCE = 5
/** Perf-only pre-filter for the DIRECT-line obstruction test (a building
 * can only block the straight leg when it's near it or crossed by it). The
 * detour search deliberately uses the FULL building set instead. */
const CORRIDOR_M = 400
/**
 * The detour search widens progressively: first only corners near the
 * direct leg (cheap, catches the common case), then wider rings, then
 * every corner in the data bbox — so "no detour" means the FULL graph was
 * exhausted, not that the search was truncated. The final hard cap keeps
 * the worst dense-city case bounded (nearest-to-leg corners win).
 */
const DETOUR_TIERS_M = [400, 1600, Infinity]
const MAX_CORNERS = 320

// ---------------------------------------------------------------- parsing

/** OSM height estimate: `height` (meters, tolerates a "m" suffix and
 * comma decimals) → `building:levels` × 3 → 10 m default. */
export function estimateHeight(tags: Record<string, string> | undefined): number {
  const h = parseFloat((tags?.height ?? '').replace(',', '.'))
  if (Number.isFinite(h) && h > 0) return h
  const levels = parseFloat(tags?.['building:levels'] ?? '')
  if (Number.isFinite(levels) && levels > 0) return levels * 3
  return 10
}

/** Overpass `out geom` response → buildings. Malformed elements (missing
 * geometry, tiny rings) are dropped — a bad payload must never throw. */
export function parseOverpassBuildings(json: unknown): Building[] {
  const elements = (json as { elements?: unknown[] } | null)?.elements
  if (!Array.isArray(elements)) return []
  const buildings: Building[] = []
  for (const el of elements) {
    const way = el as { type?: string; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }
    if (way.type !== 'way' || !Array.isArray(way.geometry)) continue
    const ring: LonLat[] = []
    for (const g of way.geometry) {
      if (typeof g?.lon === 'number' && typeof g?.lat === 'number') ring.push([g.lon, g.lat])
    }
    if (ring.length < 3) continue
    buildings.push({ ring, height: estimateHeight(way.tags) })
  }
  return buildings
}

// ------------------------------------------------------- meter-space frame

/** Local equirectangular meter frame around a reference latitude (same
 * approach as routeGeometry.ts — far more accurate than a footprint). */
interface Frame {
  cosLat: number
}

const frameFor = (lat: number): Frame => ({ cosLat: Math.cos((lat * Math.PI) / 180) })
const toM = (p: LonLat, f: Frame): [number, number] => [
  p[0] * EARTH_M_PER_DEG * f.cosLat,
  p[1] * EARTH_M_PER_DEG,
]
const toLonLat = (m: [number, number], f: Frame): LonLat => [
  m[0] / (EARTH_M_PER_DEG * f.cosLat),
  m[1] / EARTH_M_PER_DEG,
]

type XY = [number, number]

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]]
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0]

/** Point-in-polygon (ray cast). */
function insidePolygon(p: XY, ring: XY[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Segment a→b vs segment c→d intersection parameter on a→b, or null. */
function segSegT(a: XY, b: XY, c: XY, d: XY): number | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (denom === 0) return null // parallel/collinear — edge crossings nearby catch these
  const t = cross(sub(c, a), s) / denom
  const u = cross(sub(c, a), r) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}

/**
 * Where segment a→b passes through a polygon: the [tIn, tOut] interval on
 * the segment, or null when it misses entirely. Endpoints inside count.
 */
export function segmentThroughPolygon(a: XY, b: XY, ring: XY[]): [number, number] | null {
  const ts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const t = segSegT(a, b, ring[i], ring[(i + 1) % ring.length])
    if (t != null) ts.push(t)
  }
  if (insidePolygon(a, ring)) ts.push(0)
  if (insidePolygon(b, ring)) ts.push(1)
  if (ts.length === 0) return null
  return [Math.min(...ts), Math.max(...ts)]
}

/** Inflate a ring by pushing each vertex away from the centroid — a crude
 * Minkowski sum that is plenty for building footprints. */
export function inflateRing(ring: XY[], by: number): XY[] {
  let cx = 0
  let cy = 0
  for (const [x, y] of ring) {
    cx += x
    cy += y
  }
  cx /= ring.length
  cy /= ring.length
  return ring.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const len = Math.hypot(dx, dy) || 1
    return [x + (dx / len) * by, y + (dy / len) * by] as XY
  })
}

// ----------------------------------------------------------------- planner

interface MeterBuilding {
  ring: XY[]
  inflated: XY[]
  height: number
}

const distXY = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1])

function pointToSegment(p: XY, a: XY, b: XY): number {
  const ab = sub(b, a)
  const len2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2))
  return distXY(p, [a[0] + ab[0] * t, a[1] + ab[1] * t])
}

/** A* over the first `n` nodes of the visibility graph (node 0 = start,
 * 1 = goal; euclid heuristic is consistent, so closed-set A* is exact).
 * Edges are validated lazily through `crosses` — only when they would
 * improve a node — which is what keeps the full-graph tier affordable. */
function shortestPath(
  nodes: XY[],
  n: number,
  crosses: (u: number, v: number) => boolean,
): XY[] | null {
  const g = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  g[0] = 0
  for (;;) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!done[i] && g[i] !== Infinity) {
        const f = g[i] + distXY(nodes[i], nodes[1])
        if (f < best) {
          best = f
          u = i
        }
      }
    }
    if (u === -1) return null // open set empty — the graph is exhausted
    if (u === 1) break
    done[u] = true
    for (let v = 0; v < n; v++) {
      if (done[v]) continue
      const d = g[u] + distXY(nodes[u], nodes[v])
      if (d < g[v] && !crosses(u, v)) {
        g[v] = d
        prev[v] = u
      }
    }
  }
  const out: XY[] = []
  for (let v = prev[1]; v > 0; v = prev[v]) out.unshift(nodes[v])
  return out
}

/**
 * Best feasible polyline a→b around the blockers: a visibility graph over
 * their inflated corners, searched in progressively wider tiers so the
 * common case stays cheap while a long wall or dense cluster still gets a
 * wide swing. Returns intermediate corners only (may be []), or null ONLY
 * when the full graph is exhausted — i.e. every gap is narrower than
 * 2×clearance (inflated footprints seal it) or an endpoint is walled in.
 */
function detourAround(a: XY, b: XY, blockers: MeterBuilding[]): XY[] | null {
  // Corner nodes, slightly re-inflated so graph edges don't graze the very
  // polygon their endpoint sits on; corners buried inside a NEIGHBOURING
  // inflated footprint are unusable (that's how too-narrow gaps seal).
  let corners: XY[] = []
  for (const bl of blockers) corners.push(...inflateRing(bl.inflated, 0.5))
  corners = corners.filter((c) => !blockers.some((bl) => insidePolygon(c, bl.inflated)))
  // Nearest-to-the-leg corners first: the tier prefixes below slice this
  // order, and the hard cap drops only the farthest corners.
  corners.sort((c1, c2) => pointToSegment(c1, a, b) - pointToSegment(c2, a, b))
  if (corners.length > MAX_CORNERS) corners = corners.slice(0, MAX_CORNERS)
  const nodes: XY[] = [a, b, ...corners]

  // Edge tests are the cost — cache them across tiers (node indices are
  // stable because tiers are prefixes of one sorted list).
  const crossCache = new Map<number, boolean>()
  const crosses = (u: number, v: number) => {
    const key = u < v ? u * nodes.length + v : v * nodes.length + u
    let hit = crossCache.get(key)
    if (hit === undefined) {
      hit = blockers.some((bl) => segmentThroughPolygon(nodes[u], nodes[v], bl.inflated) != null)
      crossCache.set(key, hit)
    }
    return hit
  }

  let lastN = 0
  for (const tier of DETOUR_TIERS_M) {
    let n = 2
    while (n - 2 < corners.length && pointToSegment(corners[n - 2], a, b) <= tier) n++
    if (n <= lastN) continue // tier adds no new corners — same graph
    lastN = n
    const via = shortestPath(nodes, n, crosses)
    if (via) return via
  }
  return null
}

/**
 * Plan the whole flight. Points carry their sampled ground z; the leg
 * altitude is ground+cruise at each end, linearly interpolated between.
 */
export function planFlight(
  points: PlanPoint[],
  buildings: Building[],
  opts: PlanOptions,
): FlightPlan {
  const clearance = opts.clearance ?? DEFAULT_CLEARANCE
  const legs: PlannedLeg[] = []
  if (points.length < 2) {
    return { legs, path: points.map((p) => ({ lon: p.lon, lat: p.lat, z: p.ground + opts.cruise })), climbs: 0, detours: 0, blocked: 0 }
  }

  const f = frameFor(points[0].lat)
  const meterBuildings: MeterBuilding[] = buildings.map((b) => {
    const ring = b.ring.map((p) => toM(p, f))
    return { ring, inflated: inflateRing(ring, clearance), height: b.height }
  })

  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i]
    const B = points[i + 1]
    const a = toM([A.lon, A.lat], f)
    const b = toM([B.lon, B.lat], f)
    const zA = A.ground + opts.cruise
    const zB = B.ground + opts.cruise
    const groundAt = (t: number) => A.ground + (B.ground - A.ground) * t
    const zAt = (t: number) => zA + (zB - zA) * t

    // Everything tall enough near this leg (corridor) — the obstacle set
    // for BOTH the direct test and any detour edges (a detour must not be
    // pushed into a different building). "Near" = a corner within range OR
    // the leg passes through it — a large footprint can cross mid-leg with
    // every corner far away.
    const corridor = meterBuildings.filter(
      (mb) =>
        mb.ring.some((c) => pointToSegment(c, a, b) <= CORRIDOR_M) ||
        segmentThroughPolygon(a, b, mb.ring) != null,
    )

    // Direct-line blockers: crossing the leg AND poking above its altitude.
    let requiredZ = -Infinity
    const lineBlockers = corridor.filter((mb) => {
      const through = segmentThroughPolygon(a, b, mb.inflated)
      if (!through) return false
      const [tIn, tOut] = through
      const topAbs = groundAt((tIn + tOut) / 2) + mb.height
      const flightZ = Math.min(zAt(tIn), zAt(tOut))
      if (topAbs + clearance <= flightZ) return false
      requiredZ = Math.max(requiredZ, topAbs + clearance)
      return true
    })

    if (lineBlockers.length === 0) {
      legs.push({
        mode: 'direct',
        path: [
          { lon: A.lon, lat: A.lat, z: zA },
          { lon: B.lon, lat: B.lat, z: zB },
        ],
      })
      continue
    }

    // Climb: a trapezoid over the whole leg, capped by the AGL ceiling.
    const ceilingAbs = Math.max(A.ground, B.ground) + opts.ceiling
    if (opts.allowClimb && requiredZ <= ceilingAbs) {
      const zClimb = Math.max(requiredZ, zA, zB)
      legs.push({
        mode: 'climb',
        path: [
          { lon: A.lon, lat: A.lat, z: zA },
          { lon: A.lon, lat: A.lat, z: zClimb },
          { lon: B.lon, lat: B.lat, z: zClimb },
          { lon: B.lon, lat: B.lat, z: zB },
        ],
      })
      continue
    }

    // Detour at cruise around every building in the DATA BBOX taller than
    // the leg's lower altitude (conservative — the drone may dip toward the
    // lower end). Deliberately NOT corridor-limited: a wide swing must both
    // see distant corners and be checked against distant obstacles, or
    // "blocked" would just mean "didn't look far enough".
    const zMin = Math.min(zA, zB)
    const nearestGround = Math.min(A.ground, B.ground)
    const tallEnough = meterBuildings.filter(
      (mb) => nearestGround + mb.height + clearance > zMin,
    )
    // Truly hopeless fast path: an endpoint standing inside an inflated
    // footprint has no legal position at this altitude at all.
    const endpointSealed = tallEnough.some(
      (mb) => insidePolygon(a, mb.inflated) || insidePolygon(b, mb.inflated),
    )
    const via = endpointSealed ? null : detourAround(a, b, tallEnough)
    if (via) {
      // z interpolates along the detour's cumulative distance.
      const pts: XY[] = [a, ...via, b]
      const cum = [0]
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + distXY(pts[k - 1], pts[k]))
      const total = cum[cum.length - 1] || 1
      legs.push({
        mode: 'detour',
        path: pts.map((p, k) => {
          const ll = toLonLat(p, f)
          return { lon: ll[0], lat: ll[1], z: zA + (zB - zA) * (cum[k] / total) }
        }),
      })
      continue
    }

    legs.push({
      mode: 'blocked',
      path: [
        { lon: A.lon, lat: A.lat, z: zA },
        { lon: B.lon, lat: B.lat, z: zB },
      ],
    })
  }

  const climbs = legs.filter((l) => l.mode === 'climb').length
  const detours = legs.filter((l) => l.mode === 'detour').length
  const blocked = legs.filter((l) => l.mode === 'blocked').length
  const path: FlightPoint[] = []
  if (blocked === 0) {
    for (const leg of legs) {
      for (const p of leg.path) {
        const last = path[path.length - 1]
        if (!last || last.lon !== p.lon || last.lat !== p.lat || last.z !== p.z) path.push(p)
      }
    }
  }
  return { legs, path, climbs, detours, blocked }
}
