import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import type { GridLayoutItem, WidgetInstance, WidgetType } from './types'
import { defaultWidgetData, widgetMetaByType } from './widgetCatalog'

export const GRID_COLS = 12

export interface WidgetsState {
  instances: WidgetInstance[]
  layout: GridLayoutItem[]
}

function seedState(): WidgetsState {
  const instances: WidgetInstance[] = [
    { id: 'seed-clock', type: 'clock', data: defaultWidgetData('clock') },
    { id: 'seed-counter', type: 'counter', data: defaultWidgetData('counter') },
    { id: 'seed-notes', type: 'notes', data: defaultWidgetData('notes') },
  ]
  const layout: GridLayoutItem[] = [
    { i: 'seed-clock', x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'seed-counter', x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'seed-notes', x: 6, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
  ]
  return { instances, layout }
}

const initialState: WidgetsState = seedState()

/** Lowest free row so a newly added widget lands at the bottom. */
function nextRow(layout: GridLayoutItem[]): number {
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
}

const widgetsSlice = createSlice({
  name: 'widgets',
  initialState,
  reducers: {
    addWidget: {
      reducer(state, action: PayloadAction<{ id: string; type: WidgetType }>) {
        const { id, type } = action.payload
        const meta = widgetMetaByType[type]
        state.instances.push({ id, type, data: defaultWidgetData(type) })
        state.layout.push({
          i: id,
          x: 0,
          y: nextRow(state.layout),
          w: meta.defaultSize.w,
          h: meta.defaultSize.h,
          minW: meta.defaultSize.minW,
          minH: meta.defaultSize.minH,
        })
      },
      prepare(type: WidgetType) {
        return { payload: { id: nanoid(), type } }
      },
    },
    removeWidget(state, action: PayloadAction<string>) {
      const id = action.payload
      state.instances = state.instances.filter((w) => w.id !== id)
      state.layout = state.layout.filter((l) => l.i !== id)
    },
    updateLayout(state, action: PayloadAction<GridLayoutItem[]>) {
      // Only keep entries that still correspond to a live instance.
      const ids = new Set(state.instances.map((w) => w.id))
      state.layout = action.payload
        .filter((l) => ids.has(l.i))
        .map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH }))
    },
    updateWidgetData(
      state,
      action: PayloadAction<{ id: string; data: Record<string, unknown> }>,
    ) {
      const inst = state.instances.find((w) => w.id === action.payload.id)
      if (inst) inst.data = { ...inst.data, ...action.payload.data }
    },
    resetLayout() {
      return seedState()
    },
  },
})

export const {
  addWidget,
  removeWidget,
  updateLayout,
  updateWidgetData,
  resetLayout,
} = widgetsSlice.actions

export default widgetsSlice.reducer
