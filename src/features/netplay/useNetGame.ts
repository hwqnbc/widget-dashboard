/**
 * The netplay wiring every turn-based board game needs, once.
 *
 * `useNetplay` moves opaque strings; this sits on top of it and speaks board
 * games: whose seat this device plays, when the board is live, what to do with
 * an incoming move, and when to push the position. What stays game-specific is
 * exactly one thing — how a move index is applied to a board.
 *
 * Extracted when Tic-Tac-Toe became the second consumer. Connect 4 had carried
 * ~70 lines of this inline, and all but `dropInto` turned out to be generic:
 * both games derive the turn from `(board, first)`, both count ply as filled
 * cells, and both sync `{ board, first }`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Seat, SeatAvatars } from '../avatars/types'
import { coerceSeatAvatars, useSeatAvatars } from '../avatars/useSeatAvatars'
import { useNetplay, type NetplayLink } from './useNetplay'

export interface NetGameOptions<TBoard> {
  /** Is the widget in its two-device mode right now? */
  online: boolean
  board: TBoard
  first: Seat
  turn: Seat
  /** Moves already played — the position the next move applies to. */
  ply: number
  /** Apply the other device's move, or null if it cannot be applied. */
  applyMove(board: TBoard, move: number, seat: Seat): TBoard | null
  /** Validate a `sync` payload's board. A peer is outside our control. */
  coerceBoard(value: unknown): TBoard | undefined
  /** A fresh empty board, for the `new` broadcast. */
  newBoard(): TBoard
  /** Clear transient UI before a remote board replaces the local one. */
  onReplace?(): void
  setGame(next: Record<string, unknown>): void
}

export interface NetGame {
  link: NetplayLink
  linkOpen: boolean
  setLinkOpen(open: boolean): void
  /** The board is dead: not paired yet, or it is the other device's turn. */
  blocked: boolean
  /**
   * The HOST's seat→avatar picks, delivered in its `sync` — non-null only on
   * a connected guest. Both screens must show the same characters, or "my
   * guy" isn't the same guy on the two devices; the guest feeds this to
   * `SeatAvatarsOverride` so its widget wears the host's picks as a costume
   * without its own settings being touched.
   */
  peerAvatars: SeatAvatars | null
  sendMove(move: number): void
  sendNew(first: Seat): void
}

export function useNetGame<TBoard>(opts: NetGameOptions<TBoard>): NetGame {
  const { online, board, first, turn, ply } = opts
  const [linkOpen, setLinkOpen] = useState(false)
  const [peerAvatars, setPeerAvatars] = useState<SeatAvatars | null>(null)
  // The host's OWN picks (redux — the hook runs above any override provider),
  // sent with the position so the guest renders the same characters.
  const seatAvatars = useSeatAvatars()
  const avatarsRef = useRef(seatAvatars)
  avatarsRef.current = seatAvatars

  // The message handler runs from a transport callback, and needs values that
  // are only known after `useNetplay` returns (our seat) or that would
  // otherwise be captured stale (the board). Refs carry both in.
  const seatRef = useRef<Seat | null>(null)
  const state = useRef(opts)
  state.current = opts

  const link = useNetplay((msg) => {
    const {
      board: current,
      turn: toMove,
      ply: played,
      applyMove,
      coerceBoard,
      newBoard,
      onReplace,
      setGame,
    } = state.current
    const localSeat = seatRef.current

    if (msg.t === 'move') {
      // Three independent reasons to ignore a move, all of which mean the two
      // boards have drifted rather than that the peer is misbehaving: it is
      // our own move echoed back, it is not that seat's turn, or it belongs to
      // a different point in the game. Dropping it leaves the position intact.
      if (!localSeat || msg.seat === localSeat) return
      if (msg.seat !== toMove) return
      if (msg.ply !== played) return
      const next = applyMove(current, msg.move, msg.seat)
      if (!next) return
      setGame({ board: next })
      return
    }
    if (msg.t === 'sync') {
      const payload = msg.state as {
        board?: unknown
        first?: unknown
        avatars?: unknown
      } | null
      // Avatars ride the same sync but stand alone: a bad board must not
      // block the costume, nor a bad costume the board.
      setPeerAvatars(coerceSeatAvatars(payload?.avatars) ?? null)
      const synced = coerceBoard(payload?.board)
      if (!synced) return
      onReplace?.()
      setGame({
        board: synced,
        first: payload?.first === 'ninja' ? 'ninja' : 'toy',
      })
      return
    }
    if (msg.t === 'new') {
      onReplace?.()
      setGame({ board: newBoard(), first: msg.first })
    }
  })
  seatRef.current = link.seat

  // On connect the host pushes the position, so a device joining a game already
  // in progress (or re-pairing after a sleep) lands on the same board. The
  // version handshake is the link's own business — see `useNetplay`.
  useEffect(() => {
    if (!online || !link.connected) return
    if (link.role === 'host') {
      link.send({ t: 'sync', state: { board, first, avatars: avatarsRef.current } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, link.connected, link.role])

  // Leaving the mode drops the link rather than leaving a data channel open
  // behind a board nobody is playing on.
  useEffect(() => {
    if (!online) {
      link.disconnect()
      setLinkOpen(false)
      setPeerAvatars(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Entering it with no link yet: open the pairing dialog, since that is the
  // only thing to do next.
  useEffect(() => {
    if (online && link.status === 'idle') setLinkOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  const sendMove = useCallback(
    (move: number) => {
      // The ply sent is the position BEFORE this move — what the other side
      // checks it against.
      link.send({ t: 'move', seat: turn, ply, move })
    },
    [link, turn, ply],
  )
  const sendNew = useCallback(
    (opening: Seat) => {
      if (link.connected) link.send({ t: 'new', first: opening })
    },
    [link],
  )

  return {
    link,
    linkOpen,
    setLinkOpen,
    blocked: online && (!link.connected || turn !== link.seat),
    // Costume off the moment the link is down — a stale override would keep
    // showing the other household's picks on a dead board.
    peerAvatars: link.connected ? peerAvatars : null,
    sendMove,
    sendNew,
  }
}
