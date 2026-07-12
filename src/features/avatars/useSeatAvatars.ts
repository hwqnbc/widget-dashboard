import { useAppSelector } from '../../app/hooks'
import { avatarMetaById } from './avatarCatalog'
import { avatarVisualById, type AvatarVisual } from '../../registry/avatarRegistry'
import { AVATAR_IDS, DEFAULT_SEAT_AVATARS } from './types'
import type { AvatarId, Seat, SeatAvatars } from './types'

const isAvatarId = (v: unknown): v is AvatarId =>
  typeof v === 'string' && (AVATAR_IDS as string[]).includes(v)

/**
 * The current seat→avatar map, read from persisted UI state with a defensive
 * fallback to the identity default (guards state persisted before the field
 * existed, or a removed avatar id).
 */
export function useSeatAvatars(): SeatAvatars {
  const stored = useAppSelector((s) => s.ui.avatars)
  return {
    toy: isAvatarId(stored?.toy) ? stored.toy : DEFAULT_SEAT_AVATARS.toy,
    ninja: isAvatarId(stored?.ninja) ? stored.ninja : DEFAULT_SEAT_AVATARS.ninja,
  }
}

/** The avatar a seat currently renders as. */
export function useSeatAvatarId(seat: Seat): AvatarId {
  return useSeatAvatars()[seat]
}

/** Convenience: resolve a seat straight to its avatar's visual bundle. */
export function useSeatVisual(seat: Seat): AvatarVisual {
  return avatarVisualById[useSeatAvatarId(seat)]
}

/** Convenience: resolve a seat straight to its avatar's brand colour. */
export function useSeatColor(seat: Seat): string {
  return avatarMetaById[useSeatAvatarId(seat)].color
}
