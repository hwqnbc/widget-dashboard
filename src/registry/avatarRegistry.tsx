import type { ComponentType } from 'react'
import type { AvatarActionProps, AvatarId } from '../features/avatars/types'
import { ToyHead, ToyFigure, ToyCelebration, ToyAction } from '../components/widgets/characters/toy'
import { NinjaHead, NinjaFigure, NinjaCelebration, NinjaAction } from '../components/widgets/characters/ninja'
import { FireNinjaHead, FireNinjaFigure, FireNinjaCelebration, FireNinjaAction } from '../components/widgets/characters/fireninja'

/**
 * The visual pieces of an avatar, grouped: the head (used as the game chip/mark),
 * the full-body figure, the looping victory "action" (`Celebration`), and the
 * tap-toggled "action" (`Action`, driven by the Avatar Actions widget). Mirrors
 * the widget registry (`widgetRegistry.ts`): this is the component-carrying layer,
 * keyed by `AvatarId`; the metadata (name/colour) lives in the component-free
 * `avatarCatalog.ts`.
 */
export interface AvatarVisual {
  Head: ComponentType<{ size?: number | string }>
  Figure: ComponentType
  Celebration: ComponentType
  Action: ComponentType<AvatarActionProps>
}

export const avatarVisualById: Record<AvatarId, AvatarVisual> = {
  toy: { Head: ToyHead, Figure: ToyFigure, Celebration: ToyCelebration, Action: ToyAction },
  ninja: { Head: NinjaHead, Figure: NinjaFigure, Celebration: NinjaCelebration, Action: NinjaAction },
  fireninja: { Head: FireNinjaHead, Figure: FireNinjaFigure, Celebration: FireNinjaCelebration, Action: FireNinjaAction },
}
