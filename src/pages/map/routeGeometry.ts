/**
 * Pure geometry for the route tool's waypoint editing — no ArcGIS imports,
 * so the e2e harness bundles it (e2e/run.mjs) and unit-tests the insert
 * logic without a live map.
 *
 * All math runs in an equirectangular approximation (lon scaled by
 * cos(lat)); for tap-tolerance distances (tens of meters to a few km) that
 * is far more accurate than a finger.
 */

export type LonLat = [number, number]

const EARTH_M_PER_DEG = 111_320 // meters per degree of latitude

/** Squared planar distance helpers in meter space around a reference lat. */
function toMeters(pt: LonLat, cosLat: number): [number, number] {
  return [pt[0] * EARTH_M_PER_DEG * cosLat, pt[1] * EARTH_M_PER_DEG]
}

export interface NearestOnPath {
  /** Distance from the point to the nearest spot on the path, meters. */
  distMeters: number
  /** Index of the path segment ([segIndex] → [segIndex+1]) that spot is on. */
  segIndex: number
  /** Position along that segment, 0..1. */
  t: number
  /** Position along the whole path: segIndex + t (monotonic path measure). */
  measure: number
}

/** Nearest point-to-segment over a polyline. Returns null for paths with
 * fewer than two vertices. */
export function nearestOnPath(path: LonLat[], pt: LonLat): NearestOnPath | null {
  if (path.length < 2) return null
  const cosLat = Math.cos((pt[1] * Math.PI) / 180)
  const p = toMeters(pt, cosLat)
  let best: NearestOnPath | null = null
  for (let i = 0; i < path.length - 1; i++) {
    const a = toMeters(path[i], cosLat)
    const b = toMeters(path[i + 1], cosLat)
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const len2 = abx * abx + aby * aby
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2))
    const dx = p[0] - (a[0] + abx * t)
    const dy = p[1] - (a[1] + aby * t)
    const dist = Math.hypot(dx, dy)
    if (!best || dist < best.distMeters) {
      best = { distMeters: dist, segIndex: i, t, measure: i + t }
    }
  }
  return best
}

/**
 * Which waypoint slot a clicked-on-the-route point belongs in: project the
 * click and every (road-snapped) waypoint onto the path's monotonic measure,
 * and return the index of the first waypoint whose measure lies beyond the
 * click — i.e. insert between its predecessor and it. Clamped to the
 * interior (never 0, never beyond the last), so the endpoints stay the
 * start/destination.
 */
export function insertIndexFor(path: LonLat[], snapped: LonLat[], click: LonLat): number {
  const clickPos = nearestOnPath(path, click)
  if (!clickPos || snapped.length < 2) return Math.max(1, snapped.length - 1)
  const measures = snapped.map((wp) => nearestOnPath(path, wp)?.measure ?? 0)
  for (let i = 1; i < measures.length; i++) {
    if (clickPos.measure <= measures[i]) {
      return Math.min(Math.max(i, 1), snapped.length - 1)
    }
  }
  return snapped.length - 1
}

/**
 * "Clicked near the line" tolerance in meters for a given view `scale`
 * (`scale` exists on MapView AND SceneView, unlike `resolution`): the
 * standard 96 dpi map-scale relation gives meters-per-pixel, times the
 * desired pixel radius.
 */
export function pathDistanceThresholdMeters(scale: number, px = 12): number {
  return (scale * 0.0254 * px) / 96
}
