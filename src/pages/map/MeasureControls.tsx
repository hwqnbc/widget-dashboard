import { useEffect, type RefObject } from 'react'
import DistanceMeasurement2D from '@arcgis/core/widgets/DistanceMeasurement2D'
import AreaMeasurement2D from '@arcgis/core/widgets/AreaMeasurement2D'
import DirectLineMeasurement3D from '@arcgis/core/widgets/DirectLineMeasurement3D'
import AreaMeasurement3D from '@arcgis/core/widgets/AreaMeasurement3D'
import type Widget from '@arcgis/core/widgets/Widget'
import type { AnyView } from './MapPageBody'

/**
 * Mounts the ArcGIS measurement widget matching the active tool and view
 * dimension (the 2D and 3D measurement widgets are distinct classes), and
 * tears it down when the tool changes. Renders nothing itself — the widget
 * lives in the view's top-right UI corner. Fully client-side, no API key.
 * The view arrives as a ref + revision, never as a prop — see MapPageBody.
 */
export default function MeasureBinding({
  viewRef,
  viewRevision,
  tool,
}: {
  viewRef: RefObject<AnyView | null>
  viewRevision: number
  tool: string
}) {
  useEffect(() => {
    void viewRevision // re-bind when the view is swapped (2D/3D toggle)
    const view = viewRef.current
    if (!view || view.destroyed) return
    if (tool !== 'measure-line' && tool !== 'measure-area') return

    let widget: Widget
    if (view.type === '2d') {
      widget =
        tool === 'measure-line'
          ? new DistanceMeasurement2D({ view })
          : new AreaMeasurement2D({ view })
    } else {
      widget =
        tool === 'measure-line'
          ? new DirectLineMeasurement3D({ view })
          : new AreaMeasurement3D({ view })
    }
    view.ui.add(widget, 'top-right')
    return () => {
      // ArcGIS teardown can throw when the view is in a broken state
      // (assets never loaded offline); never let that reach React.
      try {
        if (!view.destroyed) view.ui.remove(widget)
        widget.destroy()
      } catch {
        // already unusable — nothing to release
      }
    }
  }, [viewRef, viewRevision, tool])

  return null
}
