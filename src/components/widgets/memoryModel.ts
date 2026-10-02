/**
 * Pure rules for the Memory widget — deck building, the single-card flip, and
 * two-card pair resolution. Extracted from the widget when 2 Devices mode
 * arrived, so both ends of the wire run the SAME logic: a remote flip applies
 * through `flipCard` exactly like a local tap, and a device whose reveal
 * timer lags (a throttled background tab) can resolve the pending pair
 * synchronously before applying the next remote flip. No React, no timers —
 * the widget owns the reveal delay; everything here is deterministic from
 * its inputs.
 */
import { AVATAR_IDS } from '../../features/avatars/types'

export type MemSeat = 'toy' | 'ninja'
export type MemSize = 4 | 6
export type MemRule = 'again' | 'pass'
export type MemScores = { toy: number; ninja: number }

/**
 * The whole game in one object — the shape `sync` ships between devices.
 * `turn` lives INSIDE the state (a match keeps the turn under the "go again"
 * rule, so seats do not alternate — same reasoning as Othello's in-position
 * turn), and `ply` counts individual FLIPS, not turns: the wire's replay
 * guard needs a counter that moves on every move sent, and two flips by the
 * same seat must carry different ply values.
 */
export interface MemState {
  size: MemSize
  rule: MemRule
  cards: string[]
  matched: boolean[]
  flipped: number[]
  turn: MemSeat
  scores: MemScores
  ply: number
}

/** Reveal pause before a resolved pair is scored / flipped back. */
export const MATCH_MS = 600
export const MISS_MS = 1100

export const otherSeat = (s: MemSeat): MemSeat => (s === 'toy' ? 'ninja' : 'toy')

export const FACE_COLORS = [
  '#d5504b', '#e5842a', '#f2b705', '#4a9d5b', '#16b3a3',
  '#3d7edb', '#5c5fd6', '#9b59b6', '#e0559b',
]
// motif × colour → distinct faces; a pair = same "motif:colour". With every
// avatar in the pool there are plenty for the 6×6 board (18 pairs).
export const ALL_FACES = AVATAR_IDS.flatMap((m) => FACE_COLORS.map((c) => `${m}:${c}`))

/** Fisher–Yates shuffle, in place, returning the array for chaining. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function buildDeck(size: MemSize): string[] {
  const pairs = (size * size) / 2
  // Randomly pick distinct faces from the full pool — so every game varies and
  // any avatar can appear — then lay each out as a pair and shuffle positions.
  const faces = shuffle(ALL_FACES.slice()).slice(0, pairs)
  return shuffle(faces.flatMap((f) => [f, f]))
}

/** A freshly dealt game. Random — an online restart must therefore cross the
 * wire as a whole-state `sync` (Archery precedent), never as `new`. */
export function freshGame(size: MemSize, rule: MemRule): MemState {
  return {
    size,
    rule,
    cards: buildDeck(size),
    matched: Array<boolean>(size * size).fill(false),
    flipped: [],
    turn: 'toy',
    scores: { toy: 0, ninja: 0 },
    ply: 0,
  }
}

/** The randomness-free `newBoard` fallback: an undealt board. Memory never
 * sends `new`, but the seam requires a deterministic answer to one. */
export function emptyGame(size: MemSize, rule: MemRule): MemState {
  return {
    size,
    rule,
    cards: [],
    matched: [],
    flipped: [],
    turn: 'toy',
    scores: { toy: 0, ninja: 0 },
    ply: 0,
  }
}

export const isPairMatch = (s: MemState): boolean =>
  s.flipped.length === 2 && s.cards[s.flipped[0]] === s.cards[s.flipped[1]]

/**
 * Resolve a revealed pair: a match scores and (under "go again") keeps the
 * turn; a miss flips back and passes. A state without two cards up is
 * returned untouched, so callers can apply it unconditionally.
 */
export function resolvePair(s: MemState): MemState {
  if (s.flipped.length !== 2) return s
  const [a, b] = s.flipped
  if (s.cards[a] === s.cards[b]) {
    const matched = s.matched.slice()
    matched[a] = true
    matched[b] = true
    return {
      ...s,
      matched,
      scores: { ...s.scores, [s.turn]: s.scores[s.turn] + 1 },
      flipped: [],
      turn: s.rule === 'again' ? s.turn : otherSeat(s.turn),
    }
  }
  return { ...s, flipped: [], turn: otherSeat(s.turn) }
}

/** Turn one card face up, or null when the flip is illegal (out of range,
 * already matched/up, or two cards are still awaiting resolution — resolve
 * with `resolvePair` first). Every accepted flip advances `ply`. */
export function flipCard(s: MemState, i: number): MemState | null {
  if (!Number.isInteger(i) || i < 0 || i >= s.cards.length) return null
  if (s.flipped.length >= 2) return null
  if (s.matched[i] || s.flipped.includes(i)) return null
  return { ...s, flipped: [...s.flipped, i], ply: s.ply + 1 }
}

/** A state is only accepted — from storage or the other device — when it is
 * exactly the shape the rules speak. Rebuilt field by field, so a peer's
 * extra keys never ride along into persisted data. */
export function coerceMemState(value: unknown): MemState | undefined {
  const v = value as Partial<MemState> | null
  if (!v || typeof v !== 'object') return undefined
  const size = v.size === 6 ? 6 : v.size === 4 ? 4 : undefined
  const rule = v.rule === 'pass' ? 'pass' : v.rule === 'again' ? 'again' : undefined
  const turn = v.turn === 'ninja' ? 'ninja' : v.turn === 'toy' ? 'toy' : undefined
  if (!size || !rule || !turn) return undefined
  const { cards, matched, flipped, scores, ply } = v
  if (!Array.isArray(cards) || !cards.every((c) => typeof c === 'string')) return undefined
  if (cards.length !== size * size && cards.length !== 0) return undefined
  if (
    !Array.isArray(matched) ||
    matched.length !== cards.length ||
    !matched.every((m) => typeof m === 'boolean')
  )
    return undefined
  if (
    !Array.isArray(flipped) ||
    flipped.length > 2 ||
    !flipped.every((f) => Number.isInteger(f) && f >= 0 && f < cards.length)
  )
    return undefined
  if (
    !scores ||
    typeof scores !== 'object' ||
    typeof scores.toy !== 'number' ||
    typeof scores.ninja !== 'number'
  )
    return undefined
  if (!Number.isInteger(ply) || (ply as number) < 0) return undefined
  return {
    size,
    rule,
    cards: cards as string[],
    matched: matched as boolean[],
    flipped: flipped as number[],
    turn,
    scores: { toy: scores.toy, ninja: scores.ninja },
    ply: ply as number,
  }
}
