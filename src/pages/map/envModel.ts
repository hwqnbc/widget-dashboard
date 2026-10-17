/**
 * NEA environment feeds (haze PSI + 2-hour weather forecast) — pure module
 * (no ArcGIS/fetch imports) so the e2e runner can bundle and unit-test it.
 * Shapes are data.gov.sg `/v1/environment/psi` and
 * `/v1/environment/2-hour-weather-forecast`.
 */

export interface PsiRegion {
  name: string
  lon: number
  lat: number
  psi: number
  pm25: number
  /** 1-hourly PM2.5 (separate NEA feed) — absent when that feed fails. */
  pm25OneHr?: number
}

/**
 * Defensive parse of the PSI payload: `region_metadata` gives each
 * region's location, `items[0].readings` the 24-h PSI and PM2.5 maps.
 * `national` has no marker location and is skipped; malformed regions are
 * skipped; a malformed envelope yields `[]` (degrade, never crash).
 */
export function parsePsi(json: unknown): PsiRegion[] {
  const env = json as {
    region_metadata?: unknown
    items?: { readings?: Record<string, Record<string, unknown>> }[]
  }
  const meta = env?.region_metadata
  const readings = Array.isArray(env?.items) ? env.items[0]?.readings : undefined
  if (!Array.isArray(meta) || typeof readings !== 'object' || readings == null) return []
  const psiMap = readings.psi_twenty_four_hourly ?? {}
  const pm25Map = readings.pm25_twenty_four_hourly ?? {}
  const out: PsiRegion[] = []
  const seen = new Set<string>()
  for (const raw of meta) {
    const region = raw as {
      name?: unknown
      label_location?: { latitude?: unknown; longitude?: unknown }
    }
    const name = typeof region?.name === 'string' ? region.name : ''
    const lat = Number(region?.label_location?.latitude)
    const lon = Number(region?.label_location?.longitude)
    const psi = Number(psiMap[name])
    if (!name || name === 'national' || seen.has(name)) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(psi)) continue
    seen.add(name)
    const pm25 = Number(pm25Map[name])
    out.push({ name, lon, lat, psi, pm25: Number.isFinite(pm25) ? pm25 : 0 })
  }
  return out
}

/** Defensive parse of the dedicated PM2.5 feed: region → 1-hourly µg/m³
 * (`items[0].readings.pm25_one_hourly`); malformed → {}. */
export function parsePm25(json: unknown): Record<string, number> {
  const env = json as { items?: { readings?: { pm25_one_hourly?: unknown } }[] }
  const map = Array.isArray(env?.items) ? env.items[0]?.readings?.pm25_one_hourly : undefined
  if (typeof map !== 'object' || map == null) return {}
  const out: Record<string, number> = {}
  for (const [name, value] of Object.entries(map)) {
    const n = Number(value)
    if (Number.isFinite(n)) out[name] = n
  }
  return out
}

/** Attach 1-hourly PM2.5 values to the PSI regions (missing names stay
 * without the optional field). */
export function mergePm25(regions: PsiRegion[], oneHr: Record<string, number>): PsiRegion[] {
  return regions.map((r) => (r.name in oneHr ? { ...r, pm25OneHr: oneHr[r.name] } : r))
}

/** One hourly sample of a regional reading. */
export interface TrendPoint {
  t: number
  v: number
}

/** The hourly series for one region out of a `?date=YYYY-MM-DD` payload —
 * those carry ONE item per hour (the parameterless feed has a single
 * latest item, which this also handles). Rows with a bad timestamp or a
 * non-finite reading are skipped; junk envelopes yield []. */
export function parseHourly(
  json: unknown,
  readingKey: string,
  region: string,
): TrendPoint[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const out: TrendPoint[] = []
  for (const raw of items) {
    const item = raw as { timestamp?: unknown; readings?: Record<string, Record<string, unknown>> }
    const t = typeof item?.timestamp === 'string' ? Date.parse(item.timestamp) : NaN
    const v = Number(item?.readings?.[readingKey]?.[region])
    if (Number.isFinite(t) && Number.isFinite(v)) out.push({ t, v })
  }
  return out.sort((p, q) => p.t - q.t)
}

/** Sort, dedupe by timestamp (last wins — today's partial day refines
 * yesterday's overlap), keep the newest `n` points. */
