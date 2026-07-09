import type { ComponentType } from 'react'
import type { WidgetType } from '../features/widgets/types'
import ClockWidget from '../components/widgets/ClockWidget'
import RoundClockWidget from '../components/widgets/RoundClockWidget'
import CounterWidget from '../components/widgets/CounterWidget'
import NotesWidget from '../components/widgets/NotesWidget'

/** Props every widget component receives. */
export interface WidgetProps {
  id: string
}

/** Maps a widget type to the component that renders it. */
export const widgetComponents: Record<WidgetType, ComponentType<WidgetProps>> = {
  clock: ClockWidget,
  roundClock: RoundClockWidget,
  counter: CounterWidget,
  notes: NotesWidget,
}
