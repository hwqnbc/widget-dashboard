import { parseTrafficCameras, type TrafficCam } from './trafficModel'

/** data.gov.sg live LTA traffic cameras — free, no API key, CORS-enabled.
 * Every call returns the LATEST capture per camera (image URLs are unique
 * per capture), so refreshing is just calling this again. */
const TRAFFIC_URL = 'https://api.data.gov.sg/v1/transport/traffic-images'

/** Fetch + parse the current camera list; throws on network/HTTP errors
 * (the caller owns the error status). */
export async function fetchTrafficCameras(signal?: AbortSignal): Promise<TrafficCam[]> {
  const res = await fetch(TRAFFIC_URL, { signal })
  if (!res.ok) throw new Error(`traffic cameras: HTTP ${res.status}`)
  return parseTrafficCameras(await res.json())
}
