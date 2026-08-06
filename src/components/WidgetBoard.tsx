import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import { Box, Typography } from '@mui/material'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  GRID_COLS,
  removeWidget,
  updateLayout,
} from '../features/widgets/widgetsSlice'
import type { WidgetType } from '../features/widgets/types'
import { widgetMetaByType } from '../features/widgets/widgetCatalog'
import { widgetComponents } from '../registry/widgetRegistry'
import WidgetCard from './WidgetCard'
import { useFullscreen } from './fullscreen/fullscreenContext'
import { PresentationContext } from './fullscreen/presentation'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const COLS = { lg: GRID_COLS, md: 10, sm: 6, xs: 4, xxs: 2 }

/**
 * One grid cell: the card chrome plus the widget itself, rendered through a
 * **stable portal host** so entering/exiting full screen relocates the *same*
 * live instance instead of remounting it. `<Widget>` is mounted once into a
 * detached `host` div; a layout effect `appendChild`s that host into either
 * the card's slot (normal) or the fullscreen overlay's body (`overlayHost`).
 * Moving a DOM node doesn't remount its React subtree, so ref-held game state
 * and the WebGL canvas/context survive the toggle — the game keeps running.
 * `PresentationContext` is supplied here (it follows the React tree through
 * the portal), so the `fullscreen` flag flips live on the same instance.
 */
function BoardWidget({
  id,
  type,
  title,
  onRemove,
}: {
  id: string
  type: WidgetType
  title: string
  onRemove: () => void
}) {
  const { fullscreenId, open, overlayHost } = useFullscreen()
  const isFullscreen = fullscreenId === id
  const Widget = widgetComponents[type]

  const [cardSlot, setCardSlot] = useState<HTMLDivElement | null>(null)
  // Stable across renders — the DOM node that carries the widget between slots.
  const [host] = useState(() => {
    const d = document.createElement('div')
    d.style.width = '100%'
    d.style.height = '100%'
    return d
  })

  const target = isFullscreen ? overlayHost : cardSlot
  useLayoutEffect(() => {
    // Relocate the host into the active slot. Never detach on a null target —
    // leaving the host (and its canvas) in place avoids any teardown flicker.
    if (target && host.parentNode !== target) target.appendChild(host)
  }, [target, host])

  return (
    <>
      <WidgetCard title={title} onRemove={onRemove} onFullscreen={() => open(id)}>
        <div ref={setCardSlot} style={{ height: '100%' }} />
      </WidgetCard>
      {createPortal(
        <PresentationContext.Provider value={{ fullscreen: isFullscreen }}>
          <Widget id={id} />
        </PresentationContext.Provider>,
        host,
      )}
    </>
  )
}

/** The draggable / resizable grid of widgets, backed by redux + persistence. */
export default function WidgetBoard() {
  const dispatch = useAppDispatch()
  const allInstances = useAppSelector((state) => state.widgets.instances)
  const layout = useAppSelector((state) => state.widgets.layout)

  // Skip any persisted instance whose widget type no longer exists (e.g. a
  // removed widget), so stale saved state renders gracefully instead of crashing.
  const instances = useMemo(
    () => allInstances.filter((i) => widgetComponents[i.type] && widgetMetaByType[i.type]),
    [allInstances],
  )

  // Feed the persisted layout to every breakpoint.
  const layouts = useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }),
    [layout],
  )

  const handleLayoutChange = useCallback(
    (current: Layout) => {
      dispatch(
        updateLayout(
          current.map((l) => ({
            i: l.i,
            x: l.x,
            y: l.y,
            w: l.w,
            h: l.h,
            minW: l.minW,
            minH: l.minH,
          })),
        ),
      )
    },
    [dispatch],
  )

  if (instances.length === 0) {
    return (
      <Box
        sx={{
          py: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          No widgets yet
        </Typography>
        <Typography variant="body2">
          Use “Add widget” above to build your dashboard.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ '& .react-grid-item.react-grid-placeholder': { bgcolor: 'primary.main', borderRadius: 2 } }}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={80}
        margin={[16, 16]}
        draggableHandle=".widget-drag-handle"
        // Elements matching this selector never start a drag — needed so the
        // remove button (and other header controls) receive taps on touch
        // devices, where onMouseDown never fires and the drag handler would
        // otherwise swallow the tap.
        draggableCancel=".widget-no-drag"
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
      >
        {instances.map((inst) => {
          const meta = widgetMetaByType[inst.type]
          return (
            <div key={inst.id}>
              <BoardWidget
                id={inst.id}
                type={inst.type}
                title={meta.title}
                onRemove={() => dispatch(removeWidget(inst.id))}
              />
            </div>
          )
        })}
      </ResponsiveGridLayout>
    </Box>
  )
}
