/**
 * Pure 3D flight-path math for the Map page's drone flight tool — no ArcGIS
 * imports, so e2e/run.mjs bundles it and the suite unit-tests sampling
 * without a live map. (NOT named flightModel: the Drone Sim widget already
 * owns that basename in the flat e2e bundle dir.)
 *
 * Horizontal math uses the same equirectangular meter approximation as
 * routeGeometry.ts; z is absolute meters and simply interpolates.
 */

export interface FlightPoint {
  lon: number
  lat: number
  /** Absolute elevation, meters (ground z + cruise height). */
  z: number
}

export interface FlightPath {
  points: FlightPoint[]
  /** Cumulative 3D distance (meters) at each point; cum[0] = 0. */
  cum: number[]
  /** Total path length, meters. */
  total: number
}

export interface FlightSample {
  lon: number
  lat: number
  z: number
  /** Travel direction, degrees clockwise from north (ArcGIS heading). */
  headingDeg: number
  /** True once dist has reached the end of the path. */
  done: boolean
}

const EARTH_M_PER_DEG = 111_320

/** 3D distance between two flight points, meters. */
function dist3(a: FlightPoint, b: FlightPoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  const dx = (b.lon - a.lon) * EARTH_M_PER_DEG * cosLat
  const dy = (b.lat - a.lat) * EARTH_M_PER_DEG
  const dz = b.z - a.z
  return Math.hypot(dx, dy, dz)
}

/** Heading of travel a→b, degrees clockwise from north. Falls back to 0 for
 * a purely vertical (or zero-length) hop. */
function heading(a: FlightPoint, b: FlightPoint): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  const dx = (b.lon - a.lon) * cosLat
  const dy = b.lat - a.lat
  if (dx === 0 && dy === 0) return 0
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

export function buildFlightPath(points: FlightPoint[]): FlightPath {
  const cum: number[] = points.map(() => 0)
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + dist3(points[i - 1], points[i])
  }
  return { points, cum, total: cum[cum.length - 1] ?? 0 }
}

/**
 * Position + heading at `dist` meters along the path. Clamps to the ends;
 * `done` flips once dist reaches the total (a path with fewer than two
 * points is done immediately, parked on its only point if any).
 */
export function sampleFlight(path: FlightPath, dist: number): FlightSample | null {
  const { points, cum, total } = path
  if (points.length === 0) return null
  if (points.length === 1) {
    const p = points[0]
    return { lon: p.lon, lat: p.lat, z: p.z, headingDeg: 0, done: true }
  }
  const d = Math.max(0, Math.min(dist, total))
  // Find the segment containing d (cum is monotonic; paths are short).
  let i = 1
  while (i < cum.length - 1 && cum[i] < d) i++
  const a = points[i - 1]
  const b = points[i]
  const segLen = cum[i] - cum[i - 1]
  const t = segLen === 0 ? 0 : (d - cum[i - 1]) / segLen
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    z: a.z + (b.z - a.z) * t,
    headingDeg: heading(a, b),
    done: dist >= total,
  }
}
