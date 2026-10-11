/**
 * Puppy Rescue — the level prover. A breadth-first search over
 * (cell, puppies freed, time) that finds the quickest 3-star run: every
 * puppy, out of the door, never inside a cone. Catchers are pure functions
 * of time, so the search knows exactly where every cone is at every step.
 *
 * The dog moves cell-centre to cell-centre (or waits) in steps of exactly
 * one cell-time, which is what makes the result replayable frame-for-frame
 * through the real `step` (see `routeInput`). Every check runs against an
 * INFLATED catcher (longer, wider cone; bigger bodies; earlier cage pick-up),
 * so a route the planner calls safe stays safe in the continuous sim.
 *
 * Not imported by the widget — the e2e suite runs it for every level (and it
 * is the seam a future "show me how" hint would use).
 */
import {
  BUMP_R,
  CAGE_R,
  CELL_FRAMES,
  CONE_HALF,
  CONE_RANGE,
  FOLLOW_GAP,
  STEP,
  canStep,
  guardPose,
  pointBack,
  seenAt,
  type Level,
  type Pose,
  type RouteStep,
} from './rescueModel'

/** One move or wait (s). */
export const TAU = CELL_FRAMES * STEP
/** Safety margins over the real game. */
const M_RANGE = 0.3
const M_HALF = (4 * Math.PI) / 180
const M_BODY = 0.2
const M_BUMP = 0.35
const M_CAGE = 0.15
/** Samples per move (the dog covers 1/SAMPLES of a cell between checks). */
const SAMPLES = 10

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, 0],
]

interface Node {
  cell: number
  mask: number
  parent: Node | null
  /** Index into DIRS (4 = wait). */
  act: number
}

export interface Plan {
  route: RouteStep[]
  /** Seconds to escape. */
  time: number
  /** Search states visited (for reporting). */
  states: number
}

const popcount = (m: number) => {
  let c = 0
  while (m) {
    c += m & 1
    m >>= 1
  }
  return c
}

/** Seen by any catcher (inflated), as the planner judges it. */
function exposed(level: Level, poses: Pose[], x: number, y: number): boolean {
  const R = CONE_RANGE + M_RANGE
  const H = CONE_HALF + M_HALF
  for (const p of poses) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d - M_BODY > R) continue
    if (
      seenAt(level, p, x, y, R, H) >= 0 ||
      seenAt(level, p, x + M_BODY, y, R, H) >= 0 ||
      seenAt(level, p, x - M_BODY, y, R, H) >= 0 ||
      seenAt(level, p, x, y + M_BODY, R, H) >= 0 ||
      seenAt(level, p, x, y - M_BODY, R, H) >= 0
    )
      return true
  }
  return false
}

