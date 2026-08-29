import { createContext, useContext } from 'react'
import { useAppSelector } from '../../app/hooks'
import { avatarMetaById } from './avatarCatalog'
import { avatarVisualById, type AvatarVisual } from '../../registry/avatarRegistry'
import { AVATAR_IDS, DEFAULT_SEAT_AVATARS } from './types'
import type { AvatarId, Seat, SeatAvatars } from './types'

const isAvatarId = (v: unknown): v is AvatarId =>
  typeof v === 'string' && (AVATAR_IDS as string[]).includes(v)

/**
 * Validate a seat→avatar map that arrived from OUTSIDE this device — a
 * netplay peer's `sync` payload. Same standard persisted data is held to:
 * anything not a known avatar id is rejected whole.
 */
export function coerceSeatAvatars(value: unknown): SeatAvatars | undefined {
  if (!value || typeof value !== 'object') return undefined
  const map = value as Record<string, unknown>
  return isAvatarId(map.toy) && isAvatarId(map.ninja)
    ? { toy: map.toy, ninja: map.ninja }
    : undefined
}

/**
 * A transient seat→avatar override for one widget's subtree.
 *
 * Two-device play syncs the HOST's avatar picks so both screens show the same
 * characters ("my guy" must be the same guy on both tablets). The guest wears
 * them as a costume, never as a settings write: the override lives in React
 * state scoped to the linked widget, so the rest of the guest's dashboard —
 * and their persisted picks — are untouched, and everything reverts the
 * moment the link drops. Every seat-resolving hook below consults it first.
 */
export const SeatAvatarsOverride = createContext<SeatAvatars | null>(null)

/**
 * The current seat→avatar map, read from persisted UI state with a defensive
 * fallback to the identity default (guards state persisted before the field
 * existed, or a removed avatar id).
 */
export function useSeatAvatars(): SeatAvatars {
  const override = useContext(SeatAvatarsOverride)
  const stored = useAppSelector((s) => s.ui.avatars)
  if (override) return override
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
