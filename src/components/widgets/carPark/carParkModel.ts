/**
 * Car Park — the pure model of the classic 6×6 sliding-car ("Rush Hour")
 * puzzle. No React: the widget, the level generator script and the e2e
 * sweep all run the same code.
 *
 * A level is a 36-char row-major board string — the standard compact
 * encoding: `o` empty, `x` a wall, `A` the red target car (always
 * horizontal, on the exit row), `B`…`Z` the other vehicles (2 cells = car,
 * 3 = truck). Orientation is read off the cells. A vehicle only ever slides
 * along its own axis, so a position is just one offset per vehicle.
 *
 * Move metric: ONE move is one vehicle slid ANY distance (the standard
 * Rush Hour count). Solved = the target car's nose at the right edge (the
 * exit); the drive-out off the lot is animation, not a move.
 */

export const LOT = 6
/** The exit row — the target car's lane; the exit is its right edge. */
export const EXIT_ROW = 2
export const TARGET = 'A'

export interface Vehicle {
  /** Board letter. Index 0 is always the target `A`. */
  id: string
  len: number
  horiz: boolean
  /** The fixed lane: the row a horizontal vehicle rides, the column a
   * vertical one does. */
  lane: number
}

export interface Lot {
  vehicles: Vehicle[]
  /** Wall cells (row-major indices). */
  walls: number[]
  /** Starting offsets, one per vehicle (col if horizontal, row if not). */
  start: number[]
}

/** `[vehicle index, signed delta]` — one slide. */
export type Move = readonly [number, number]

const cellIndex = (row: number, col: number) => row * LOT + col

/** Row-major cells a vehicle covers at `off`. */
export function cellsOf(v: Vehicle, off: number): number[] {
  const out: number[] = []
  for (let k = 0; k < v.len; k++) {
    out.push(v.horiz ? cellIndex(v.lane, off + k) : cellIndex(off + k, v.lane))
  }
  return out
}

/** Parse a board string. Throws on anything malformed — levels are data we
 * author, so a bad one should fail loudly (the e2e sweep parses them all). */
export function parseBoard(board: string): Lot {
  if (board.length !== LOT * LOT) throw new Error(`board must be ${LOT * LOT} chars`)
  const seen = new Map<string, number[]>()
  const walls: number[] = []
  for (let i = 0; i < board.length; i++) {
    const ch = board[i]
    if (ch === 'o' || ch === '.') continue
    if (ch === 'x') {
      walls.push(i)
      continue
    }
    if (!/^[A-Z]$/.test(ch)) throw new Error(`bad cell '${ch}' at ${i}`)
    const list = seen.get(ch) ?? []
    list.push(i)
    seen.set(ch, list)
  }
  if (!seen.has(TARGET)) throw new Error('no target car A')
  const ids = [...seen.keys()].sort((a, b) => (a === TARGET ? -1 : b === TARGET ? 1 : a < b ? -1 : 1))
  const vehicles: Vehicle[] = []
  const start: number[] = []
  for (const id of ids) {
    const cells = seen.get(id)!
    const len = cells.length
    if (len < 2 || len > 3) throw new Error(`vehicle ${id} has length ${len}`)
    const r0 = Math.floor(cells[0] / LOT)
    const c0 = cells[0] % LOT
    const horiz = cells.every((c) => Math.floor(c / LOT) === r0)
    const v: Vehicle = { id, len, horiz, lane: horiz ? r0 : c0 }
    const off = horiz ? c0 : r0
    if (cellsOf(v, off).join() !== cells.join()) throw new Error(`vehicle ${id} is not a straight run`)
    vehicles.push(v)
    start.push(off)
  }
  const target = vehicles[0]
  if (!target.horiz || target.lane !== EXIT_ROW || target.len !== 2) {
    throw new Error('target car A must be a horizontal car on the exit row')
  }
  return { vehicles, walls, start }
}

/** Board string for a position — the inverse of `parseBoard`. */
export function serialize(lot: Lot, pos: readonly number[]): string {
  const out: string[] = Array(LOT * LOT).fill('o')
  for (const w of lot.walls) out[w] = 'x'
  lot.vehicles.forEach((v, i) => {
    for (const c of cellsOf(v, pos[i])) out[c] = v.id
  })
  return out.join('')
}

