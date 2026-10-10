import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { fetchPsiTrend, type PsiTrendData } from './envApi'
import { seriesStats, sparklinePath, trendTicks } from './envModel'

type TrendStatus = 'loading' | 'ready' | 'error'

const W = 260
const H = 80

/**
 * The last-24-hours sparkline inside the haze details dialog: the rolling
 * 24-h PSI (solid) and the 1-h PM2.5 (dashed) for one region, fetched on
 * demand via the feeds' `?date=` parameter (today + yesterday, cached in
 * envApi). Pure path math (`sparklinePath`); no chart library.
 */
export default function PsiTrend({ region }: { region: string }) {
  const [status, setStatus] = useState<TrendStatus>('loading')
  const [data, setData] = useState<PsiTrendData>({ psi: [], pm25: [] })

  useEffect(() => {
    const ctrl = new AbortController()
    setStatus('loading')
    fetchPsiTrend(region, ctrl.signal)
      .then((trend) => {
        if (ctrl.signal.aborted) return
        setData(trend)
        setStatus(trend.psi.length >= 2 ? 'ready' : 'error')
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setStatus('error')
      })
    return () => ctrl.abort()
  }, [region])

  const psiStats = seriesStats(data.psi)
  const pm25Stats = seriesStats(data.pm25)
  const spanHours =
    data.psi.length >= 2
      ? Math.round((data.psi[data.psi.length - 1].t - data.psi[0].t) / 3_600_000)
      : 0
  const statsLine = (s: NonNullable<ReturnType<typeof seriesStats>>) =>
    `now ${Math.round(s.last)} · min ${Math.round(s.min)} · max ${Math.round(s.max)}`

  return (
    <Box
      data-testid="map-psi-trend"
      data-status={status}
      data-points={data.psi.length}
      sx={{ mt: 1.5 }}
    >
      {status === 'loading' && (
        <Typography variant="caption" color="text.secondary">
          loading 24-h trend…
        </Typography>
      )}
      {status === 'error' && (
        <Typography variant="caption" color="text.secondary">
          trend unavailable
        </Typography>
      )}
      {status === 'ready' && (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', display: 'block' }}
            role="img"
            aria-label={`${region} region: PSI and PM2.5 over the last ${spanHours} hours`}
          >
            <rect x="0" y="0" width={W} height={H} rx="6" fill="#000" fillOpacity="0.05" />
            {/* Hour gridlines: a faint line per tick, hh:00 labels along the
                bottom (edge-clipped labels skipped) — the "roughly when". */}
            {trendTicks(data.psi, W).map((tick) => (
              <g key={tick.x}>
                <line
                  x1={tick.x}
                  x2={tick.x}
                  y1={0}
                  y2={H}
                  stroke="#607d8b"
                  strokeOpacity="0.25"
                  strokeWidth="1"
                />
                {tick.x >= 16 && tick.x <= W - 16 && (
                  <text
                    x={tick.x}
                    y={H - 3}
                    fontSize="9"
                    fill="#607d8b"
                    textAnchor="middle"
                    fontFamily="system-ui, sans-serif"
                  >
                    {tick.label}
                  </text>
                )}
              </g>
            ))}
            <path d={sparklinePath(data.psi, W, H)} fill="none" stroke="#1976d2" strokeWidth="2" />
            <path
              d={sparklinePath(data.pm25, W, H)}
              fill="none"
              stroke="#9c27b0"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          <Box data-testid="map-psi-trend-info" sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              last {spanHours} h
            </Typography>
            {psiStats && (
              <Typography variant="caption" sx={{ display: 'block', color: '#1976d2' }}>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  PSI
                </Box>{' '}
                — {statsLine(psiStats)}
              </Typography>
            )}
            {pm25Stats && (
              <Typography variant="caption" sx={{ display: 'block', color: '#9c27b0' }}>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  PM2.5 1-h
                </Box>{' '}
                (dashed) — {statsLine(pm25Stats)}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
