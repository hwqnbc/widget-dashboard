import { parseForecast, parsePsi, type PsiRegion, type WeatherArea } from './envModel'

/** NEA environment feeds via data.gov.sg — free, no API key, CORS-enabled.
 * Thin clients: GET + pure parse; non-OK/network throws (the caller owns
 * the error status). */
const PSI_URL = 'https://api.data.gov.sg/v1/environment/psi'
const FORECAST_2H_URL = 'https://api.data.gov.sg/v1/environment/2-hour-weather-forecast'

export async function fetchPsi(signal?: AbortSignal): Promise<PsiRegion[]> {
  const res = await fetch(PSI_URL, { signal })
  if (!res.ok) throw new Error(`psi: HTTP ${res.status}`)
  return parsePsi(await res.json())
}

export async function fetchForecast2h(signal?: AbortSignal): Promise<WeatherArea[]> {
  const res = await fetch(FORECAST_2H_URL, { signal })
  if (!res.ok) throw new Error(`forecast: HTTP ${res.status}`)
  return parseForecast(await res.json())
}
