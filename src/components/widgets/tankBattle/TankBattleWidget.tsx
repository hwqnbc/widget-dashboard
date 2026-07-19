import { Suspense, lazy } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'

// three.js + @react-three/fiber only load when a Tank Battle widget is on
// the board — the dynamic import splits into the shared three/fiber chunk
// the drone widgets already use.
const TankBattleBody = lazy(() => import('./TankBattleBody'))

export default function TankBattleWidget({ id }: WidgetProps) {
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
      <TankBattleBody id={id} />
    </Suspense>
  )
}
