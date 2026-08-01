import { lazy } from 'react'
import type { ComponentType } from 'react'
import type { AvatarId } from '../features/avatars/types'
import { ToyHead, ToyFigure, ToyCelebration } from '../components/widgets/characters/toy'
import { NinjaHead, NinjaFigure, NinjaCelebration } from '../components/widgets/characters/ninja'
import { FireNinjaHead, FireNinjaFigure, FireNinjaCelebration } from '../components/widgets/characters/fireninja'
import { DarkArinHead, DarkArinFigure, DarkArinCelebration } from '../components/widgets/characters/darkarin'
import { FrakHead, FrakFigure, FrakCelebration } from '../components/widgets/characters/frak'
import { ImperiumHead, ImperiumFigure, ImperiumCelebration } from '../components/widgets/characters/imperium'

/**
 * The visual pieces of an avatar, grouped: the head (used as the game chip/mark),
 * the full-body figure, and the looping victory `Celebration` (also what the
 * Avatar Actions widget plays on tap). Mirrors the widget registry
 * (`widgetRegistry.ts`): this is the component-carrying layer, keyed by
 * `AvatarId`; the metadata (name/colour) lives in the component-free
 * `avatarCatalog.ts`.
 */
/** One named move a 3D model can play (`id` is the `action` prop value;
 * `name` is the toggle-button label in the Avatar Actions widget). */
export interface Action3D {
  id: string
  name: string
}

export interface AvatarVisual {
  Head: ComponentType<{ size?: number | string }>
  Figure: ComponentType
  Celebration: ComponentType
  /** Optional 3D figure VIEWER (its own <Canvas> on the turntable stage).
   * Registered with lazy() so the three.js chunk loads only when a 3D view
   * is actually rendered (wrap in <Suspense>). Avatars without one show
   * "not available" in the Avatar Actions 3D view. `spinning` is the
   * user's turntable toggle (uniform across avatars — default true; false
   * eases the figure back to face the camera). */
  Figure3D?: ComponentType<{ action?: string; spinning?: boolean }>
  /** Optional mesh-level 3D MODEL for reuse INSIDE an existing R3F canvas
   * (no stage, no spin — venue-neutral, faces +Z, feet at y=0). The Drone
   * Sim renders Player 1's model as the RC operator when present. Same
   * lazy() rule; wrap in <Suspense>. `action` selects a named move from
   * `actions3d` (undefined/unknown = idle). */
  Model3D?: ComponentType<{ action?: string }>
  /** The 3D model's named-move library. Metadata lives HERE — not in the
   * lazy model chunk — so pickers render without loading three.js. Grows
   * one entry per added action; ids are stable, moves are refined in
   * place. */
  actions3d?: Action3D[]
}

// Per-avatar 3D figures — dynamic imports keep three.js out of the main chunk.
const ToyFigure3D = lazy(() => import('../components/widgets/characters/toy/ToyFigure3D'))
const ToyModel3D = lazy(() => import('../components/widgets/characters/toy/ToyModel3D'))
const NinjaFigure3D = lazy(() => import('../components/widgets/characters/ninja/NinjaFigure3D'))
const NinjaModel3D = lazy(() => import('../components/widgets/characters/ninja/NinjaModel3D'))
const FireNinjaFigure3D = lazy(() => import('../components/widgets/characters/fireninja/FireNinjaFigure3D'))
const FireNinjaModel3D = lazy(() => import('../components/widgets/characters/fireninja/FireNinjaModel3D'))
const DarkArinFigure3D = lazy(() => import('../components/widgets/characters/darkarin/DarkArinFigure3D'))
const DarkArinModel3D = lazy(() => import('../components/widgets/characters/darkarin/DarkArinModel3D'))

export const avatarVisualById: Record<AvatarId, AvatarVisual> = {
  toy: {
    Head: ToyHead,
    Figure: ToyFigure,
    Celebration: ToyCelebration,
    Figure3D: ToyFigure3D,
    Model3D: ToyModel3D,
    actions3d: [
      { id: 'dance', name: 'Dance' },
      { id: 'sixsevenshow', name: '6 7 Show' },
    ],
  },
  ninja: {
    Head: NinjaHead,
    Figure: NinjaFigure,
    Celebration: NinjaCelebration,
    Figure3D: NinjaFigure3D,
    Model3D: NinjaModel3D,
    actions3d: [
      { id: 'pump', name: 'Pump' },
      { id: 'draw', name: 'Draw' },
    ],
  },
  fireninja: {
    Head: FireNinjaHead,
    Figure: FireNinjaFigure,
    Celebration: FireNinjaCelebration,
    Figure3D: FireNinjaFigure3D,
    Model3D: FireNinjaModel3D,
    actions3d: [{ id: 'blaze', name: 'Fire Blade' }],
  },
  darkarin: {
    Head: DarkArinHead,
    Figure: DarkArinFigure,
    Celebration: DarkArinCelebration,
    Figure3D: DarkArinFigure3D,
    Model3D: DarkArinModel3D,
    actions3d: [{ id: 'cross', name: 'Twin Cross' }],
  },
  frak: { Head: FrakHead, Figure: FrakFigure, Celebration: FrakCelebration },
  imperium: { Head: ImperiumHead, Figure: ImperiumFigure, Celebration: ImperiumCelebration },
}
