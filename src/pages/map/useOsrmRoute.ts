import { useEffect, useState, type RefObject } from 'react'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import TextSymbol from '@arcgis/core/symbols/TextSymbol'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import { fetchOsrmRoute, type LonLat, type RouteProfile } from './osrm'

export interface RouteState {
  status: 'idle' | 'picking' | 'loading' | 'ok' | 'error'
  km: number | null
  minutes: number | null
  /** The fetched route line (lon/lat) — feeds insert-on-line clicks. */
  path: LonLat[] | null
  /** Input waypoints snapped onto the road network, same order. */
  snapped: LonLat[] | null
  /** Per consecutive waypoint pair, route order (the chip's popover). */
  legs: { km: number; minutes: number }[] | null
}

const WAYPOINT_COLORS = { start: '#2e7d32', mid: '#ef6c00', end: '#c62828' }
const ROUTE_SYMBOL = new SimpleLineSymbol({ color: '#ef6c00', width: 4 })

/** Marker + number label for waypoint i of n. Both graphics carry
 * `waypointIndex` so a hit on either removes that waypoint. */
function waypointGraphics(pt: LonLat, i: number, n: number): Graphic[] {
  const geometry = new Point({ longitude: pt[0], latitude: pt[1] })
  const attributes = { waypointIndex: i }
  const color =
    i === 0 ? WAYPOINT_COLORS.start : i === n - 1 && n > 1 ? WAYPOINT_COLORS.end : WAYPOINT_COLORS.mid
  return [
    new Graphic({
      geometry,
      attributes,
      symbol: new SimpleMarkerSymbol({
        style: 'circle',
        color,
        size: 16,
        outline: { color: 'white', width: 1.5 },
      }),
    }),
    new Graphic({
      geometry,
      attributes,
      symbol: new TextSymbol({
        text: String(i + 1),
        color: 'white',
        font: { size: 9, weight: 'bold' },
        verticalAlignment: 'middle',
        horizontalAlignment: 'center',
      }),
    }),
  ]
}

/**
 * Route state machine: draws the numbered waypoint markers, and once two or
 * more are set fetches the OSRM route through all of them for the active
 * profile, draws the line and returns distance/duration plus the route
 * geometry (for insert-on-line clicks). Re-fetches when the waypoints or
 * profile change; aborts stale requests on any change.
 */
export function useOsrmRoute(
  layerRef: RefObject<GraphicsLayer | null>,
  points: LonLat[],
  profile: RouteProfile,
): RouteState {
  const [state, setState] = useState<RouteState>({
    status: 'idle',
    km: null,
    minutes: null,
    path: null,
    snapped: null,
    legs: null,
  })

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.removeAll()
    layer.addMany(points.flatMap((pt, i) => waypointGraphics(pt, i, points.length)))
    if (points.length < 2) {
      setState({
        status: points.length === 1 ? 'picking' : 'idle',
        km: null,
        minutes: null,
        path: null,
        snapped: null,
        legs: null,
      })
      return
    }

    setState((prev) => ({ ...prev, status: 'loading' }))
    const abort = new AbortController()
    fetchOsrmRoute(profile, points, abort.signal)
      .then((route) => {
        // Line below the markers (collection order = draw order).
        layer.graphics.add(
          new Graphic({
            geometry: new Polyline({ paths: [route.path] }),
            symbol: ROUTE_SYMBOL,
          }),
          0,
        )
        setState({
          status: 'ok',
          km: Math.round((route.distanceM / 1000) * 10) / 10,
          minutes: Math.round(route.durationS / 60),
          path: route.path,
          snapped: route.snapped.length === points.length ? route.snapped : points,
          legs: route.legs.map((l) => ({
            km: Math.round((l.distanceM / 1000) * 10) / 10,
            minutes: Math.round(l.durationS / 60),
          })),
        })
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return
        console.warn('OSRM route failed:', err)
        setState({
          status: 'error',
          km: null,
          minutes: null,
          path: null,
          snapped: null,
          legs: null,
        })
      })
    return () => abort.abort()
  }, [layerRef, points, profile])

  return state
}
