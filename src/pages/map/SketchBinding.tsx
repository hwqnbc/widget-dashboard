import { useEffect, type RefObject } from 'react'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel'
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import type Point from '@arcgis/core/geometry/Point'
import type Polygon from '@arcgis/core/geometry/Polygon'
import type { NewMapDrawing } from '../../features/map/mapSlice'
import type { AnyView } from './MapPageBody'

export type DrawMode = 'none' | 'marker' | 'polygon'

/** View-SR geometry → WGS84 (the view runs Web Mercator; storage is lon/lat). */
function toGeographic<G extends Point | Polygon>(g: G): G {
  if (g.spatialReference?.isWGS84) return g
  try {
    return (webMercatorUtils.webMercatorToGeographic(g) as G) ?? g
  } catch {
    return g
  }
}

/**
 * Binds ArcGIS's client-side SketchViewModel (no key) to the scratch layer
 * while a draw mode is active — it handles the interactive geometry work
 * (tap to plant, click vertices / double-click to finish, Escape to
 * cancel). Completed sketches are converted to WGS84, removed from the
 * scratch layer and handed to `onCreated`; the redux → drawings-layer
 * mirror is the single source of truth for rendered overlays. Markers
 * re-enter create for continuous planting; polygons end the mode.
 * Null-rendering; the view arrives as ref + revision (lessons.md #67).
 */
export default function SketchBinding({
  viewRef,
  viewRevision,
  sketchLayerRef,
  drawMode,
  onCreated,
  onModeEnd,
}: {
  viewRef: RefObject<AnyView | null>
  viewRevision: number
  sketchLayerRef: RefObject<GraphicsLayer | null>
  drawMode: DrawMode
  onCreated: (drawing: NewMapDrawing) => void
  onModeEnd: () => void
}) {
  useEffect(() => {
    void viewRevision // re-bind when the view is swapped (2D/3D toggle)
    const view = viewRef.current
    const layer = sketchLayerRef.current
    if (drawMode === 'none' || !view || view.destroyed || !layer) return

    let vm: SketchViewModel | null = null
    let handle: { remove(): void } | null = null
    try {
      vm = new SketchViewModel({
        view,
        layer,
        pointSymbol: {
          type: 'simple-marker',
          style: 'diamond',
          color: '#7b1fa2',
          size: 14,
          outline: { color: 'white', width: 1.5 },
        },
        polygonSymbol: {
          type: 'simple-fill',
          color: [123, 31, 162, 0.18],
          outline: { color: '#7b1fa2', width: 2 },
        },
        defaultCreateOptions: { hasZ: false },
      })
      handle = vm.on('create', (event) => {
        if (event.state === 'cancel') {
          onModeEnd()
          return
        }
        if (event.state !== 'complete') return
        const graphic = event.graphic
        try {
          layer.remove(graphic)
        } catch {
          /* already gone */
        }
        const g = graphic?.geometry
        if (g?.type === 'point') {
          const p = toGeographic(g as Point)
          if (p.longitude != null && p.latitude != null) {
            onCreated({ kind: 'marker', lon: p.longitude, lat: p.latitude })
          }
          // continuous planting until the user toggles off / hits Escape
          try {
            vm?.create('point')
          } catch {
            onModeEnd()
          }
        } else if (g?.type === 'polygon') {
          const poly = toGeographic(g as Polygon)
          const rings = poly.rings.map((ring) =>
            ring.map(([x, y]): [number, number] => [x, y]),
          )
          if (rings.length > 0 && rings[0].length >= 3) {
            onCreated({ kind: 'polygon', rings })
          }
          onModeEnd()
        }
      })
      vm.create(drawMode === 'marker' ? 'point' : 'polygon')
    } catch {
      // offline/broken view — leave draw mode rather than crash React
      onModeEnd()
    }

    return () => {
      // ArcGIS teardown can throw on a broken view; never let it reach React.
      try {
        handle?.remove()
        vm?.cancel()
        vm?.destroy()
      } catch {
        /* already unusable */
      }
    }
    // onCreated/onModeEnd are stable enough (recreated per render but
    // equivalent); re-running on their identity would cancel live sketches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRef, viewRevision, sketchLayerRef, drawMode])

  return null
}
