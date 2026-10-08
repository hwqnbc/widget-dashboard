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