/** Cell → occupant: vehicle index, -1 empty, -2 wall. */
export function occupancy(lot: Lot, pos: readonly number[]): Int8Array {
  const grid = new Int8Array(LOT * LOT).fill(-1)
  for (const w of lot.walls) grid[w] = -2
  lot.vehicles.forEach((v, i) => {
    for (const c of cellsOf(v, pos[i])) grid[c] = i
  })
  return grid
}

/** How far vehicle `i` can slide: `min` ≤ 0 ≤ `max`, in cells. */
export function moveRange(
  lot: Lot,
  pos: readonly number[],
  i: number,
  grid: Int8Array = occupancy(lot, pos),
): { min: number; max: number } {
  const v = lot.vehicles[i]
  const at = (off: number) => (v.horiz ? cellIndex(v.lane, off) : cellIndex(off, v.lane))
  let min = 0
  while (pos[i] + min - 1 >= 0 && grid[at(pos[i] + min - 1)] === -1) min--
  let max = 0
  while (pos[i] + v.len + max < LOT && grid[at(pos[i] + v.len + max)] === -1) max++
  return { min, max }
}

export function applyMove(pos: readonly number[], [i, delta]: Move): number[] {
  const next = pos.slice()
  next[i] += delta
  return next
}

export function isLegal(lot: Lot, pos: readonly number[], [i, delta]: Move): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= lot.vehicles.length) return false
  if (!Number.isInteger(delta) || delta === 0) return false
  const { min, max } = moveRange(lot, pos, i)
  return delta >= min && delta <= max
}

export function isSolved(lot: Lot, pos: readonly number[]): boolean {
  return pos[0] + lot.vehicles[0].len === LOT
}

/** Replay a move log from the start, stopping at the first illegal move (a
 * corrupt or stale persisted log degrades to its valid prefix). */
export function replay(lot: Lot, moves: readonly Move[]): { pos: number[]; applied: number } {
  let pos = lot.start.slice()
  let applied = 0
  for (const m of moves) {
    if (isSolved(lot, pos) || !isLegal(lot, pos, m)) break
    pos = applyMove(pos, m)
    applied++
  }
  return { pos, applied }
}

/** Every legal single move from `pos`. */
export function legalMoves(lot: Lot, pos: readonly number[]): Move[] {
  const grid = occupancy(lot, pos)
  const out: Move[] = []
  for (let i = 0; i < lot.vehicles.length; i++) {
    const { min, max } = moveRange(lot, pos, i, grid)
    for (let d = min; d <= max; d++) if (d !== 0) out.push([i, d])
  }
  return out
}

const keyOf = (pos: readonly number[]) => String.fromCharCode(...pos.map((p) => 48 + p))

/** Optimal (fewest-moves) solution by BFS, or null if unsolvable. */
export function solve(lot: Lot, from: readonly number[] = lot.start): Move[] | null {
  if (isSolved(lot, from)) return []
  const parent = new Map<string, { prev: string; move: Move } | null>()
  const startKey = keyOf(from)
  parent.set(startKey, null)
  let frontier: number[][] = [from.slice()]
  while (frontier.length > 0) {
    const next: number[][] = []
    for (const pos of frontier) {
      const k = keyOf(pos)
      for (const m of legalMoves(lot, pos)) {
        const np = applyMove(pos, m)
        const nk = keyOf(np)
        if (parent.has(nk)) continue
        parent.set(nk, { prev: k, move: m })
        if (isSolved(lot, np)) {
          const path: Move[] = []
          let cur: string = nk
          for (let e = parent.get(cur); e; e = parent.get(cur)) {
            path.push(e.move)
            cur = e.prev
          }
          return path.reverse()
        }
        next.push(np)
      }
    }
    frontier = next
  }
  return null
}

/** One optimal next move from `pos` (a hint), or null when solved/stuck. */
export function hint(lot: Lot, pos: readonly number[]): Move | null {
  return solve(lot, pos)?.[0] ?? null
}
