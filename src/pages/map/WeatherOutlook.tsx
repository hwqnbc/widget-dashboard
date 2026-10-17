import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { fetchOutlook, type OutlookData } from './envApi'
import { forecastEmoji, type Outlook24h } from './envModel'

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

/**
 * The island-wide outlook inside a weather area's details dialog: the
 * next-24-h general forecast (text + temp/humidity/wind ranges) and the
 * 4-day strip, fetched on demand (cached in envApi — one fetch serves every
 * area). Emoji are fine here: this is DOM text, not an ArcGIS symbol.
 */
export default function WeatherOutlook() {
  const [status, setStatus] = useState<OutlookStatus>('loading')
  const [data, setData] = useState<OutlookData>({ day: null, days: [] })

  useEffect(() => {
    const ctrl = new AbortController()
    setStatus('loading')
    fetchOutlook(ctrl.signal)
      .then((outlook) => {
        if (ctrl.signal.aborted) return
        setData(outlook)
        setStatus(outlook.day != null || outlook.days.length > 0 ? 'ready' : 'error')
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
          {data.days.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
              {data.days.map((d) => (
                <Box
                  key={d.date}
                  title={d.forecast}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    px: 0.5,
                    py: 0.75,
                  }}
                >
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
