/**
 * Othello (Reversi) rules + AI, pure and DOM-free so the e2e suites can
 * bundle it and reason about real positions node-side.
 *
 * The one structural difference from Connect 4 / Tic-Tac-Toe: **turn is not
 * parity**. A player with no legal move is skipped, and once that has
 * happened the mover can no longer be derived from the disc count — so a
 * position carries its own `turn`, and `applyMove` computes the next mover
 * (including the forced pass) deterministically. Both devices in two-device
 * play run this same function, which is what lets a pass never need to cross
 * the wire.
 */

export type Mark = 'toy' | 'ninja'
export type Cell = Mark | null

/** Board side; the board is SIZE × SIZE cells, row-major. */
export const SIZE = 8
export const CELLS = SIZE * SIZE

export interface Position {
  cells: Cell[]
  /** Whose move it is. Stored, not derived — passes break parity. */
  turn: Mark
}

export const otherMark = (m: Mark): Mark => (m === 'toy' ? 'ninja' : 'toy')

/**
 * The standard four-disc start, oriented so `first` owns the discs the
 * opening player owns in the real game. The layout is symmetric under a
 * colour swap, so "first gets e4+d5" is the whole convention.
 */
export function initialPosition(first: Mark): Position {
  const cells: Cell[] = Array(CELLS).fill(null)
  const second = otherMark(first)
  cells[3 * SIZE + 3] = second // d4
  cells[3 * SIZE + 4] = first // e4
  cells[4 * SIZE + 3] = first // d5
  cells[4 * SIZE + 4] = second // e5
  return { cells, turn: first }
}

/** The 8 compass directions as row/col steps — index math alone would wrap
 * around the board edge, so every ray walks coordinates. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

/**
 * Every disc `mark` would flip by playing `idx` — empty if the move is
 * illegal (occupied, or it flips nothing; both are the same "no" in Othello).
 */
export function flipsFor(cells: Cell[], idx: number, mark: Mark): number[] {
  if (cells[idx] !== null) return []
  const r0 = Math.floor(idx / SIZE)
  const c0 = idx % SIZE
  const opp = otherMark(mark)
  const flips: number[] = []
  for (const [dr, dc] of DIRS) {
    const run: number[] = []
    let r = r0 + dr
    let c = c0 + dc
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === opp) {
      run.push(r * SIZE + c)
      r += dr
      c += dc
    }
    // A run only flips when it is bracketed by our own disc.
    if (run.length > 0 && r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === mark) {
      flips.push(...run)
    }
  }
  return flips
}

/** All legal cells for `mark` on these cells. */
export function legalFor(cells: Cell[], mark: Mark): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === null && flipsFor(cells, i, mark).length > 0) out.push(i)
  }
  return out
}

/** Legal cells for the player to move. */
export const legalMoves = (pos: Position): number[] => legalFor(pos.cells, pos.turn)

/**
 * Play `idx` for the position's mover. Returns the new position (with the
 * pass-aware next turn) plus the flipped indices for the animation, or null
 * if the move is illegal. If the opponent has no reply the turn stays with
 * the mover; if neither side can move the game is over (`isOver`).
 */
export function applyMove(
  pos: Position,
  idx: number,
): { pos: Position; flipped: number[] } | null {
  const mover = pos.turn
  const flipped = flipsFor(pos.cells, idx, mover)
  if (flipped.length === 0) return null
  const cells = pos.cells.slice()
  cells[idx] = mover
  for (const i of flipped) cells[i] = mover
  const opp = otherMark(mover)
  const turn = legalFor(cells, opp).length > 0 ? opp : mover
  return { pos: { cells, turn }, flipped }
}

export function counts(cells: Cell[]): { toy: number; ninja: number } {
  let toy = 0
  let ninja = 0
  for (const c of cells) {
    if (c === 'toy') toy++
    else if (c === 'ninja') ninja++
  }
  return { toy, ninja }
}

/** Over when neither side has a legal move (usually, but not only, a full
 * board — a wipe-out ends early). */
export function isOver(pos: Position): boolean {
  return legalFor(pos.cells, 'toy').length === 0 && legalFor(pos.cells, 'ninja').length === 0
}

/** The result once `isOver`: most discs wins. Null while the game is live. */
export function winnerOf(pos: Position): Mark | 'draw' | null {
  if (!isOver(pos)) return null
  const { toy, ninja } = counts(pos.cells)
  return toy === ninja ? 'draw' : toy > ninja ? 'toy' : 'ninja'
}

