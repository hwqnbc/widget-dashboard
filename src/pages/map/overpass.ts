/**
 * Thin Overpass API client for the drone flight planner — building
 * footprints + height tags in a bbox. Free public OSM query service, no
 * key, CORS-open (the OSRM pattern: fetch, parse via the pure module,
 * fair-use throttled). The result is capped (`out geom qt 400`) so a dense
 * CBD corridor may be truncated — the planner treats missing buildings as
 * absent, which is why docs/map.md calls the round-2 planning approximate.
 */

import { parseOverpassBuildings, type Building } from './flightPlanModel'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const MIN_INTERVAL_MS = 1000

export interface Bbox {
  south: number
  west: number
  north: number
  east: number
}

/** The plan's bbox, inflated by ~meters on every side. */
export function bboxAround(points: { lon: number; lat: number }[], marginM = 150): Bbox | null {
  if (points.length === 0) return null
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const p of points) {
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
    west = Math.min(west, p.lon)
    east = Math.max(east, p.lon)
  }
  const dLat = marginM / 111_320
  const dLon = dLat / Math.max(0.2, Math.cos(((south + north) / 2) * (Math.PI / 180)))
  return { south: south - dLat, west: west - dLon, north: north + dLat, east: east + dLon }
}

const contains = (outer: Bbox, inner: Bbox) =>
  inner.south >= outer.south &&
  inner.west >= outer.west &&
  inner.north <= outer.north &&
  inner.east <= outer.east

// One cached corridor per session: while the plan stays inside the cached
// bbox no request is made at all (politeness + snappy re-planning).
let cachedBbox: Bbox | null = null
let cachedBuildings: Building[] | null = null
let lastFetchAt = 0

/** Test seam: drop the module cache (unused in production code paths). */
export function clearOverpassCache() {
  cachedBbox = null
  cachedBuildings = null
  lastFetchAt = 0
}

/**
 * Buildings covering `bbox`, from cache when possible. Fetches a margin
 * larger than asked so small waypoint nudges keep hitting the cache.
 * Throws on network/HTTP failure (the hook maps that to its error state).
 */
export async function fetchBuildings(bbox: Bbox, signal?: AbortSignal): Promise<Building[]> {
  if (cachedBbox && cachedBuildings && contains(cachedBbox, bbox)) return cachedBuildings

  // Fair-use spacing between real requests.
  const wait = lastFetchAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  signal?.throwIfAborted()
  lastFetchAt = Date.now()

  const growLat = (bbox.north - bbox.south) * 0.5
  const growLon = (bbox.east - bbox.west) * 0.5
  const fetched: Bbox = {
    south: bbox.south - growLat,
    west: bbox.west - growLon,
    north: bbox.north + growLat,
    east: bbox.east + growLon,
  }
  const bboxStr = `${fetched.south},${fetched.west},${fetched.north},${fetched.east}`
  const query = `[out:json][timeout:10];way["building"](${bboxStr});out geom qt 400;`
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  })
  if (!response.ok) throw new Error(`Overpass ${response.status}`)
  const buildings = parseOverpassBuildings(await response.json())
  cachedBbox = fetched
  cachedBuildings = buildings
  return buildings
}
