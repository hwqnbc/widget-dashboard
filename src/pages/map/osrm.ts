/**
 * Route distance via the FOSSGIS-run public OSRM server
 * (https://routing.openstreetmap.de) — free, no API key, CORS-open.
 * Usage policy: attribution, sensible volume (≤1 request/second). We only
 * fire one request per user-picked A→B pair, well inside that.
 */

export type RouteProfile = 'walk' | 'bike' | 'drive'
export type LonLat = [number, number]

/** Endpoint path per profile — `/route/v1/driving/` after it is literal OSRM
 * API boilerplate; the profile is chosen by the server instance. */
const OSRM_PROFILE_PATH: Record<RouteProfile, string> = {
  drive: 'routed-car',
  bike: 'routed-bike',
  walk: 'routed-foot',
}

export interface OsrmRoute {
  distanceM: number
  durationS: number
  /** WGS84 lon/lat path of the route line. */
  path: LonLat[]
}

interface OsrmResponse {
  code: string
  routes?: {
    distance: number
    duration: number
    geometry: { coordinates: LonLat[] }
  }[]
}

export async function fetchOsrmRoute(
  profile: RouteProfile,
  a: LonLat,
  b: LonLat,
  signal?: AbortSignal,
): Promise<OsrmRoute> {
  const url =
    `https://routing.openstreetmap.de/${OSRM_PROFILE_PATH[profile]}` +
    `/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}` +
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
  }
}
