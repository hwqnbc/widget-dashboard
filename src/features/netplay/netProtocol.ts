/**
 * The wire protocol: what two devices actually say to each other.
 *
 * Deliberately game-agnostic — a turn-based board game only ever needs "I
 * played this move", "here is the whole position" and "new game". Connect 4
 * moves are a column index; Tic-Tac-Toe's would be a cell index, and the same
 * envelope carries both. `sync` state is opaque here and validated by the
 * widget that understands it.
 *
 * Pure module (no DOM): the e2e suites import it directly.
 */
import type { Seat } from '../avatars/types'
import type { NetRole } from './types'

/** Bumped when a message shape changes incompatibly. Peers on different
 * versions refuse to play rather than desync halfway through a game. */
export const NET_VERSION = 1

export type NetMsg =
  /** First message each side sends; carries the version handshake. */
  | { t: 'hello'; v: number }
  /** A move by `seat` at `ply` (the number of moves already played). The ply
   * makes a duplicated or reordered delivery detectable instead of corrupting
   * the board. */
  | { t: 'move'; seat: Seat; ply: number; move: number }
  /** Whole-position push. The host sends one on connect so a guest joining
   * mid-game (or reconnecting) lands on the same board. */
  | { t: 'sync'; state: unknown }
  /** Restart, with who opens. Either side may call it; both apply it. */
  | { t: 'new'; first: Seat }

export const otherSeat = (seat: Seat): Seat => (seat === 'toy' ? 'ninja' : 'toy')

/** The seat a role plays. Host is always Player 1 so both sides agree without
 * negotiating. */
export const seatForRole = (role: NetRole): Seat => (role === 'host' ? 'toy' : 'ninja')

export const encodeMsg = (msg: NetMsg): string => JSON.stringify(msg)

const isSeat = (v: unknown): v is Seat => v === 'toy' || v === 'ninja'

/**
 * Parse a wire message, rejecting anything malformed.
 *
 * The peer is another copy of this app on the same wifi, not a hostile party —
 * but a half-delivered or version-skewed message must never be applied to the
 * board, so every field is checked before it is trusted.
 */
export function decodeMsg(raw: string): NetMsg | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const m = parsed as Record<string, unknown>
  switch (m.t) {
    case 'hello':
      return typeof m.v === 'number' ? { t: 'hello', v: m.v } : null
    case 'move':
      return isSeat(m.seat) &&
        Number.isInteger(m.ply) &&
        Number.isInteger(m.move) &&
        (m.ply as number) >= 0
        ? { t: 'move', seat: m.seat, ply: m.ply as number, move: m.move as number }
        : null
    case 'sync':
      return 'state' in m ? { t: 'sync', state: m.state } : null
    case 'new':
      return isSeat(m.first) ? { t: 'new', first: m.first } : null
    default:
      return null
  }
}
