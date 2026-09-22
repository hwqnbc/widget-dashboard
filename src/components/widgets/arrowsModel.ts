/**
 * Arrow Escape rules + puzzle generator, pure and DOM-free so the e2e suite
 * can bundle it and reason about real puzzles node-side.
 *
 * The game (the classic "tap the arrows out" untangle): the board holds
 * snake-shaped arrows — polylines of cells with an arrowhead at one end.
 * Tapping one slides the whole snake forward along its own rails: the head
 * travels in a straight line in the direction it points, the body follows
 * the bends, and the snake leaves the board. The move is legal only when the
 * head's **exit ray** (the straight line of cells from the head to the board
 * edge) is clear of every OTHER arrow's body; a blocked arrow bumps into the
 * blocker and returns. Clearing the board means finding an order.
 *
 * **Solvability by construction.** Arrows are inserted one at a time, and an
 * insertion is only accepted when the new arrow's exit ray is clear of every
 * arrow already on the board. Removing arrows in *reverse insertion order*
 * is then always legal: when an arrow's turn comes, everything inserted
 * after it (the only bodies its ray was never checked against) is already
 * gone. Arrows inserted *later* can — and routinely do — sit on earlier
 * arrows' rays, which is exactly where the puzzle's ordering depth comes
 * from. `solveOrder` re-derives a full clearing greedily, so the invariant
 * is asserted rather than trusted.
 *
 * An arrow's own body never blocks its ray: the body moves WITH the head
 * (rails), so a bent snake whose tail loops ahead of its own head still
 * exits freely.
 */

export type Dir = 'n' | 'e' | 's' | 'w'
export interface Cell {
  x: number
  y: number
}
/** Cells ordered tail → head; the head is the last entry. */
export interface Arrow {
  id: number
  cells: Cell[]
}
export interface Puzzle {
  cols: number
  rows: number
  arrows: Arrow[]
}

export const DIRS: Record<Dir, Cell> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
}
const DIR_IDS: Dir[] = ['n', 'e', 's', 'w']
const PERP: Record<Dir, [Dir, Dir]> = {
  n: ['e', 'w'],
  s: ['e', 'w'],
  e: ['n', 's'],
  w: ['n', 's'],
}

/** Board sizes. Density (arrows × mean length vs cells) is tuned against the
 * measured seat rate: small stays a gentle warm-up, medium fills near half
 * the board, and large is the ad-dense tangle — long snakes over most of the
 * grid, where the clearing order is the whole game. */
export const ARROW_DIMS = {
  small: { cols: 7, rows: 7, count: 9, minLen: 2, maxLen: 5 },
  medium: { cols: 9, rows: 9, count: 16, minLen: 2, maxLen: 6 },
  large: { cols: 12, rows: 12, count: 26, minLen: 2, maxLen: 8 },
} as const
export type ArrowsSize = keyof typeof ARROW_DIMS

export const DEFAULT_ARROWS_SEED = 20260922

/** The direction the arrowhead points: the last body segment's travel. */
export function headDir(a: Arrow): Dir {
  const head = a.cells[a.cells.length - 1]
  const prev = a.cells[a.cells.length - 2]
  if (head.x > prev.x) return 'e'
  if (head.x < prev.x) return 'w'
  if (head.y > prev.y) return 's'
  return 'n'
}

/** The exit ray: cells strictly ahead of the head, out to the board edge. */
export function rayCells(a: Arrow, cols: number, rows: number): Cell[] {
  const d = DIRS[headDir(a)]
  const out: Cell[] = []
  let { x, y } = a.cells[a.cells.length - 1]
  for (;;) {
    x += d.x
    y += d.y
    if (x < 0 || x >= cols || y < 0 || y >= rows) return out
    out.push({ x, y })
  }
}

const key = (c: Cell) => c.y * 64 + c.x

/**
 * The nearest OTHER arrow standing on `a`'s exit ray, or null when the way
 * out is clear. Own cells never block — the body rides the same rails.
 * Returns the blocker and how many free cells lie before it (0 = adjacent),
 * which is what the bump animation advances by.
 */
export function blockerOf(
  a: Arrow,
  alive: Arrow[],
  cols: number,
  rows: number,
): { id: number; free: number } | null {
  const occupied = new Map<number, number>()
  for (const other of alive) {
    if (other.id === a.id) continue
    for (const c of other.cells) occupied.set(key(c), other.id)
  }
  const ray = rayCells(a, cols, rows)
  for (let i = 0; i < ray.length; i++) {
    const hit = occupied.get(key(ray[i]))
    if (hit !== undefined) return { id: hit, free: i }
  }
  return null
}

/**
 * The rails the snake rides out on: body (tail → head), then the exit ray,
 * then enough off-board cells that the tail fully leaves before the
 * animation ends. Off-board coordinates are intentional — the board clips.
 */
