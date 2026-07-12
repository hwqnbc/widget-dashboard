/**
 * Avatar identity vs player seat.
 *
 * A **seat** is one of the two fixed players in a game (Player 1 / Player 2).
 * Its literal id (`'toy'` / `'ninja'`) is what board cells, scores, the AI and
 * archer positions key on — it never changes, so no persisted game state has to
 * migrate.
 *
 * An **avatar** is a *look* (head + figure + actions + colour + name). Each seat
 * renders whichever avatar the player picked; the default map is the identity
 * `{ toy: 'toy', ninja: 'ninja' }`, so out of the box a seat shows its namesake.
 *
 * `AvatarId` is the extension point — add a new figure here (and a catalog +
 * registry entry) to grow the roster.
 */
export type AvatarId = 'toy' | 'ninja' | 'fireninja' | 'darkarin'

/** The two immutable player seats. Same literals as the original player ids. */
export type Seat = 'toy' | 'ninja'

/** Every seat's chosen avatar. */
export type SeatAvatars = Record<Seat, AvatarId>

export const SEATS: Seat[] = ['toy', 'ninja']
export const AVATAR_IDS: AvatarId[] = ['toy', 'ninja', 'fireninja', 'darkarin']

/** Identity mapping — each seat shows its namesake avatar (the default look). */
export const DEFAULT_SEAT_AVATARS: SeatAvatars = { toy: 'toy', ninja: 'ninja' }

/**
 * Props for an avatar's tap-toggled "action" component (the animated move shown
 * by the Avatar Actions widget). `active` plays/holds the action; `animate`
 * gates the transition so the initial/static render snaps without flashing.
 * Component-free so the per-avatar wrappers and the registry share it without an
 * import cycle.
 */
export interface AvatarActionProps {
  active: boolean
  animate: boolean
}
