import { useEffect, useState } from 'react'
import { Box, Button, Collapse, Typography } from '@mui/material'
import { fetchOutlook, type OutlookData } from './envApi'
import { forecastEmoji, NEA_REGIONS, type Outlook24h } from './envModel'

type OutlookStatus = 'loading' | 'ready' | 'error'

const rangeLine = (o: Outlook24h) => {
  const parts = [`${Math.round(o.tempLow)}–${Math.round(o.tempHigh)} °C`]
  if (o.humidity) {
    parts.push(`humidity ${Math.round(o.humidity.low)}–${Math.round(o.humidity.high)} %`)
  }
  if (o.wind) {
    parts.push(`wind ${o.wind.direction} ${Math.round(o.wind.low)}–${Math.round(o.wind.high)} km/h`)
  }
  return parts.join(' · ')
}

const cap = (s: string) => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`

const tileSx = {
  flex: 1,
  minWidth: 0,
  textAlign: 'center',
  bgcolor: 'action.hover',
  borderRadius: 1,
  px: 0.5,
  py: 0.75,
} as const

/**
 * The outlook inside a weather area's details dialog: the next-24-h
 * island-wide forecast (text + temp/humidity/wind ranges), beside it the
 * tapped area's REGION by period (Morning / Afternoon / Night tiles, with an
 * "All regions" table behind an expander), then the 4-day strip — fetched
 * on demand (cached in envApi — one fetch serves every area). Emoji are fine
 * here: this is DOM text, not an ArcGIS symbol.
 */
export default function WeatherOutlook({ region }: { region?: string }) {
  const [status, setStatus] = useState<OutlookStatus>('loading')
  const [data, setData] = useState<OutlookData>({ day: null, periods: [], days: [] })
  const [showAll, setShowAll] = useState(false)
  const regionPeriods = region ? data.periods.filter((p) => p.regions[region]) : []

  useEffect(() => {
    const ctrl = new AbortController()
    setStatus('loading')
    fetchOutlook(ctrl.signal)
      .then((outlook) => {
        if (ctrl.signal.aborted) return
        setData(outlook)
        setStatus(
          outlook.day != null || outlook.periods.length > 0 || outlook.days.length > 0
            ? 'ready'
            : 'error',
        )
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setStatus('error')
      })
    return () => ctrl.abort()
  }, [])

  return (
    <Box
      data-testid="map-weather-outlook"
      data-status={status}
      data-days={data.days.length}
      sx={{ mt: 1.5 }}
    >
      {status === 'loading' && (
        <Typography variant="caption" color="text.secondary">
          loading outlook…
        </Typography>
      )}
      {status === 'error' && (
        <Typography variant="caption" color="text.secondary">
          outlook unavailable
        </Typography>
      )}
      {status === 'ready' && (
        <>
          {data.day && (
            <Box data-testid="map-weather-outlook-day">
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                next 24 h — island-wide (NEA)
              </Typography>
              <Typography variant="body2">
                {forecastEmoji(data.day.forecast)} {data.day.forecast}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {rangeLine(data.day)}
              </Typography>
            </Box>
          )}
          {region && regionPeriods.length > 0 && (
            <Box
              data-testid="map-weather-outlook-region"
              data-region={region}
              data-periods={regionPeriods.length}
              sx={{ mt: 1 }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {cap(region)} region
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
                {regionPeriods.map((p) => (
                  <Box key={p.start} title={p.regions[region]} sx={tileSx}>
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                      {p.label}
                    </Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                      {forecastEmoji(p.regions[region])}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {p.day}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          {data.periods.length > 0 && (
            <>
              <Button
                size="small"
                data-testid="map-weather-outlook-all-toggle"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
                sx={{ mt: 0.5, px: 0.5, minWidth: 0, textTransform: 'none' }}
              >
                {showAll ? 'Hide regions' : 'All regions'}
              </Button>
              <Collapse in={showAll} unmountOnExit>
                <Box
                  component="table"
                  data-testid="map-weather-outlook-all"
                  sx={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    typography: 'caption',
                    '& th, & td': { py: 0.25, px: 0.5, textAlign: 'center' },
                    '& th:first-of-type, & td:first-of-type': { textAlign: 'left' },
                  }}
                >
                  <thead>
                    <tr>
                      <th />
                      {data.periods.map((p) => (
                        <th key={p.start}>
                          {p.label}
                          <Box component="span" sx={{ display: 'block', fontWeight: 400, opacity: 0.7 }}>
                            {p.day}
                          </Box>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NEA_REGIONS.map((r) => (
                      <Box
                        component="tr"
                        key={r.name}
                        data-region={r.name}
                        sx={r.name === region ? { bgcolor: 'action.selected' } : undefined}
                      >
                        <td>{cap(r.name)}</td>
                        {data.periods.map((p) => {
                          const text = p.regions[r.name]
                          return (
                            <td key={p.start} title={text}>
                              {text ? forecastEmoji(text) : '–'}
                            </td>
                          )
                        })}
                      </Box>
                    ))}
                  </tbody>
                </Box>
              </Collapse>
            </>
          )}
          {data.days.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              next 4 days
            </Typography>
          )}
          {data.days.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
              {data.days.map((d) => (
                <Box key={d.date} title={d.forecast} sx={tileSx}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                    {d.day}
                  </Typography>
                  <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                    {forecastEmoji(d.forecast)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {Math.round(d.tempLow)}–{Math.round(d.tempHigh)}°
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
