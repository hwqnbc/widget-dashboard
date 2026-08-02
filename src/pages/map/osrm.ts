/**
 * Route distance via the FOSSGIS-run public OSRM server
 * (https://routing.openstreetmap.de) — free, no API key, CORS-open.
 * Usage policy: attribution, sensible volume (≤1 request/second). We only
 * fire one request per user waypoint edit, well inside that.
 */
import type { LonLat } from './routeGeometry'
import type { RouteProfile } from '../../features/map/mapSlice'

export type { LonLat, RouteProfile }

/** Endpoint path per profile — `/route/v1/driving/` after it is literal OSRM
 * API boilerplate; the profile is chosen by the server instance. */
const OSRM_PROFILE_PATH: Record<RouteProfile, string> = {
  drive: 'routed-car',
  bike: 'routed-bike',
  walk: 'routed-foot',
}

export interface OsrmLeg {
  distanceM: number
  durationS: number
}

export interface OsrmRoute {
  distanceM: number
  durationS: number
  /** WGS84 lon/lat path of the route line. */
  path: LonLat[]
  /** Each input waypoint snapped onto the road network, same order. */
  snapped: LonLat[]
  /** One entry per consecutive waypoint pair, in route order. */
  legs: OsrmLeg[]
}

interface OsrmResponse {
  code: string
  routes?: {
    distance: number
    duration: number
    geometry: { coordinates: LonLat[] }
    legs?: { distance: number; duration: number }[]
  }[]
  waypoints?: { location: LonLat }[]
}

/** Route through every waypoint in order (OSRM takes N `;`-separated
 * coordinates in one request). Needs at least two points. */
export async function fetchOsrmRoute(
  profile: RouteProfile,
  points: LonLat[],
  signal?: AbortSignal,
): Promise<OsrmRoute> {
  if (points.length < 2) throw new Error('need at least two waypoints')
  const coords = points.map(([lon, lat]) => `${lon},${lat}`).join(';')
  const url =
    `https://routing.openstreetmap.de/${OSRM_PROFILE_PATH[profile]}` +
    `/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`OSRM ${res.status}`)
  const json = (await res.json()) as OsrmResponse
  const route = json.routes?.[0]
  if (json.code !== 'Ok' || !route) throw new Error(`OSRM code ${json.code}`)
  return {
    distanceM: route.distance,
    durationS: route.duration,
    path: route.geometry.coordinates,
    snapped: (json.waypoints ?? []).map((w) => w.location),
    legs: (route.legs ?? []).map((l) => ({ distanceM: l.distance, durationS: l.duration })),
  }
}
