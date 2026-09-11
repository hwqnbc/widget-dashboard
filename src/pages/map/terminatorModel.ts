/**
 * Day/night terminator math — pure module (no ArcGIS imports) so the e2e
 * runner can bundle and unit-test it, and the binding stays a thin draw.
 *
 * Solar position uses the standard low-precision ephemeris (Astronomical
 * Almanac approximation, the same family Leaflet.Terminator and suncalc
 * use): accurate to well under a degree for decades around J2000 — far
 * beyond what a shaded overlay needs.
 */

const DEG = Math.PI / 180

/** Milliseconds at the J2000 epoch (2000-01-01T12:00Z). */
const J2000_MS = Date.UTC(2000, 0, 1, 12)

const normDeg = (d: number) => ((d % 360) + 360) % 360
/** Wrap to [-180, 180). */
export const wrapLon = (d: number) => normDeg(d + 180) - 180

/** Where the sun is directly overhead right now (WGS84 lon/lat, degrees). */
export function subsolarPoint(date: Date): { lon: number; lat: number } {
  const n = (date.getTime() - J2000_MS) / 86400000 // days since J2000
  const L = normDeg(280.46 + 0.9856474 * n) // mean longitude
  const g = normDeg(357.528 + 0.9856003 * n) * DEG // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG
  const eps = (23.439 - 0.0000004 * n) * DEG // obliquity
  const lat = Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG // declination
  // Right ascension → equation of time → subsolar longitude: the sun sits
  // over the meridian whose LOCAL apparent solar time is exactly 12:00.
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG
  const eqTimeDeg = wrapLon(L - alpha) // (mean − apparent) sun, in degrees
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lon = wrapLon(-15 * (utcHours - 12) - eqTimeDeg)
  return { lon, lat }
}

/**
 * The given local calendar day (ISO `YYYY-MM-DD`; absent or malformed →
 * today) at the given local wall-clock time of day (fractional hours).
 */
export function sunDate(hour: number, dayIso?: string): Date {
  let d = dayIso ? new Date(`${dayIso}T00:00:00`) : new Date() // local midnight
  if (Number.isNaN(d.getTime())) d = new Date()
  d.setHours(Math.floor(hour), Math.round((hour - Math.floor(hour)) * 60), 0, 0)
  return d
}

/**
 * The sun as seen from a point: azimuth (degrees clockwise from north,
 * 90 = east) and elevation above the horizon (negative = below). Standard
 * spherical astronomy off the same subsolar point the terminator uses —
 * the hour angle here is measured from the observer's meridian westward.
 */
export function sunPosition(
  date: Date,
  lon: number,
  lat: number,
): { azimuth: number; elevation: number } {
  const sun = subsolarPoint(date)
  const H = (lon - sun.lon) * DEG // hour angle (0 = local solar noon)
  const phi = lat * DEG
  const decl = sun.lat * DEG
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG
  const azimuth =
    Math.atan2(
      -Math.sin(H) * Math.cos(decl),
      Math.sin(decl) * Math.cos(phi) - Math.cos(decl) * Math.sin(phi) * Math.cos(H),
    ) / DEG
  return { azimuth: normDeg(azimuth), elevation }
}

/**
 * Latitude of the terminator at a given longitude: solving solar
 * elevation = 0 gives tan(lat) = -cos(H) / tan(declination), with H the
 * hour angle from the subsolar meridian. Declination is clamped away from
 * exactly 0 (equinox instant) where the terminator degenerates into a
 * meridian pair and tan(0) would blow up.
 */
export function terminatorLatitude(
  lon: number,
  subsolar: { lon: number; lat: number },
): number {
  const decl = Math.abs(subsolar.lat) < 0.001 ? (subsolar.lat < 0 ? -0.001 : 0.001) : subsolar.lat
  const H = (lon - subsolar.lon) * DEG
  return Math.atan(-Math.cos(H) / Math.tan(decl * DEG)) / DEG
}

/**
 * The night hemisphere as one closed WGS84 ring ([lon, lat] pairs): the
 * terminator curve traced west→east across [-180, 180], closed along the
 * dark pole's edge — every edge stays inside [-180, 180], so no dateline
 * split is needed. `stepDeg` controls the trace density.
 */
export function nightRing(date: Date, stepDeg = 2): [number, number][] {
  const sun = subsolarPoint(date)
  const ring: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    ring.push([lon, terminatorLatitude(lon, sun)])
  }
  if (ring[ring.length - 1][0] !== 180) ring.push([180, terminatorLatitude(180, sun)])
  // Northern-summer sun (decl > 0) leaves the SOUTH polar cap in night, and
  // vice versa. lat ±89.99 keeps the cap edge off the exact pole, where 2D
  // projections pinch every longitude into one point.
  const poleLat = sun.lat > 0 ? -89.99 : 89.99
  ring.push([180, poleLat], [-180, poleLat], ring[0])
  return ring
}
