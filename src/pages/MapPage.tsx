import { Suspense } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { lazyWithReload } from '../utils/lazyWithReload'

// @arcgis/core (a multi-MB dependency) loads only when the Map page is
// visited — Vite splits the dynamic import into its own chunk. Never
// re-export MapPageBody statically (docs/lessons.md #57). lazyWithReload
// self-heals the stale-deploy case (old cached index.html → dead chunk
// hash → "Importing a module script failed") with one page reload.
const MapPageBody = lazyWithReload(() => import('./map/MapPageBody'), 'map')

/** Map page: a thin lazy/Suspense boundary around the ArcGIS-powered body. */
export default function MapPage() {
  return (
    <Suspense
      fallback={
        <Box
          data-testid="map-page-loading"
          sx={{
            height: { xs: 'calc(100vh - 56px - 48px)', sm: 'calc(100vh - 64px - 48px)' },
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CircularProgress size={28} />
        </Box>
      }
    >
      <MapPageBody />
    </Suspense>
  )
}