export function lastHours(points: TrendPoint[], n = 24): TrendPoint[] {
  const byT = new Map<number, TrendPoint>()
  for (const p of [...points].sort((a, b) => a.t - b.t)) byT.set(p.t, p)
  return [...byT.values()].slice(-n)
}

/** Min / max / latest of a trend series (null when empty) — the legend
 * under the sparkline. */
export function seriesStats(
  points: TrendPoint[],
): { min: number; max: number; last: number } | null {
  if (points.length === 0) return null
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p.v < min) min = p.v
    if (p.v > max) max = p.v
  }
  return { min, max, last: points[points.length - 1].v }
}

/** One vertical hour gridline on the sparkline. */
export interface TrendTick {
  x: number
  label: string
}

/** Hour gridlines across the series' span: ticks at whole LOCAL hours,
 * stepped (1/2/3 h by span) so a 24-h window draws ~8 lines; labels are
 * `hh:00`. Same x normalization as sparklinePath. */
export function trendTicks(points: TrendPoint[], w: number, pad = 3): TrendTick[] {
  if (points.length < 2) return []
  const HOUR = 3_600_000
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const span = t1 - t0 || 1
  const hours = span / HOUR
  const step = (hours <= 8 ? 1 : hours <= 16 ? 2 : 3) * HOUR
  const first = new Date(t0)
  first.setMinutes(0, 0, 0)
  let t = first.getTime()
  if (t < t0) t += HOUR
  const out: TrendTick[] = []
  for (; t <= t1; t += step) {
    const d = new Date(t)
    out.push({
      x: pad + ((t - t0) / span) * (w - 2 * pad),
      label: `${String(d.getHours()).padStart(2, '0')}:00`,
    })
  }
  return out
}

/** Polyline path for a small SVG sparkline: x spread by timestamp, y by
 * value (inverted). '' under 2 points; a flat series pads its range ±1 so
 * it draws a midline instead of dividing by zero. */
