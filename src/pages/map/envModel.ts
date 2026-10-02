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

/** NEA's PSI descriptor bands with marker colors. */
export function psiBand(psi: number): { label: string; color: string } {
  if (psi <= 50) return { label: 'Good', color: '#2e7d32' }
  if (psi <= 100) return { label: 'Moderate', color: '#f9a825' }
  if (psi <= 200) return { label: 'Unhealthy', color: '#ef6c00' }
  if (psi <= 300) return { label: 'Very unhealthy', color: '#c62828' }
  return { label: 'Hazardous', color: '#6a1b9a' }
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