export function planLevel(level: Level, maxTime = 90): Plan | null {
  const { cols, cages, guards } = level
  const full = (1 << cages.length) - 1
  const cageAt = new Map<number, number>()
  cages.forEach((c, i) => cageAt.set(Math.floor(c.y) * cols + Math.floor(c.x), i))
  const exitCell = level.exitCol
  const startCell = Math.floor(level.start.y) * cols + Math.floor(level.start.x)
  const cx = (cell: number) => (cell % cols) + 0.5
  const cy = (cell: number) => Math.floor(cell / cols) + 0.5

  // Per-layer catcher poses at each sample time.
  const poseBuf: Pose[][] = Array.from({ length: SAMPLES + 1 }, () =>
    guards.map(() => ({ x: 0, y: 0, h: 0, v: 0 })),
  )
  const trail: number[] = []
  const pb = { x: 0, y: 0, h: 0 }

  /** History of cell centres behind `n` (moves only), oldest first, long
   * enough for `need` cells of puppy line. */
  const history = (n: Node, need: number) => {
    trail.length = 0
    let len = 0
    let lastCell = -1
    for (let p: Node | null = n; p; p = p.parent) {
      if (p.cell === lastCell) continue
      if (lastCell >= 0) len += Math.hypot(cx(p.cell) - cx(lastCell), cy(p.cell) - cy(lastCell))
      trail.push(cy(p.cell), cx(p.cell)) // reversed below
      lastCell = p.cell
      if (len > need + 1) break
    }
    trail.reverse()
  }

  // All catchers static: nothing depends on the clock, so a state reached
  // once never needs revisiting (the search becomes a plain BFS).
  const timeless = guards.every((g) => g.legs.length === 1)
  const visited = new Set<number>()
  let layer = new Map<number, Node>()
  layer.set(startCell * (full + 1), { cell: startCell, mask: 0, parent: null, act: 4 })
  let states = 1
  const maxK = Math.ceil(maxTime / TAU)
  for (let k = 0; k < maxK; k++) {
    const t0 = k * TAU
    for (let i = 0; i <= SAMPLES; i++)
      guards.forEach((g, gi) => guardPose(g, t0 + (i / SAMPLES) * TAU, poseBuf[i][gi]))
    const next = new Map<number, Node>()
    for (const node of layer.values()) {
      const x0 = node.cell % cols
      const y0 = Math.floor(node.cell / cols)
      for (let a = 0; a < 5; a++) {
        const [dx, dy] = DIRS[a]
        // The clock starts on the first move — the dog can't open by waiting.
        // (Nor is waiting ever useful when nothing moves.)
        if (a === 4 && (k === 0 || timeless)) continue
        if (a < 4 && !canStep(level, x0, y0, dx, dy)) continue
        const cell = (y0 + dy) * cols + (x0 + dx)
        let mask = node.mask
        const ci = cageAt.get(cell)
        // Walking through the exit cell with a partial line would end the
        // run early in the real game (the door is open) — not a 3-star.
        if (cell === exitCell && mask !== 0 && mask !== full) continue
        const need = popcount(mask | (ci !== undefined ? 1 << ci : 0)) * FOLLOW_GAP
        if (need > 0) history(node, need)
        let ok = true
        for (let i = 1; i <= SAMPLES && ok; i++) {
          const f = i / SAMPLES
          const x = cx(node.cell) + dx * f
          const y = cy(node.cell) + dy * f
          if (ci !== undefined && Math.hypot(x - cx(cell), y - cy(cell)) < CAGE_R + M_CAGE) mask |= 1 << ci
          const poses = poseBuf[i]
          for (const p of poses) if (Math.hypot(x - p.x, y - p.y) < BUMP_R + M_BUMP) ok = false
          if (!ok || exposed(level, poses, x, y)) {
            ok = false
            break
          }
          const nf = popcount(mask)
          for (let j = 0; j < nf; j++) {
            pointBack(trail, trail.length, x, y, (j + 1) * FOLLOW_GAP, pb)
            if (exposed(level, poses, pb.x, pb.y)) {
              ok = false
              break
            }
          }
        }
        if (!ok) continue
        const key = cell * (full + 1) + mask
        if (next.has(key) || (timeless && visited.has(key))) continue
        if (timeless) visited.add(key)
        const child: Node = { cell, mask, parent: node, act: a }
        if (cell === exitCell && mask === full) return { route: toRoute(child, cols), time: (k + 1) * TAU, states }
        next.set(key, child)
        states++
      }
    }
    if (next.size === 0) return null
    layer = next
  }
  return null
}

/** Node chain → waypoints (straight runs merged) and absolute-time waits. */
function toRoute(end: Node, cols: number): RouteStep[] {
  const chain: Node[] = []
  for (let p: Node | null = end; p && p.parent; p = p.parent) chain.push(p)
  chain.reverse()
  const route: RouteStep[] = []
  let k = 0
  for (let i = 0; i < chain.length; i++) {
    const n = chain[i]
    k++
    const nextAct = chain[i + 1]?.act
    if (n.act === 4) {
      if (nextAct !== 4) route.push({ until: k * TAU })
    } else if (nextAct !== n.act) {
      route.push({ x: (n.cell % cols) + 0.5, y: Math.floor(n.cell / cols) + 0.5 })
    }
  }
  return route
}