export function sparklinePath(points: TrendPoint[], w: number, h: number, pad = 3): string {
  if (points.length < 2) return ''
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const tSpan = t1 - t0 || 1
  let vMin = Math.min(...points.map((p) => p.v))
  let vMax = Math.max(...points.map((p) => p.v))
  if (vMin === vMax) {
    vMin -= 1
    vMax += 1
  }
  return points
    .map((p, i) => {
      const x = pad + ((p.t - t0) / tSpan) * (w - 2 * pad)
      const y = pad + (1 - (p.v - vMin) / (vMax - vMin)) * (h - 2 * pad)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** NEA's PSI descriptor bands with marker colors. */
export function psiBand(psi: number): { label: string; color: string } {
  if (psi <= 50) return { label: 'Good', color: '#2e7d32' }
  if (psi <= 100) return { label: 'Moderate', color: '#f9a825' }
  if (psi <= 200) return { label: 'Unhealthy', color: '#ef6c00' }
  if (psi <= 300) return { label: 'Very unhealthy', color: '#c62828' }
  return { label: 'Hazardous', color: '#6a1b9a' }
}

/**
 * The haze marker: a band-colored bubble showing BOTH readings with their
 * labels — `24h PSI n` and `1h PM2.5 n` (the second row only when the
 * pm25 feed delivered). Rendered as an SVG data URI at 2× and displayed
 * half-size by PictureMarkerSymbol for crispness; SVG text rasterizes in
 * the browser, so no Esri font-atlas limits apply (lessons.md #134).
 */
export function psiBubble(psi: number, pm25OneHr?: number): string {
  const { color } = psiBand(psi)
  const hasPm25 = pm25OneHr != null && Number.isFinite(pm25OneHr)
  const h = hasPm25 ? 64 : 40
  // 150 wide with values end-anchored at x=140: the widest label
  // ("1h PM2.5", ~66px at font 16) and a 3-digit bold value (~38px) keep a
  // clear gap — at 112 wide they collided.
  const rows =
    `<text x="10" y="28" font-size="16" fill="#ffffff" fill-opacity="0.85">24h PSI</text>` +
    `<text x="140" y="28" font-size="21" font-weight="bold" fill="#ffffff" text-anchor="end">${Math.round(psi)}</text>` +
    (hasPm25
      ? `<text x="10" y="54" font-size="16" fill="#ffffff" fill-opacity="0.85">1h PM2.5</text>` +
        `<text x="140" y="54" font-size="21" font-weight="bold" fill="#ffffff" text-anchor="end">${Math.round(pm25OneHr)}</text>`
      : '')
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="${h}" viewBox="0 0 150 ${h}">
<rect x="1.5" y="1.5" width="147" height="${h - 3}" rx="10" fill="${color}" stroke="#ffffff" stroke-width="3"/>
<g font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">${rows}</g>
</svg>`,
  )}`
}

export interface WeatherArea {
  name: string
  lon: number
  lat: number
  forecast: string
}

/**
 * Defensive parse of the 2-hour forecast: `area_metadata` locations joined
 * with `items[0].forecasts` by area name. Rows without a location, a
 * forecast string, or with duplicate names are skipped; malformed → [].
 */
export function parseForecast(json: unknown): WeatherArea[] {
  const env = json as {
    area_metadata?: unknown
    items?: { forecasts?: unknown }[]
  }
  const meta = env?.area_metadata
  const forecasts = Array.isArray(env?.items) ? env.items[0]?.forecasts : undefined
  if (!Array.isArray(meta) || !Array.isArray(forecasts)) return []
  const byArea = new Map<string, string>()
  for (const raw of forecasts) {
    const f = raw as { area?: unknown; forecast?: unknown }
    if (typeof f?.area === 'string' && typeof f?.forecast === 'string') {
      byArea.set(f.area, f.forecast)
    }
  }
  const out: WeatherArea[] = []
  const seen = new Set<string>()
  for (const raw of meta) {
    const area = raw as {
      name?: unknown
      label_location?: { latitude?: unknown; longitude?: unknown }
    }
    const name = typeof area?.name === 'string' ? area.name : ''
    const lat = Number(area?.label_location?.latitude)
    const lon = Number(area?.label_location?.longitude)
    const forecast = byArea.get(name)
    if (!name || seen.has(name) || !forecast) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    seen.add(name)
    out.push({ name, lon, lat, forecast })
  }
  return out
}

/** NEA forecast text → a marker emoji (keyword map; specific before
 * general so "Partly Cloudy" never falls into the plain-cloud bucket). */
export function forecastEmoji(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('thundery')) return '⛈️'
  if (t.includes('shower') || t.includes('rain')) return '🌧️'
  if (t.includes('hazy') || t.includes('mist') || t.includes('fog')) return '🌫️'
  if (t.includes('windy')) return '💨'
  if (t.includes('partly')) return '⛅'
  if (t.includes('cloudy') || t.includes('overcast')) return '☁️'
  if (t.includes('fair') && t.includes('night')) return '🌙'
  if (t.includes('fair') || t.includes('sunny')) return '☀️'
  return '🌤️'
}

export type WeatherIconKind =
  | 'thunder'
  | 'rain'
  | 'haze'
  | 'wind'
  | 'partly'
  | 'cloud'
  | 'night'
  | 'sun'
  | 'other'

/** Same keyword order as forecastEmoji, but yielding an icon kind — the
 * MAP markers must be inline-SVG PictureMarkerSymbols, because ArcGIS
 * TextSymbol glyphs come from Esri font atlases that carry NO emoji
 * (emoji text draws nothing; lessons.md). Emoji stay for DOM text. */
export function forecastIconKind(text: string): WeatherIconKind {
  const t = text.toLowerCase()
  if (t.includes('thundery')) return 'thunder'
  if (t.includes('shower') || t.includes('rain')) return 'rain'
  if (t.includes('hazy') || t.includes('mist') || t.includes('fog')) return 'haze'
  if (t.includes('windy')) return 'wind'
  if (t.includes('partly')) return 'partly'
  if (t.includes('cloudy') || t.includes('overcast')) return 'cloud'
  if (t.includes('fair') && t.includes('night')) return 'night'
  if (t.includes('fair') || t.includes('sunny')) return 'sun'
  return 'other'
}

const svgUri = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
<circle cx="18" cy="18" r="17" fill="#ffffff" fill-opacity="0.92" stroke="#90a4ae" stroke-width="1"/>
${body}
</svg>`,
  )}`

const SUN = '<circle cx="18" cy="18" r="7" fill="#fbc02d"/><g stroke="#fbc02d" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="4" x2="18" y2="8"/><line x1="18" y1="28" x2="18" y2="32"/><line x1="4" y1="18" x2="8" y2="18"/><line x1="28" y1="18" x2="32" y2="18"/><line x1="8.1" y1="8.1" x2="10.9" y2="10.9"/><line x1="25.1" y1="25.1" x2="27.9" y2="27.9"/><line x1="8.1" y1="27.9" x2="10.9" y2="25.1"/><line x1="25.1" y1="10.9" x2="27.9" y2="8.1"/></g>'
const CLOUD = (y = 0, fill = '#78909c') =>
  `<g transform="translate(0 ${y})" fill="${fill}"><circle cx="13" cy="19" r="6"/><circle cx="21" cy="16" r="7"/><circle cx="26" cy="21" r="5"/><rect x="11" y="19" width="16" height="7" rx="3.5"/></g>`

/** Marker icons for the weather layer: small SVG badges as data URIs —
 * no network assets, and guaranteed to draw where emoji TextSymbols do not. */
export const WEATHER_ICONS: Record<WeatherIconKind, string> = {
  sun: svgUri(SUN),
  night: svgUri(
    '<circle cx="18" cy="18" r="9" fill="#37474f"/><circle cx="21.5" cy="15" r="8" fill="#ffffff" fill-opacity="0.92"/>',
  ),
  cloud: svgUri(CLOUD(0)),
  partly: svgUri(
    '<circle cx="13" cy="13" r="6" fill="#fbc02d"/>' + CLOUD(4, '#90a4ae'),
  ),
  rain: svgUri(
    CLOUD(-3) +
      '<g stroke="#1976d2" stroke-width="2.4" stroke-linecap="round"><line x1="13" y1="26" x2="11.5" y2="31"/><line x1="19" y1="26" x2="17.5" y2="31"/><line x1="25" y1="26" x2="23.5" y2="31"/></g>',
  ),
  thunder: svgUri(
    CLOUD(-4, '#546e7a') + '<polygon points="19,21 13,28 17.5,28 15.5,33 23,25.5 18.5,25.5 21,21" fill="#fbc02d"/>',
  ),
  haze: svgUri(
    '<g stroke="#90a4ae" stroke-width="2.6" stroke-linecap="round"><line x1="9" y1="13" x2="27" y2="13"/><line x1="7" y1="18" x2="29" y2="18"/><line x1="9" y1="23" x2="27" y2="23"/></g>',
  ),
  wind: svgUri(
    '<g stroke="#4fc3f7" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M7 14 h14 a3.5 3.5 0 1 0 -3.5 -3.5"/><path d="M7 20 h18 a3.5 3.5 0 1 1 -3.5 3.5"/><path d="M7 26 h10"/></g>',
  ),
  other: svgUri('<circle cx="12.5" cy="12.5" r="5.5" fill="#fbc02d"/>' + CLOUD(5, '#b0bec5')),
}

/* ---------------------------------------------------------------- outlook */

/** The island-wide next-24-h outlook (`24-hour-weather-forecast` →
 * `items[0].general`): one forecast string plus temperature / humidity /
 * wind ranges. Humidity and wind are optional — a row missing them still
 * shows the forecast + temperature. */
export interface Outlook24h {
  forecast: string
  tempLow: number
  tempHigh: number
  humidity?: { low: number; high: number }
  wind?: { low: number; high: number; direction: string }
}

const finitePair = (raw: unknown): { low: number; high: number } | undefined => {
  const p = raw as { low?: unknown; high?: unknown }
  const low = Number(p?.low)
  const high = Number(p?.high)
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : undefined
}

/** Defensive parse of the 24-hour forecast's `general` block; null when the
 * forecast text or temperature range is missing (nothing worth showing). */
export function parseOutlook24(json: unknown): Outlook24h | null {
  const env = json as { items?: { general?: unknown }[] }
  const g = (Array.isArray(env?.items) ? env.items[0]?.general : undefined) as
    | {
        forecast?: unknown
        temperature?: unknown
        relative_humidity?: unknown
        wind?: { speed?: unknown; direction?: unknown }
      }
    | undefined
  const forecast = typeof g?.forecast === 'string' ? g.forecast : ''
  const temp = finitePair(g?.temperature)
  if (!forecast || !temp) return null
  const out: Outlook24h = { forecast, tempLow: temp.low, tempHigh: temp.high }
  const humidity = finitePair(g?.relative_humidity)
  if (humidity) out.humidity = humidity
  const speed = finitePair(g?.wind?.speed)
  const direction = typeof g?.wind?.direction === 'string' ? g.wind.direction : ''
  if (speed && direction) out.wind = { ...speed, direction }
  return out
}

/** One tile of the 4-day strip. `day` is the short weekday label. */
export interface DayOutlook {
  date: string
  day: string
  forecast: string
  tempLow: number
  tempHigh: number
}

/** `YYYY-MM-DD` → short weekday label ('Sat'); parsed at local noon so a
 * timezone offset can never shift the weekday. Unparseable → the raw date. */
export function dayShort(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? dateIso : d.toLocaleDateString('en-US', { weekday: 'short' })
}

/** Defensive parse of the 4-day forecast (`items[0].forecasts`): rows
 * missing a date, forecast text or temperature range are skipped; output
 * sorted by date (the feed is usually ordered, but it's not guaranteed). */
export function parseOutlook4d(json: unknown): DayOutlook[] {
  const env = json as { items?: { forecasts?: unknown }[] }
  const rows = Array.isArray(env?.items) ? env.items[0]?.forecasts : undefined
  if (!Array.isArray(rows)) return []
  const out: DayOutlook[] = []
  for (const raw of rows) {
    const f = raw as { date?: unknown; forecast?: unknown; temperature?: unknown }
    const date = typeof f?.date === 'string' ? f.date : ''
    const forecast = typeof f?.forecast === 'string' ? f.forecast : ''
    const temp = finitePair(f?.temperature)
    if (!date || !forecast || !temp) continue
    out.push({ date, day: dayShort(date), forecast, tempLow: temp.low, tempHigh: temp.high })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/* ------------------------------------------------------ regional periods */

/** NEA's five forecast/PSI regions at their published label locations —
 * the same points the PSI feed's `region_metadata` carries, held here so
 * the weather dialog can pick a region without the haze feed being on. */
export const NEA_REGIONS: readonly { name: string; lon: number; lat: number }[] = [
  { name: 'west', lon: 103.7, lat: 1.35735 },
  { name: 'east', lon: 103.94, lat: 1.35735 },
  { name: 'central', lon: 103.82, lat: 1.35735 },
  { name: 'south', lon: 103.82, lat: 1.29587 },
  { name: 'north', lon: 103.82, lat: 1.41803 },
]

/** The NEA region whose label point is nearest (planar — the island is
 * ~50 km wide, so degrees are fine for ranking). */
export function nearestRegion(lon: number, lat: number): string {
  let best = NEA_REGIONS[0].name
  let bestD = Infinity
  for (const r of NEA_REGIONS) {
    const d = (r.lon - lon) ** 2 + (r.lat - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = r.name
    }
  }
  return best
}

/** One block of the 24-hour forecast's regional breakdown. */
export interface ForecastPeriod {
  start: string
  end: string
  label: string
  day: string
  regions: Record<string, string>
}

/**
 * Period start → 'Morning' / 'Afternoon' / 'Night', read from the ISO
 * string's OWN wall clock (NEA stamps +08:00): the forecast is about
 * Singapore's day, so a viewer's browser timezone must not relabel it.
 * Start hour 5–11 Morning, 12–17 Afternoon, otherwise Night.
 */
export function periodLabel(startIso: string): string {
  const m = /T(\d{2}):/.exec(startIso)
  const h = m ? Number(m[1]) : NaN
  if (!Number.isFinite(h)) return 'Later'
  if (h >= 5 && h < 12) return 'Morning'
  if (h >= 12 && h < 18) return 'Afternoon'
  return 'Night'
}

/** Defensive parse of the 24-hour forecast's `periods`: each needs a start,
 * an end and at least one region string; output sorted by start. */
export function parseOutlookPeriods(json: unknown): ForecastPeriod[] {
  const env = json as { items?: { periods?: unknown }[] }
  const rows = Array.isArray(env?.items) ? env.items[0]?.periods : undefined
  if (!Array.isArray(rows)) return []
  const out: ForecastPeriod[] = []
  for (const raw of rows) {
    const p = raw as { time?: { start?: unknown; end?: unknown }; regions?: unknown }
    const start = typeof p?.time?.start === 'string' ? p.time.start : ''
    const end = typeof p?.time?.end === 'string' ? p.time.end : ''
    if (!start || !end || Number.isNaN(Date.parse(start))) continue
    const regions: Record<string, string> = {}
    if (p.regions && typeof p.regions === 'object') {
      for (const [k, v] of Object.entries(p.regions as Record<string, unknown>)) {
        if (typeof v === 'string' && v) regions[k] = v
      }
    }
    if (Object.keys(regions).length === 0) continue
    out.push({ start, end, label: periodLabel(start), day: dayShort(start.slice(0, 10)), regions })
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}
