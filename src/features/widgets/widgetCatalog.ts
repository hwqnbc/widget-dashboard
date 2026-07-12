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
    type: 'roundClock',
    title: 'Round Clock',
    description: 'Analog clock with an orbiting Claude',
    defaultSize: { w: 3, h: 4, minW: 3, minH: 4 },
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
  {
    type: 'imageToggle',
    title: 'Character Toggle',
    description: 'Tap to switch between two cartoon characters',
    defaultSize: { w: 3, h: 5, minW: 2, minH: 4 },
  },
  {
    type: 'avatarActions',
    title: 'Avatar Actions',
    description: 'Pick a character, tap to see its action',
    defaultSize: { w: 3, h: 6, minW: 3, minH: 5 },
  },
  {
    type: 'ticTacToe',
    title: 'Tic-Tac-Toe',
    description: 'Toy vs Ninja — tap to play',
    defaultSize: { w: 3, h: 5, minW: 3, minH: 5 },
  },
  {
    type: 'connect4',
    title: 'Connect 4',
    description: 'Drop discs — Toy vs Ninja',
    defaultSize: { w: 5, h: 5, minW: 4, minH: 5 },
  },
  {
    type: 'memory',
    title: 'Memory',
    description: '2-player pairs — Toy vs Ninja',
    defaultSize: { w: 5, h: 6, minW: 4, minH: 5 },
  },
  {
    type: 'archery',
    title: 'Archery',
    description: 'Toy vs Ninja — drag to aim, first to 5 hits',
    defaultSize: { w: 6, h: 6, minW: 5, minH: 5 },
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
    case 'imageToggle':
      return { character: 'toy' }
    case 'avatarActions':
      return { avatar: 'toy' }
    case 'ticTacToe':
      return {
        board: Array(9).fill(null),
        mode: 'pvp',
        difficulty: 'easy',
        first: 'toy',
      }
    case 'connect4':
      return {
        board: Array(42).fill(null),
        mode: 'pvp',
        difficulty: 'medium',
        first: 'toy',
      }
    case 'memory':
      return {
        size: 4,
        cards: [],
        matched: [],
        flipped: [],
        turn: 'toy',
        scores: { toy: 0, ninja: 0 },
        rule: 'again',
      }
    case 'archery':
      return {
        p1y: 0,
        p2y: 0,
        scores: { toy: 0, ninja: 0 },
        turn: 'toy',
        first: 'toy',
        mode: 'calm',
        wind: 0,
        distance: 'short',
        platforms: 'still',
      }
    case 'clock':
    default:
      return {}
  }
}
