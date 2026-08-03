import { Suspense, lazy } from 'react'
import { Box, CircularProgress } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'

// three.js + @react-three/fiber only load when a Model Viewer widget is on
// the board — the dynamic import splits into the shared three/fiber chunk
// the game widgets already use.
const ModelViewerBody = lazy(() => import('./ModelViewerBody'))

export default function ModelViewerWidget({ id }: WidgetProps) {
  return (
    <Suspense
      fallback={
        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      }
    >
      <ModelViewerBody id={id} />
    </Suspense>
  )
}
