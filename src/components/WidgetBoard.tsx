import { useCallback, useMemo } from 'react'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import { Box, Typography } from '@mui/material'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  GRID_COLS,
  removeWidget,
  updateLayout,
} from '../features/widgets/widgetsSlice'
import { widgetMetaByType } from '../features/widgets/widgetCatalog'
import { widgetComponents } from '../registry/widgetRegistry'
import WidgetCard from './WidgetCard'
import { useFullscreen } from './fullscreen/fullscreenContext'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const COLS = { lg: GRID_COLS, md: 10, sm: 6, xs: 4, xxs: 2 }

/** The draggable / resizable grid of widgets, backed by redux + persistence. */
export default function WidgetBoard() {
  const dispatch = useAppDispatch()
  const { fullscreenId, open } = useFullscreen()
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
          const Widget = widgetComponents[inst.type]
          const meta = widgetMetaByType[inst.type]
          // While a widget is fullscreen it's mounted only in the overlay; the
          // in-grid card shows a placeholder so there's a single live instance.
          const isFullscreen = fullscreenId === inst.id
          return (
            <div key={inst.id}>
              <WidgetCard
                title={meta.title}
                onRemove={() => dispatch(removeWidget(inst.id))}
                onFullscreen={() => open(inst.id)}
              >
                {isFullscreen ? (
                  <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2 }}>
                    <Typography variant="body2" color="text.secondary" align="center">
                      Opened in full screen
                    </Typography>
                  </Box>
                ) : (
                  <Widget id={inst.id} />
                )}
              </WidgetCard>
            </div>
          )
        })}
      </ResponsiveGridLayout>
    </Box>
  )
}
