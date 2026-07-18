import { Suspense, lazy } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'

// three.js + @react-three/fiber only load when a Drone Strike widget is on
// the board — the dynamic import splits into its own chunk (shared with the
// Drone Sim's, since both lean on the same three/fiber vendor modules).
const DroneStrikeBody = lazy(() => import('./DroneStrikeBody'))

export default function DroneStrikeWidget({ id }: WidgetProps) {
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
      <DroneStrikeBody id={id} />
    </Suspense>
  )
}
