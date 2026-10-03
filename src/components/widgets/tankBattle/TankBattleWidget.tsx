import { Suspense, useEffect, useRef } from 'react'
import { Box, CircularProgress, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import { useAppDispatch } from '../../../app/hooks'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { absorbTankBattleRecords } from '../../../features/records/recordsSlice'

// three.js + @react-three/fiber only load when a Tank Battle widget is on
// the board — the dynamic import splits into the shared three/fiber chunk
// the drone widgets already use.
const TankBattleBody = lazyWithReload(() => import('./TankBattleBody'), 'tank')

export default function TankBattleWidget({ id }: WidgetProps) {
  // One-time records migration runs HERE, in the shell: it has the widget
  // id and mounts without the three.js chunk. Ref-latched against
  // StrictMode's double effect (monotone merges make a double absorb
  // harmless, but the latch keeps the contract uniform).
  const dispatch = useAppDispatch()
  const legacyWave = useWidgetField(id, 'bestWave', 0)
  const legacyScore = useWidgetField(id, 'bestScore', 0)
  const legacyRoam = useWidgetField(id, 'bestRoamMs', 0)
  const absorbed = useRef(false)
  useEffect(() => {
    if ((legacyWave <= 0 && legacyScore <= 0 && legacyRoam <= 0) || absorbed.current) return
    absorbed.current = true
    dispatch(
      absorbTankBattleRecords({ bestWave: legacyWave, bestScore: legacyScore, bestRoamMs: legacyRoam }),
    )
    dispatch(updateWidgetData({ id, data: { bestWave: 0, bestScore: 0, bestRoamMs: 0 } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyWave, legacyScore, legacyRoam])

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
