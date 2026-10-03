import { Suspense, useEffect, useRef } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import { useAppDispatch } from '../../../app/hooks'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { absorbDroneSimRecords } from '../../../features/records/recordsSlice'

// three.js + @react-three/fiber only load when a Drone Sim widget is actually
// on the board — Vite splits the dynamic import into its own chunk.
const DroneSimBody = lazyWithReload(() => import('./DroneSimBody'), 'dronesim')

export default function DroneSimWidget({ id }: WidgetProps) {
  // One-time records migration runs HERE, in the shell: it has the widget
  // id and mounts without the three.js chunk. Ref-latched against
  // StrictMode's double effect (monotone merges make a double absorb
  // harmless, but the latch keeps the contract uniform).
  const dispatch = useAppDispatch()
  const legacyLanding = useWidgetField(id, 'landingBest', 0)
  const absorbed = useRef(false)
  useEffect(() => {
    if (legacyLanding <= 0 || absorbed.current) return
    absorbed.current = true
    dispatch(absorbDroneSimRecords({ landingBest: legacyLanding }))
    dispatch(updateWidgetData({ id, data: { landingBest: 0 } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyLanding])

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
