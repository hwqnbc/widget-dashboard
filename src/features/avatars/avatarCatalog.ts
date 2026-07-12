import type { AvatarId } from './types'
import { TOY } from '../../components/widgets/characters/toy/toyPalette'
import { N } from '../../components/widgets/characters/ninja/ninjaPalette'

/**
 * Component-free avatar metadata (name + brand colour). Kept free of component
 * imports — like `widgetCatalog.ts` — so slices and non-visual code can depend
 * on it without pulling in SVGs. This is the single source for a player's colour
 * and display name (it replaces the old `playerColors.ts` map and the inline
 * `'Toy'/'Ninja'` label strings). The visual components live in the avatar
 * registry (`src/registry/avatarRegistry.tsx`), keyed by the same `id`.
 */
export interface AvatarMeta {
  id: AvatarId
  name: string
  color: string
}

export const AVATAR_CATALOG: AvatarMeta[] = [
  { id: 'toy', name: 'Toy', color: TOY.teal },
  { id: 'ninja', name: 'Ninja', color: N.iceDeep },
]

export const avatarMetaById = Object.fromEntries(
  AVATAR_CATALOG.map((m) => [m.id, m]),
) as Record<AvatarId, AvatarMeta>
