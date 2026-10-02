import {
  parseForecast,
  parsePm25,
  parsePsi,
  type PsiRegion,
  type WeatherArea,
} from './envModel'

/** NEA environment feeds via data.gov.sg — free, no API key, CORS-enabled.
 * Thin clients: GET + pure parse; non-OK/network throws (the caller owns
 * the error status). */
const PSI_URL = 'https://api.data.gov.sg/v1/environment/psi'
const PM25_URL = 'https://api.data.gov.sg/v1/environment/pm25'
const FORECAST_2H_URL = 'https://api.data.gov.sg/v1/environment/2-hour-weather-forecast'

export async function fetchPsi(signal?: AbortSignal): Promise<PsiRegion[]> {
  const res = await fetch(PSI_URL, { signal })
  if (!res.ok) throw new Error(`psi: HTTP ${res.status}`)
  return parsePsi(await res.json())
}

/** Region → 1-hourly PM2.5 µg/m³ (the PSI feed only carries 24-h values). */
export async function fetchPm25(signal?: AbortSignal): Promise<Record<string, number>> {
  const res = await fetch(PM25_URL, { signal })
  if (!res.ok) throw new Error(`pm25: HTTP ${res.status}`)
  return parsePm25(await res.json())
}

export async function fetchForecast2h(signal?: AbortSignal): Promise<WeatherArea[]> {
  const res = await fetch(FORECAST_2H_URL, { signal })
  if (!res.ok) throw new Error(`forecast: HTTP ${res.status}`)
  return parseForecast(await res.json())
}
