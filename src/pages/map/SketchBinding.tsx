import { useEffect, type RefObject } from 'react'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel'
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import type Point from '@arcgis/core/geometry/Point'
import type Polygon from '@arcgis/core/geometry/Polygon'
import type { NewMapDrawing } from '../../features/map/mapSlice'
import type { AnyView } from './MapPageBody'

export type DrawMode = 'none' | 'marker' | 'polygon' | 'edit'

/** View-SR geometry → WGS84 (the view runs Web Mercator; storage is lon/lat). */
function toGeographic<G extends Point | Polygon>(g: G): G {
  if (g.spatialReference?.isWGS84) return g
  try {
    return (webMercatorUtils.webMercatorToGeographic(g) as G) ?? g
  } catch {
    return g
  }
}

/** ArcGIS geometry → the serializable drawing shape, or null if malformed. */
function toDrawingGeometry(g: Point | Polygon | null | undefined): NewMapDrawing | null {
  if (g?.type === 'point') {
    const p = toGeographic(g)
    if (p.longitude == null || p.latitude == null) return null
    return { kind: 'marker', lon: p.longitude, lat: p.latitude }
  }
  if (g?.type === 'polygon') {
    const poly = toGeographic(g)
    const rings = poly.rings.map((ring) => ring.map(([x, y]): [number, number] => [x, y]))
    return rings.length > 0 && rings[0].length >= 3 ? { kind: 'polygon', rings } : null
  }
  return null
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
  drawingsLayerRef,
  drawMode,
  onCreated,
  onUpdated,
  onModeEnd,
}: {
  viewRef: RefObject<AnyView | null>
  viewRevision: number
  sketchLayerRef: RefObject<GraphicsLayer | null>
  drawingsLayerRef: RefObject<GraphicsLayer | null>
  drawMode: DrawMode
  onCreated: (drawing: NewMapDrawing) => void
  onUpdated: (id: string, geometry: NewMapDrawing) => void
  onModeEnd: () => void
}) {
  useEffect(() => {
    void viewRevision // re-bind when the view is swapped (2D/3D toggle)
    const view = viewRef.current
    const layer = drawMode === 'edit' ? drawingsLayerRef.current : sketchLayerRef.current
    if (drawMode === 'none' || !view || view.destroyed || !layer) return

    let vm: SketchViewModel | null = null
    let handle: { remove(): void } | null = null
    try {
      if (drawMode === 'edit') {
        // Edit-in-place: the VM binds to the MIRRORED drawings layer;
        // clicking a shape shows its handles (vertex-drag for polygons,
        // move for markers). Complete commits via onUpdated → redux, which
        // rebuilds the mirror after the VM has released the graphic; Esc
        // aborts and reverts. Update-cancel does NOT end edit mode.
        vm = new SketchViewModel({
          view,
          layer,
          updateOnGraphicClick: true,
          defaultUpdateOptions: { tool: 'reshape', toggleToolOnClick: true },
        })
        handle = vm.on('update', (event) => {
          if (event.state !== 'complete' || event.aborted) return
          for (const graphic of event.graphics) {
            const id = graphic.attributes?.drawingId as string | undefined
            if (!id) continue
            const geometry = toDrawingGeometry(graphic.geometry as Point | Polygon | null)
            if (geometry) onUpdated(id, geometry)
          }
        })
      } else {
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
          const geometry = toDrawingGeometry(graphic?.geometry as Point | Polygon | null)
          if (geometry) onCreated(geometry)
          if (geometry?.kind === 'marker' || graphic?.geometry?.type === 'point') {
            // continuous planting until the user toggles off / hits Escape
            try {
              vm?.create('point')
            } catch {
              onModeEnd()
            }
          } else {
            onModeEnd()
          }
        })
        vm.create(drawMode === 'marker' ? 'point' : 'polygon')
      }
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
    // onCreated/onUpdated/onModeEnd are stable enough (recreated per render
    // but equivalent); re-running on their identity would cancel live edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRef, viewRevision, sketchLayerRef, drawingsLayerRef, drawMode])

  return null
}
