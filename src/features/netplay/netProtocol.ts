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

/**
 * Bumped when a message shape changes incompatibly. Peers on different
 * versions refuse to play rather than desync halfway through a game.
 *
 * **2** added the real-time race messages (`go`/`pos`/`done`). Adding message
 * types is exactly the kind of change this guard exists for: an older peer
 * drops what it cannot parse, so a race against one would half-work — both
 * boards live, no countdown, no ghost, no winner — which is far worse than
 * refusing to pair.
 *
 * **3** added the liveness heartbeat (`ping`/`pong`). Same reasoning, in the
 * other direction: an older peer would never pong, so this side would wrongly
 * declare a healthy link dead.
 */
export const NET_VERSION = 3

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
  /** Real-time games only. Start the run NOW — both sides count down from
   * their own receipt, which on a LAN differ by a millisecond or two. */
  | { t: 'go' }
  /** Real-time games only. Where a runner has got to. Sent per committed
   * move, so it is last-write-wins and needs no sequencing: a stale delivery
   * is corrected by the next one, and losing the last one costs a marker
   * position, not the game. */
  | { t: 'pos'; seat: Seat; cell: number }
  /** Real-time games only. This seat finished, with its elapsed ms. With a
   * synchronised start the first `done` is also the lower time, so the winner
   * needs no arbitration and message ordering cannot change it. */
  | { t: 'done'; seat: Seat; ms: number }
  /** Liveness. Handled entirely inside `useNetplay`, like `hello` — games
   * never see either. A backgrounded tablet tab stops JS without firing any
   * close event; silence is the only signal, so somebody has to speak. */
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }

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
    case 'go':
      return { t: 'go' }
    case 'pos':
      return isSeat(m.seat) && Number.isInteger(m.cell) && (m.cell as number) >= 0
        ? { t: 'pos', seat: m.seat, cell: m.cell as number }
        : null
    case 'done':
      return isSeat(m.seat) && typeof m.ms === 'number' && Number.isFinite(m.ms) && m.ms >= 0
        ? { t: 'done', seat: m.seat, ms: m.ms }
        : null
    case 'ping':
      return Number.isInteger(m.n) ? { t: 'ping', n: m.n as number } : null
    case 'pong':
      return Number.isInteger(m.n) ? { t: 'pong', n: m.n as number } : null
    default:
      return null
  }
}
