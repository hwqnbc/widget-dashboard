export type WidgetType =
  | 'clock'
  | 'roundClock'
  | 'counter'
  | 'notes'
  | 'imageToggle'
  | 'sixSeven'

/** A widget placed on the board. `data` holds per-widget persisted state. */
export interface WidgetInstance {
  id: string
  type: WidgetType
  data: Record<string, unknown>
}

/**
 * Serializable subset of react-grid-layout's layout item that we persist.
 * `i` matches the WidgetInstance id.
 */
export interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}
