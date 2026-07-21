import type { WidgetType } from './types'
// Data-only modules (no components/React) — safe for the catalog to import.
import { DEFAULT_SEED } from '../../components/widgets/droneSim/worldLayout'
import { DEFAULT_TANK_SEED } from '../../components/widgets/tankBattle/terrain'

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
  /** If set, full-screen mode nudges the device to this orientation (rotate
   * hint + best-effort lock). Omit for widgets that work in any orientation. */
  preferredOrientation?: 'landscape' | 'portrait'
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
    description: 'Pick a character, tap to play its celebration',
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
    preferredOrientation: 'landscape',
  },
  {
    type: 'droneSim',
    title: 'Drone Sim',
    description: 'Fly a quadcopter over a 3D city — twin-stick controls',
    defaultSize: { w: 6, h: 6, minW: 5, minH: 5 },
    preferredOrientation: 'landscape',
  },
  {
    type: 'droneStrike',
    title: 'Drone Strike',
    description: 'FPV drone shooting game — fly to aim, clear the waves',
    defaultSize: { w: 6, h: 6, minW: 5, minH: 5 },
    preferredOrientation: 'landscape',
  },
  {
    type: 'tankBattle',
    title: 'Tank Battle',
    description: 'Drive a tank over contoured terrain — hunt enemy armour',
    defaultSize: { w: 6, h: 6, minW: 5, minH: 5 },
    preferredOrientation: 'landscape',
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
    case 'droneSim':
      return {
        view: 'tp',
        score: 0,
        bestLapMs: 0,
        bestLapPath: [],
        worldSeed: DEFAULT_SEED,
        gateCount: 3,
        courseMode: 'seed',
        customRings: [],
        weather: 'clear',
        crashes: true,
        flightMode: 'hold',
        minimap: true,
        rateSpeed: 1,
        rateYaw: 1,
        stickExpo: 0,
        turbo: false,
        richWorld: true,
        landing: false,
        landingBest: 0,
        battery: false,
        followDist: 7,
        fpvPolish: false,
      }
    case 'droneStrike':
      return {
        worldSeed: DEFAULT_SEED,
        bestWave: 0,
        bestScore: 0,
        view: 'fp',
        autoFire: false,
        aimAssist: 'mild',
        aimMode: 'classic',
        difficulty: 'easy',
        gyroAim: 'off',
        minimap: true,
        richWorld: true,
        weather: 'clear',
        flightMode: 'hold',
        rateSpeed: 1,
        rateYaw: 1,
        stickExpo: 0,
        turbo: false,
        battery: false,
        crashes: true,
      }
    case 'tankBattle':
      return {
        worldSeed: DEFAULT_TANK_SEED,
        battleMode: 'waves',
        roughness: 'rolling',
        bestWave: 0,
        bestScore: 0,
        bestRoamMs: 0,
        autoFire: false,
        autoTurn: true,
        aimAssist: 'mild',
        gyroAim: 'off',
        minimap: true,
        weather: 'clear',
        rateSpeed: 1,
        rateTraverse: 1,
        stickExpo: 0,
        helpSeen: false,
      }
    case 'clock':
    default:
      return {}
  }
}
