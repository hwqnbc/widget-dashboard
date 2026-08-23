import { Suspense } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'
import { lazyWithReload } from '../../../utils/lazyWithReload'

// three.js + @react-three/fiber only load when a Drone Sim widget is actually
// on the board — Vite splits the dynamic import into its own chunk.
const DroneSimBody = lazyWithReload(() => import('./DroneSimBody'), 'dronesim')

export default function DroneSimWidget({ id }: WidgetProps) {
  const mode = useTheme().palette.mode
  const sky = (mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE).sky

  return (
    <Suspense
      fallback={
        <Box
          sx={{
            height: '100%',
            borderRadius: 1,
            bgcolor: sky,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CircularProgress size={28} />
        </Box>
      }
    >
      <DroneSimBody id={id} />
    </Suspense>
  )
}
