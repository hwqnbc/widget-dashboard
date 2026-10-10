import {
  lastHours,
  parseForecast,
  parseHourly,
  parsePm25,
  parsePsi,
  type PsiRegion,
  type TrendPoint,
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

export interface PsiTrendData {
  psi: TrendPoint[]
  pm25: TrendPoint[]
}

const localDayIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const trendCache = new Map<string, { at: number; data: PsiTrendData }>()
const TREND_TTL_MS = 10 * 60_000

/**
 * One region's last-24-h hourly series: both feeds accept `?date=` and
 * return one item PER HOUR of that day, so yesterday + today merged (dedupe
 * by timestamp, newest 24 kept) is a rolling window. Cached 10 min per
 * region — trend taps on nearby bubbles shouldn't hammer NEA.
 */
export async function fetchPsiTrend(region: string, signal?: AbortSignal): Promise<PsiTrendData> {
  const hit = trendCache.get(region)
  if (hit && Date.now() - hit.at < TREND_TTL_MS) return hit.data
  const dates = [localDayIso(new Date(Date.now() - 86_400_000)), localDayIso(new Date())]
  const day = async (base: string, date: string) => {
    const res = await fetch(`${base}?date=${date}`, { signal })
    if (!res.ok) throw new Error(`trend: HTTP ${res.status}`)
    return res.json() as Promise<unknown>
  }
  const [psiDays, pm25Days] = await Promise.all([
    Promise.all(dates.map((d) => day(PSI_URL, d))),
    Promise.all(dates.map((d) => day(PM25_URL, d))),
  ])
  const data: PsiTrendData = {
    psi: lastHours(psiDays.flatMap((j) => parseHourly(j, 'psi_twenty_four_hourly', region))),
    pm25: lastHours(pm25Days.flatMap((j) => parseHourly(j, 'pm25_one_hourly', region))),
  }
  trendCache.set(region, { at: Date.now(), data })
  return data
}
