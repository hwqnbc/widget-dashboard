import type { WidgetType } from './types'

/**
 * Static metadata about each widget type. Kept free of component imports so
 * both the redux slice and the (component-carrying) registry can depend on it
 * without creating an import cycle.
 */
export interface WidgetMeta {
  type: WidgetType
  title: string
  description: string
  defaultSize: { w: number; h: number; minW: number; minH: number }
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    type: 'clock',
    title: 'Clock',
    description: 'Live local time',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    type: 'counter',
    title: 'Counter',
    description: 'A persisted click counter',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    type: 'notes',
    title: 'Notes',
    description: 'A scratchpad that saves as you type',
    defaultSize: { w: 4, h: 4, minW: 2, minH: 2 },
  },
]

export const widgetMetaByType = Object.fromEntries(
  WIDGET_CATALOG.map((m) => [m.type, m]),
) as Record<WidgetType, WidgetMeta>

/** Default per-widget `data` used when a new instance is created. */
export function defaultWidgetData(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'counter':
      return { count: 0 }
    case 'notes':
      return { text: '' }
    case 'clock':
    default:
      return {}
  }
}
