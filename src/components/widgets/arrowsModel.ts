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
 * measured seat rate, and `pick` is the difficulty dial: how many valid
 * placements the generator collects per seat before committing the most
 * CHAIN-FORMING one (the candidate whose body lands on the most existing
 * arrows' exit rays — see generatePuzzle). Small stays a gentle warm-up;
 * large is deliberately adult-hard: a near-full board where only a couple
 * of arrows are ever free at once. */
export const ARROW_DIMS = {
  small: { cols: 7, rows: 7, count: 9, minLen: 2, maxLen: 5, pick: 1, phase: 0.25, minSeat: 8, packed: false },
  medium: { cols: 9, rows: 9, count: 16, minLen: 2, maxLen: 6, pick: 3, phase: 0.25, minSeat: 14, packed: false },
  // The requested count deliberately over-asks: the biased generator
  // saturates around ~29 arrows here, and asking for more just lets every
  // board reach that saturation. Measured (120 seeds): ~29 seated, ~71%
  // fill, ~10.8 free at the start (63% blocked), choice width ~5.6 vs 7.6
  // unbiased on the same dims. `minSeat` is the suite's floor on the
  // average seat count — the honest expectation, since count is a ceiling.
  large: { cols: 14, rows: 14, count: 52, minLen: 2, maxLen: 7, pick: 12, phase: 0.25, minSeat: 26, packed: false },
  // Expert trades a few arrows for the tightest solve the generator can
  // reach: the chain bias runs from the FIRST seat (`phase: 0`) with a
  // deeper candidate pool and longer snakes — the measured frontier trade
  // from the difficulty round, where large keeps the arrow count and expert
  // takes the width. Measured (120 seeds): ~22 seated, choice width ~4.3,
  // ~39% free at the start.
  expert: { cols: 14, rows: 14, count: 52, minLen: 2, maxLen: 8, pick: 22, phase: 0, minSeat: 20, packed: false },
  // Master is a DIFFERENT generator (`generatePacked` — pack bodies first,
  // orient heads second), so `count`/`pick`/`phase` are unused: the packer
  // fills the board and the arrow count emerges. Measured (120 seeds): ~44
  // arrows at ~84% fill, dependency depth ~8.3 (the deepest tier), only
  // ~25% of arrows free at the start. It also plays under the bump budget
  // (`MASTER_BUMPS`) — mistakes end the puzzle.
  master: { cols: 14, rows: 14, count: 0, minLen: 2, maxLen: 8, pick: 0, phase: 0, minSeat: 38, packed: true },
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
  /**
   * The difficulty dial: how many valid placements to collect per seat
   * before committing the most CHAIN-FORMING one — the candidate whose body
   * covers the most cells that existing arrows' exit rays pass through, so
   * freeing one arrow tends to require freeing another first. 1 = commit
   * the first fit (the gentle presets). The solvability invariant is
   * untouched: it constrains only the new arrow's OWN ray, and every
   * candidate already passed it.
   */
  pick = 1,
  /** Fraction of seats placed before the chain bias activates (see the loop
   * comment). 0 = biased from the first seat — the expert setting. */
  phase = 0.25,
): Puzzle {
  const rand = mulberry32(seed)
  const occ = new Set<number>()
  const arrows: Arrow[] = []
  /** Per seated arrow: its ray cells and its own cell set — ray geometry
   * never changes once seated, so these are computed once. */
  const raySets = new Map<number, number[]>()
  const cellSets = new Map<number, Set<number>>()

  /** Seated arrows whose exit is CURRENTLY clear (own cells never block). */
  const freeSeated = (): number[] =>
    arrows
      .filter((a) => raySets.get(a.id)!.every((k) => !occ.has(k) || cellSets.get(a.id)!.has(k)))
      .map((a) => a.id)

  for (let id = 0; id < count; id++) {
    // The bias phases in LATE. Early arrows are the bottom of the pile (the
    // player frees them last) — packing them dense and unbiased is what
    // keeps the seat rate; it is the late-seated bodies, the ones on top,
    // that decide which arrows start free, so that is where chain-forming
    // placement buys difficulty instead of just fragmenting the board.
    const usePick = arrows.length >= count * phase ? pick : 1
    const free = usePick > 1 ? freeSeated() : []
    const candidates: Cell[][] = []
    for (let attempt = 0; attempt < 2600 && candidates.length < usePick; attempt++) {
      const head = { x: Math.floor(rand() * cols), y: Math.floor(rand() * rows) }
      if (occ.has(key(head))) continue

      // The solvability invariant: the ray must be clear of every arrow
      // already seated (they will still be on the board when this one goes).
      // All four directions are scanned in a seeded order — on a dense board
      // most rays are blocked, and gambling on a single direction per
      // attempt is what capped the old presets' seat rate. Gentle boards
      // (pick 1) take the first clear direction, which favours the short
      // hop to the nearest wall; hard boards take the clear direction with
      // the LONGEST ray, because a head hugging the wall it points at has a
      // zero-length ray nothing can ever cover — a permanently free arrow —
      // while a long interior ray is exactly what later bodies land on.
      const spin = Math.floor(rand() * 4)
      let dir: Dir | null = null
      let behind: Cell | null = null
      let bestRay = -1
      for (let k = 0; k < 4; k++) {
        const cand = DIR_IDS[(spin + k) % 4]
        const step = DIRS[cand]
        const back = { x: head.x - step.x, y: head.y - step.y }
        if (back.x < 0 || back.x >= cols || back.y < 0 || back.y >= rows) continue
        if (occ.has(key(back))) continue
        let rx = head.x + step.x
        let ry = head.y + step.y
        let rayLen = 0
        let clear = true
        while (rx >= 0 && rx < cols && ry >= 0 && ry < rows) {
          if (occ.has(ry * 64 + rx)) {
            clear = false
            break
          }
          rayLen++
          rx += step.x
          ry += step.y
        }
        if (!clear) continue
        // The longest-ray preference applies to EVERY seat of a hard size
        // (pick > 1), early ones included — an early wall-hugger is free
        // forever, whatever lands later. Only the candidate SCORING phases
        // in late (usePick).
        if (dir === null || (pick > 1 && rayLen > bestRay)) {
          dir = cand
          behind = back
          bestRay = rayLen
        }
        if (pick === 1) break
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

      // All candidates for one seat are sampled against the SAME occupancy —
      // nothing commits until one is chosen, so every candidate stays valid.
      candidates.push(cells)
    }
    if (candidates.length === 0) continue

    // Commit the candidate that newly blocks the most DISTINCT currently-free
    // arrows — blocking an already-blocked arrow adds no difficulty, and
    // scoring raw ray coverage turned out to reward sprawling bodies that
    // crowd later seats out. Ties fall to the first (seeded) candidate, so
    // pick=1 boards are byte-identical to a plain first-fit.
    let best = candidates[0]
    let bestScore = -Infinity
    for (const cells of candidates) {
      const body = new Set(cells.map(key))
      let blocks = 0
      for (const fid of free) {
        if (raySets.get(fid)!.some((k) => body.has(k))) blocks++
      }
      // Blocks dominate; at equal blocks prefer the LONGER body — it fills
      // the board the way the original game looks, and a compactness bonus
      // measurably cost more width than it bought seats.
      const score = blocks * 100 + cells.length
      if (score > bestScore) {
        bestScore = score
        best = cells
      }
    }
    for (const c of best) occ.add(key(c))
    const placed: Arrow = { id, cells: best }
    arrows.push(placed)
    raySets.set(id, rayCells(placed, cols, rows).map(key))
    cellSets.set(id, new Set(best.map(key)))
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

// ------------------------------------------------------------ master tier

/** Master's bump budget: this many blocked taps void the puzzle. */
export const MASTER_BUMPS = 3

/**
 * The lookahead metric: the longest "free that one first, and before it
 * that one" dependency chain on the board. An arrow's unlock depth is
 * 1 + the deepest unlock depth among the arrows standing on its exit ray;
 * the board's depth is the maximum. Construction keeps the blocking
 * relation acyclic (a later-inserted arrow's ray avoids earlier bodies, so
 * blocking edges only ever point later → earlier); the memo's pre-seed
 * guards termination anyway on a hostile input.
 */
export function blockDepth(p: Puzzle): number {
  const owner = new Map<number, number>()
  for (const a of p.arrows) for (const c of a.cells) owner.set(key(c), a.id)
  const blockersOf = new Map<number, number[]>()
  for (const a of p.arrows) {
    const bs = new Set<number>()
    for (const c of rayCells(a, p.cols, p.rows)) {
      const o = owner.get(key(c))
      if (o !== undefined && o !== a.id) bs.add(o)
    }
    blockersOf.set(a.id, [...bs])
  }
  const memo = new Map<number, number>()
  const depthOf = (id: number): number => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    memo.set(id, 1)
    const d = 1 + Math.max(0, ...blockersOf.get(id)!.map(depthOf))
    memo.set(id, d)
    return d
  }
  return Math.max(0, ...p.arrows.map((a) => depthOf(a.id)))
}

/**
 * Carve snake bodies directly into empty space — the packing half of the
 * master generator. Walks are self-avoiding, prefer straight with 40°/60
 * bends, and only cross EMPTY cells; passes repeat until one commits
 * nothing, leaving at most scattered singleton holes.
 */
function packBodies(
  rand: () => number,
  cols: number,
  rows: number,
  minLen: number,
  maxLen: number,
): Cell[][] {
  const occ = new Set<number>()
  const bodies: Cell[][] = []
  const cells: Cell[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y })

  for (;;) {
    // Seeded shuffle of the start order per pass.
    const order = cells.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    let placed = 0
    for (const start of order) {
      if (occ.has(key(start))) continue
      const want = minLen + Math.floor(rand() * (maxLen - minLen + 1))
      const body: Cell[] = [start]
      const used = new Set<number>([key(start)])
      let travel: Dir = DIR_IDS[Math.floor(rand() * 4)]
      while (body.length < want) {
        const turn = rand() < 0.4
        const options: Dir[] = turn
          ? [PERP[travel][Math.floor(rand() * 2)], travel, PERP[travel][Math.floor(rand() * 2)]]
          : [travel, PERP[travel][Math.floor(rand() * 2)], PERP[travel][Math.floor(rand() * 2)]]
        let stepped = false
        for (const t of options) {
          const s = DIRS[t]
          const next = { x: body[body.length - 1].x + s.x, y: body[body.length - 1].y + s.y }
          if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) continue
          if (occ.has(key(next)) || used.has(key(next))) continue
          body.push(next)
          used.add(key(next))
          travel = t
          stepped = true
          break
        }
        if (!stepped) break
      }
      if (body.length < minLen) continue
      for (const c of body) occ.add(key(c))
      bodies.push(body)
      placed++
    }
    if (placed === 0) return bodies
  }
}

/**
 * The master generator: pack bodies first, orient heads second.
 *
 * Each packed body admits exactly two orientations — the head at either
 * end, its direction fixed by that end's final segment. Bodies are then
 * inserted one at a time (insertion order = reverse removal order, the same
 * proof as `generatePuzzle`): an orientation is feasible when its exit ray
 * avoids every body already inserted, and among feasible options the
 * DEEPEST one wins — `1 + max(chain of the earlier arrows whose rays this
 * body covers)` — which is what turns near-full boards into long forced
 * dependency chains instead of wide shallow blocking. A body with no
 * feasible orientation at its turn is dropped (its cells become holes);
 * measured, that costs only a few percent of fill.
 */
export function generatePacked(
  seed: number,
  cols: number,
  rows: number,
  minLen: number,
  maxLen: number,
): Puzzle {
  const rand = mulberry32(seed)
  const bodies = packBodies(rand, cols, rows, minLen, maxLen)

  // The orientation pass is greedy under seeded tie-break jitter, so
  // different jitter finds different drop sets: run it a few times on the
  // SAME packed bodies and keep the fullest board (depth breaks ties).
  // Everything stays deterministic — one rand stream, consumed in order.
  let best: Puzzle | null = null
  let bestScore = -1
  for (let restart = 0; restart < 6; restart++) {
    const attempt = orientBodies(bodies, cols, rows, rand, minLen)
    const fill = attempt.arrows.reduce((s, a) => s + a.cells.length, 0)
    // Fill leads, but a depth point is worth trading ~2.5 cells for — the
    // tier's promise is packed AND deep, not packed alone.
    const score = fill * 10 + blockDepth(attempt) * 25
    if (score > bestScore) {
      bestScore = score
      best = attempt
    }
  }
  return best!
}

/** One greedy orientation pass over packed bodies — see `generatePacked`. */
function orientBodies(
  packed: Cell[][],
  cols: number,
  rows: number,
  rand: () => number,
  minLen: number,
): Puzzle {
  // Local pool: wedged bodies get SPLIT into halves (below), and that must
  // not leak into the shared packing across restarts.
  const bodies = packed.slice()
  const arrows: Arrow[] = []
  const insertedCells = new Set<number>()
  const raySetOf = new Map<number, Set<number>>()
  const chainOf = new Map<number, number>()
  const remaining = new Set<number>(bodies.map((_, i) => i))

  const rayOf = (cells: Cell[]): Cell[] => rayCells({ id: -1, cells }, cols, rows)

  // Which cells belong to which not-yet-inserted body — for the danger score.
  const cellBody = new Map<number, number>()
  bodies.forEach((b, bi) => {
    for (const c of b) cellBody.set(key(c), bi)
  })

  /** A body wedged both ways is not yet a hole: cut it in two — the halves
   * have brand-new end segments, so brand-new rays that usually fit. Halves
   * that wedge again split again, down to `minLen` stubs. */
  const split = (bi: number): boolean => {
    const b = bodies[bi]
    if (b.length < 2 * minLen) return false
    const cut = Math.floor(b.length / 2)
    remaining.delete(bi)
    for (const half of [b.slice(0, cut), b.slice(cut)]) {
      const ni = bodies.length
      bodies.push(half)
      remaining.add(ni)
      for (const c of half) cellBody.set(key(c), ni)
    }
    return true
  }

  outer: while (remaining.size > 0) {
    // Two separate decisions, because they answer different questions.
    // WHICH body to insert is about survival: a body dies when every
    // orientation's ray is blocked by inserted cells, so the most
    // wedge-endangered body goes first (one live orientation with enemies
    // standing on it beats two live ones; among equals, more enemies is
    // more urgent). WHICH WAY it points is free — its cells (the only thing
    // that constrains anyone else) are the same either way — so the
    // orientation is spent entirely on DEPTH: cover the deepest existing
    // chain.
    interface Opt {
      cells: Cell[]
      ray: Cell[]
      danger: number
      chain: number
    }
    let bestBody: { bi: number; opts: Opt[]; urgency: number } | null = null
    for (const bi of remaining) {
      const opts: Opt[] = []
      for (const flip of [false, true]) {
        const oriented = flip ? bodies[bi].slice().reverse() : bodies[bi]
        const ray = rayOf(oriented)
        // Feasible only when the ray clears every body already inserted —
        // exactly the invariant that makes reverse insertion a valid solve.
        if (ray.some((c) => insertedCells.has(key(c)))) continue
        const danger = new Set(
          ray.map((c) => cellBody.get(key(c))).filter((o) => o !== undefined && o !== bi),
        ).size
        let chain = 1
        for (const a of arrows) {
          const rs = raySetOf.get(a.id)!
          if (oriented.some((c) => rs.has(key(c)))) {
            chain = Math.max(chain, 1 + chainOf.get(a.id)!)
          }
        }
        opts.push({ cells: oriented, ray, danger, chain })
      }
      if (opts.length === 0) {
        // Wedged both ways: split and rescan, or (too short to split) a hole.
        if (split(bi)) continue outer
        continue
      }
      const urgency =
        (opts.length === 1 ? 1000 + opts[0].danger : Math.min(opts[0].danger, opts[1].danger)) +
        rand() * 0.5
      if (bestBody === null || urgency > bestBody.urgency) bestBody = { bi, opts, urgency }
    }
    if (bestBody === null) break // everything left is wedged — holes

    let pickOpt = bestBody.opts[0]
    for (const o of bestBody.opts) {
      if (o.chain > pickOpt.chain) pickOpt = o
    }
    remaining.delete(bestBody.bi)
    for (const c of bodies[bestBody.bi]) cellBody.delete(key(c))
    const id = arrows.length
    arrows.push({ id, cells: pickOpt.cells })
    for (const c of pickOpt.cells) insertedCells.add(key(c))
    raySetOf.set(id, new Set(pickOpt.ray.map(key)))
    chainOf.set(id, pickOpt.chain)
  }
  return { cols, rows, arrows }
}