export function trackOf(a: Arrow, cols: number, rows: number): Cell[] {
  const d = DIRS[headDir(a)]
  const ray = rayCells(a, cols, rows)
  const track = [...a.cells, ...ray]
  let { x, y } = track[track.length - 1]
  for (let i = 0; i < a.cells.length + 1; i++) {
    x += d.x
    y += d.y
    track.push({ x, y })
  }
  return track
}

/** Same seeded PRNG the other generators use (module-private copy). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate a solvable puzzle. Arrows are seated by rejection sampling: pick
 * a head cell + direction whose exit ray is clear of everything already
 * seated, then grow the body backward from the head as a self-avoiding walk
 * with occasional 90° bends. A board too crowded to seat the full count
 * ships with what fitted — still solvable, just lighter.
 */
export function generatePuzzle(
  seed: number,
  cols: number,
  rows: number,
  count: number,
  minLen: number,
  maxLen: number,
): Puzzle {
  const rand = mulberry32(seed)
  const occ = new Set<number>()
  const arrows: Arrow[] = []

  for (let id = 0; id < count; id++) {
    for (let attempt = 0; attempt < 900; attempt++) {
      const head = { x: Math.floor(rand() * cols), y: Math.floor(rand() * rows) }
      if (occ.has(key(head))) continue

      // The solvability invariant: the ray must be clear of every arrow
      // already seated (they will still be on the board when this one goes).
      // All four directions are scanned in a seeded order and the first
      // workable one wins — on a dense board most rays are blocked, and
      // gambling on a single direction per attempt is what capped the old
      // presets' seat rate. (Short rays toward the nearest wall pass most
      // often, which is also how the original game's boards read.)
      const spin = Math.floor(rand() * 4)
      let dir: Dir | null = null
      let behind: Cell | null = null
      for (let k = 0; k < 4 && dir === null; k++) {
        const cand = DIR_IDS[(spin + k) % 4]
        const step = DIRS[cand]
        const back = { x: head.x - step.x, y: head.y - step.y }
        if (back.x < 0 || back.x >= cols || back.y < 0 || back.y >= rows) continue
        if (occ.has(key(back))) continue
        let rx = head.x + step.x
        let ry = head.y + step.y
        let clear = true
        while (rx >= 0 && rx < cols && ry >= 0 && ry < rows) {
          if (occ.has(ry * 64 + rx)) {
            clear = false
            break
          }
          rx += step.x
          ry += step.y
        }
        if (clear) {
          dir = cand
          behind = back
        }
      }
      if (dir === null || behind === null) continue
      // Consts for the walk closure — narrowing on `let` doesn't cross it.
      const aim = dir
      const seat = behind

      // Grow the body backward from the head, bending sometimes. The walk is
      // self-avoiding and stays off other arrows; it MAY wander onto the
      // head's own ray (own cells never block). The FIRST step is forced
      // straight: the arrowhead points along the last actual segment, and
      // the ray above was checked along `dir` — a turn here would aim the
      // head somewhere the ray was never verified (the bug the suite's
      // 200-seed solvability sweep exists to catch).
      const want = minLen + Math.floor(rand() * (maxLen - minLen + 1))

      const walk = (): Cell[] => {
        const cells: Cell[] = [seat, head]
        const used = new Set<number>([key(head), key(seat)])
        let travel: Dir = aim // the forward travel of the segment ending at cells[0]
        while (cells.length < want) {
          const turn = rand() < 0.4
          const options: Dir[] = turn
            ? [PERP[travel][Math.floor(rand() * 2)], travel]
            : [travel, PERP[travel][Math.floor(rand() * 2)]]
          let stepped = false
          for (const t of options) {
            const s = DIRS[t]
            const next = { x: cells[0].x - s.x, y: cells[0].y - s.y }
            if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) continue
            if (occ.has(key(next)) || used.has(key(next))) continue
            cells.unshift(next)
            used.add(key(next))
            travel = t
            stepped = true
            break
          }
          if (!stepped) break
        }
        return cells
      }
      // On a crowded board a single walk often jams short of `want` — take
      // the longest of a few tries, which is what lets the dense presets
      // keep their long snakes instead of degrading into stubs.
      let cells = walk()
      for (let retry = 0; retry < 2 && cells.length < want; retry++) {
        const again = walk()
        if (again.length > cells.length) cells = again
      }
      if (cells.length < minLen) continue

      for (const c of cells) occ.add(key(c))
      arrows.push({ id, cells })
      break
    }
  }
  return { cols, rows, arrows }
}

/**
 * A full clearing order, found greedily (repeatedly remove any unblocked
 * arrow). Returns null if the board wedges — which generation makes
 * impossible, and the suite asserts it stays that way.
 */
export function solveOrder(p: Puzzle): number[] | null {
  const alive = [...p.arrows]
  const order: number[] = []
  while (alive.length > 0) {
    const i = alive.findIndex((a) => blockerOf(a, alive, p.cols, p.rows) === null)
    if (i < 0) return null
    order.push(alive[i].id)
    alive.splice(i, 1)
  }
  return order
}
