import { useCallback, useMemo } from 'react'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy'
import { Box } from '@mui/material'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  GRID_COLS,
  removeWidget,
  updateLayout,
} from '../features/widgets/widgetsSlice'
import { widgetMetaByType } from '../features/widgets/widgetCatalog'
import { widgetComponents } from '../registry/widgetRegistry'
import WidgetCard from './WidgetCard'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const COLS = { lg: GRID_COLS, md: 10, sm: 6, xs: 4, xxs: 2 }

/** The draggable / resizable grid of widgets, backed by redux + persistence. */
export default function WidgetBoard() {
  const dispatch = useAppDispatch()
  const instances = useAppSelector((state) => state.widgets.instances)
  const layout = useAppSelector((state) => state.widgets.layout)

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
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
      >
        {instances.map((inst) => {
          const Widget = widgetComponents[inst.type]
          const meta = widgetMetaByType[inst.type]
          return (
            <div key={inst.id}>
              <WidgetCard
                title={meta.title}
                onRemove={() => dispatch(removeWidget(inst.id))}
              >
                <Widget id={inst.id} />
              </WidgetCard>
            </div>
          )
        })}
      </ResponsiveGridLayout>
    </Box>
  )
}
