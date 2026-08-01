import { useState, type RefObject } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import type MapView from '@arcgis/core/views/MapView'
import type { AnyView } from './MapPageBody'

const LOCATE_SYMBOL = new SimpleMarkerSymbol({
  style: 'circle',
  color: '#26a69a', // theme secondary
  size: 14,
  outline: { color: 'white', width: 2 },
})

/** Locate-me: browser geolocation → pan/zoom the view + drop a marker.
 * Pure client-side (no ArcGIS locate service, no key). The view arrives as
 * a ref + revision, never as a prop — see MapPageBody. */
export default function LocateControl({
  viewRef,
  viewRevision,
  layerRef,
}: {
  viewRef: RefObject<AnyView | null>
  viewRevision: number
  layerRef: RefObject<GraphicsLayer | null>
}) {
  const [state, setState] = useState<'idle' | 'locating' | 'error'>('idle')
  const hasView = viewRevision > 0 && viewRef.current != null

  const locate = () => {
    const view = viewRef.current
    if (!view || !('geolocation' in navigator)) {
      setState('error')
      return
    }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        const layer = layerRef.current
        if (layer) {
          layer.removeAll()
          layer.add(
            new Graphic({
              geometry: new Point({ longitude, latitude }),
              symbol: LOCATE_SYMBOL,
            }),
          )
        }
        // goTo works without basemap tiles, so locate stays useful offline.
        void (view as MapView).goTo({ center: [longitude, latitude], zoom: 13 }).catch(() => {})
        setState('idle')
      },
      () => setState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <Tooltip title={state === 'error' ? 'Location unavailable' : 'My location'}>
      <span>
        <IconButton
          size="small"
          color={state === 'error' ? 'default' : 'primary'}
          data-testid="map-locate"
          data-locate-state={state}
          aria-label="My location"
          disabled={!hasView || state === 'locating'}
          onClick={locate}
        >
          <MyLocationIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  )
}
