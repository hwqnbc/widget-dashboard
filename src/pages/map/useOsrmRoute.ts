import { useEffect, useState, type RefObject } from 'react'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import { fetchOsrmRoute, type LonLat, type RouteProfile } from './osrm'

export interface RouteState {
  status: 'idle' | 'picking' | 'loading' | 'ok' | 'error'
  km: number | null
  minutes: number | null
}

const ENDPOINT_SYMBOL = new SimpleMarkerSymbol({
  style: 'square',
  color: '#ef6c00',
  size: 10,
  outline: { color: 'white', width: 1.5 },
})
const ROUTE_SYMBOL = new SimpleLineSymbol({ color: '#ef6c00', width: 3 })

/**
 * Route state machine: draws the picked endpoints, and once two are set
 * fetches the OSRM route for the active profile, draws the line and returns
 * distance/duration. Re-fetches when the profile changes; aborts stale
 * requests on any change.
 */
export function useOsrmRoute(
  layerRef: RefObject<GraphicsLayer | null>,
  points: LonLat[],
  profile: RouteProfile,
): RouteState {
  const [state, setState] = useState<RouteState>({ status: 'idle', km: null, minutes: null })

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.removeAll()
    layer.addMany(
      points.map(
        ([lon, lat]) =>
          new Graphic({
            geometry: new Point({ longitude: lon, latitude: lat }),
            symbol: ENDPOINT_SYMBOL,
          }),
      ),
    )
    if (points.length < 2) {
      setState({ status: points.length === 1 ? 'picking' : 'idle', km: null, minutes: null })
      return
    }

    setState({ status: 'loading', km: null, minutes: null })
    const abort = new AbortController()
    fetchOsrmRoute(profile, points[0], points[1], abort.signal)
      .then((route) => {
        layer.add(
          new Graphic({
            geometry: new Polyline({ paths: [route.path] }),
            symbol: ROUTE_SYMBOL,
          }),
        )
        setState({
          status: 'ok',
          km: Math.round((route.distanceM / 1000) * 10) / 10,
          minutes: Math.round(route.durationS / 60),
        })
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return
        console.warn('OSRM route failed:', err)
        setState({ status: 'error', km: null, minutes: null })
      })
    return () => abort.abort()
  }, [layerRef, points, profile])

  return state
}
