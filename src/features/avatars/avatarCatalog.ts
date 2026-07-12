import type { AvatarId } from './types'
import { TOY } from '../../components/widgets/characters/toy/toyPalette'
import { N } from '../../components/widgets/characters/ninja/ninjaPalette'
import { F } from '../../components/widgets/characters/fireninja/fireNinjaPalette'
import { D } from '../../components/widgets/characters/darkarin/darkArinPalette'
import { FR } from '../../components/widgets/characters/frak/frakPalette'

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
  { id: 'fireninja', name: 'Fire Ninja', color: F.gi },
  { id: 'darkarin', name: 'DarkArin', color: D.gi },
  { id: 'frak', name: 'frak', color: FR.hood },
]

export const avatarMetaById = Object.fromEntries(
  AVATAR_CATALOG.map((m) => [m.id, m]),
) as Record<AvatarId, AvatarMeta>
