import { Suspense } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import { lazyWithReload } from '../../../utils/lazyWithReload'

// three.js + @react-three/fiber only load when a Wing Flyer widget is on the
// board — the dynamic import splits into the shared three/fiber chunk the
// drone and tank widgets already use.
const WingFlyerBody = lazyWithReload(() => import('./WingFlyerBody'), 'wingflyer')

export default function WingFlyerWidget({ id }: WidgetProps) {
  const mode = useTheme().palette.mode
  const sky = (mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE).sky
  return (
    <Suspense
      fallback={
        <Box sx={{ height: '100%', borderRadius: 1, bgcolor: sky, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      }
    >
      <WingFlyerBody id={id} />
    </Suspense>
  )
}
