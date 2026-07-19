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
export interface AvatarVisual {
  Head: ComponentType<{ size?: number | string }>
  Figure: ComponentType
  Celebration: ComponentType
}

export const avatarVisualById: Record<AvatarId, AvatarVisual> = {
  toy: { Head: ToyHead, Figure: ToyFigure, Celebration: ToyCelebration },
  ninja: { Head: NinjaHead, Figure: NinjaFigure, Celebration: NinjaCelebration },
  fireninja: { Head: FireNinjaHead, Figure: FireNinjaFigure, Celebration: FireNinjaCelebration },
  darkarin: { Head: DarkArinHead, Figure: DarkArinFigure, Celebration: DarkArinCelebration },
  frak: { Head: FrakHead, Figure: FrakFigure, Celebration: FrakCelebration },
  imperium: { Head: ImperiumHead, Figure: ImperiumFigure, Celebration: ImperiumCelebration },
}
