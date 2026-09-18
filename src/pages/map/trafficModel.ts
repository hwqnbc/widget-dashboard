/**
 * Traffic cameras — pure module (no ArcGIS/fetch imports) so the e2e
 * runner can bundle and unit-test it. Data shape is data.gov.sg
 * `/v1/transport/traffic-images`: `items[0].cameras[]`, each with a
 * camera_id, a live snapshot URL (unique per capture — refetching the
 * list IS the refresh) and a WGS84 location.
 */

export interface TrafficCam {
  id: string
  lon: number
  lat: number
  imageUrl: string
  timestamp: string
}

/**
 * Defensive parse: rows missing an id/image/finite coords are skipped,
 * duplicate ids keep the first row, and any malformed envelope yields `[]`
 * — a bad payload must degrade to "no cameras", never crash the page.
 */
export function parseTrafficCameras(json: unknown): TrafficCam[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const cameras = (items[0] as { cameras?: unknown })?.cameras
  if (!Array.isArray(cameras)) return []
  const out: TrafficCam[] = []
  const seen = new Set<string>()
  for (const raw of cameras) {
    const cam = raw as {
      camera_id?: unknown
      image?: unknown
      timestamp?: unknown
      location?: { latitude?: unknown; longitude?: unknown }
    }
    const id = typeof cam?.camera_id === 'string' ? cam.camera_id : ''
    const imageUrl = typeof cam?.image === 'string' ? cam.image : ''
    const lat = Number(cam?.location?.latitude)
    const lon = Number(cam?.location?.longitude)
    if (!id || !imageUrl || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      lon,
      lat,
      imageUrl,
      timestamp: typeof cam?.timestamp === 'string' ? cam.timestamp : '',
    })
  }
  return out
}

/** "updated hh:mm:ss" for the control caption ('' for a bad timestamp). */
export function updatedLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `updated ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** CCTV marker icon as an inline SVG data URI — no network asset, renders
 * offline: a rounded blue badge with a white wall-mounted cctv glyph. */
export const CCTV_ICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <rect x="2" y="2" width="40" height="40" rx="10" fill="#1565c0" stroke="#ffffff" stroke-width="3"/>
  <g fill="#ffffff">
    <rect x="9" y="14" width="20" height="9" rx="2.5" transform="rotate(14 19 18.5)"/>
    <rect x="26.5" y="19.5" width="6" height="5" rx="1" transform="rotate(14 29.5 22)"/>
    <rect x="13" y="24" width="3" height="8" rx="1.2"/>
    <rect x="9" y="30.5" width="16" height="3" rx="1.5"/>
  </g>
</svg>`,
)}`