// ------------------------------------------------------------------- the AI

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Search depth per difficulty (easy uses the "sane player" heuristic).
 * Hard is 5, not Connect 4's 6: Othello branches ~2× wider and its evaluate
 * walks legal-move scans, so 6 peaked at ~2.5s a move in node — an eternity
 * on a tablet. 5 stays comfortably interactive and still crushes easy. */
export const DEPTH: Record<Difficulty, number> = { easy: 0, medium: 3, hard: 5 }

/**
 * Classic positional weights: corners are gold, the X/C squares beside an
 * empty corner are poison (they hand the corner over), edges are good.
 */
const W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]

const CORNERS = [0, SIZE - 1, CELLS - SIZE, CELLS - 1]

/**
 * Heuristic score; ninja maximises. Position weights + mobility while the
 * board is open; raw disc difference takes over near the end, where material
 * is what actually decides the game.
 */
export function evaluate(pos: Position): number {
  const { cells } = pos
  let score = 0
  let empty = 0
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === 'ninja') score += W[i]
    else if (cells[i] === 'toy') score -= W[i]
    else empty++
  }
  const { toy, ninja } = counts(cells)
  if (empty <= 10) return score + 12 * (ninja - toy)
  score += 6 * (legalFor(cells, 'ninja').length - legalFor(cells, 'toy').length)
  return score
}

/** Weight-ordered moves make alpha-beta prune far more. */
function orderedMoves(pos: Position): number[] {
  return legalMoves(pos).sort((a, b) => W[b] - W[a])
}

/** Alpha-beta from ninja's perspective. A forced pass recurses on the same
 * depth with the turn flipped — it adds no disc, and the child is guaranteed
 * to have moves (both-empty is terminal), so it cannot loop. */
function search(pos: Position, depth: number, alpha: number, beta: number): number {
  const moves = orderedMoves(pos)
  if (moves.length === 0) {
    if (legalFor(pos.cells, otherMark(pos.turn)).length === 0) {
      const { toy, ninja } = counts(pos.cells)
      const margin = ninja - toy
      return margin > 0 ? 100000 + margin : margin < 0 ? -100000 + margin : 0
    }
    return search({ cells: pos.cells, turn: otherMark(pos.turn) }, depth, alpha, beta)
  }
  if (depth === 0) return evaluate(pos)

  if (pos.turn === 'ninja') {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(pos, m)!.pos, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const m of moves) {
    best = Math.min(best, search(applyMove(pos, m)!.pos, depth - 1, alpha, beta))
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

/** Best cell for the mover via depth-limited alpha-beta (mover maximises its
 * own side — the widget only calls this with ninja to move, but the search is
 * honest for either). */
function searchMove(pos: Position, depth: number): number {
  const sign = pos.turn === 'ninja' ? 1 : -1
  let best = -Infinity
  let move = -1
  for (const m of orderedMoves(pos)) {
    const score = sign * search(applyMove(pos, m)!.pos, depth - 1, -Infinity, Infinity)
    if (score > best) {
      best = score
      move = m
    }
  }
  return move
}

/**
 * Easy is the "sane player" (lessons.md): never misses a corner, avoids
 * handing one over when it has any other choice, and otherwise plays at
 * random — beatable, but not insulting.
 */
export function easyMove(pos: Position, rand: () => number = Math.random): number {
  const moves = legalMoves(pos)
  if (moves.length === 0) return -1
  const corner = moves.find((m) => CORNERS.includes(m))
  if (corner !== undefined) return corner
  // A move is "poison" if it lets the opponent take a corner next turn.
  const safe = moves.filter((m) => {
    const next = applyMove(pos, m)!.pos
    return !legalFor(next.cells, otherMark(pos.turn)).some((r) => CORNERS.includes(r))
  })
  const pool = safe.length > 0 ? safe : moves
  return pool[Math.floor(rand() * pool.length)]
}

/** The cell the computer plays for the given difficulty, or -1 (no move —
 * the caller passes by leaving the turn where `applyMove` put it). */
export function aiMove(pos: Position, difficulty: Difficulty): number {
  if (legalMoves(pos).length === 0) return -1
  return difficulty === 'easy' ? easyMove(pos) : searchMove(pos, DEPTH[difficulty])
}
