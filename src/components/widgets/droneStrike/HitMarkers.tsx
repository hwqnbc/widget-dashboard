import { Box } from '@mui/material'

export interface HitMarker {
  id: number
  points: number
}

/**
 * Floating "+N" score pops near the reticle. Target kills are genuine
 * events (a few per wave), so plain React state + a CSS animation is fine
 * here — the zero-render rule only applies to per-frame data.
 */
export default function HitMarkers({ markers }: { markers: readonly HitMarker[] }) {
  return (
    <>
      {markers.map((m, i) => (
        <Box
          key={m.id}
          data-testid="strike-hit-marker"
          sx={{
            position: 'absolute',
            top: `calc(50% - ${44 + i * 22}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#ffd54f',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 18,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
            animation: 'strikeHitPop 0.9s ease-out forwards',
            '@keyframes strikeHitPop': {
              from: { opacity: 1, translate: '0 0' },
              to: { opacity: 0, translate: '0 -26px' },
            },
          }}
        >
          {`+${m.points}`}
        </Box>
      ))}
    </>
  )
}
