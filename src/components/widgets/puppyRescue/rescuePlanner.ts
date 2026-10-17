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
 * Not imported by the widget — the e2e suite runs it for every level, and
 * `scripts/gen-puppy-hints.mjs` runs it offline to write the 💡 Hint pack
 * (`rescueHints.ts`; too slow to run on a phone at tap time).
 */
import {
  BUMP_R,
  CAGE_R,
  CELL_FRAMES,
  CONE_HALF,
  CONE_RANGE,
  KEY_R,
  LOCK_R,
  STEP,
  canStep,
  gapOf,
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
  /** Bits 0..n-1: cages freed; bit n: holding the key; bit n+1: pen open. */
  mask: number
  /** Puppy indices in line order (shared until it changes). */
  ord: readonly number[]
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

/** Seen by any catcher (inflated), as the planner judges it. */
function exposed(level: Level, poses: Pose[], x: number, y: number, shut: boolean, sw: number): boolean {
  const R = CONE_RANGE + M_RANGE
  const H = CONE_HALF + M_HALF
  for (const p of poses) {
    const d = Math.hypot(x - p.x, y - p.y)
    if (d - M_BODY > R) continue
    if (
      seenAt(level, p, x, y, R, H, shut, sw) >= 0 ||
      seenAt(level, p, x + M_BODY, y, R, H, shut, sw) >= 0 ||
      seenAt(level, p, x - M_BODY, y, R, H, shut, sw) >= 0 ||
      seenAt(level, p, x, y + M_BODY, R, H, shut, sw) >= 0 ||
      seenAt(level, p, x, y - M_BODY, R, H, shut, sw) >= 0
    )
      return true
  }
  return false
}

/**
 * `noHide`: treat bushes as plain floor — the e2e sweep uses it to prove a
 * Hide level genuinely needs its bushes. `noPlates`: plates do nothing (the
 * doors stay as they start) — proves a Doors level needs its plates.
 */
export function planLevel(level: Level, maxTime = 90, noHide = false, noPlates = false): Plan | null {
  const { cols, cages, guards } = level
  const nc = cages.length
  const KEY = 1 << nc
  const PEN = 1 << (nc + 1)
  /** Plate switch bits (one per door colour) live above the pen bit. */
  const SW = nc + 2
  /** Every puppy freed: all cage bits, plus the pen when there is one. */
  const goal = (1 << nc) - 1 + (level.pen.length ? PEN : 0)
  const PUPS = (1 << nc) - 1 + PEN
  const space = 1 << (nc + 5)
  const cageAt = new Map<number, number>()
  cages.forEach((c, i) => cageAt.set(Math.floor(c.y) * cols + Math.floor(c.x), i))
  const penIdx = level.pen.map((_, j) => nc + j)
  const exitCell = level.exitCol
  const startCell = Math.floor(level.start.y) * cols + Math.floor(level.start.x)
  const cx = (cell: number) => (cell % cols) + 0.5
  const cy = (cell: number) => Math.floor(cell / cols) + 0.5
  const lineLen = (ord: readonly number[]) => ord.reduce((t, i) => t + gapOf(level, i), 0)

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
  layer.set(startCell * space, { cell: startCell, mask: 0, ord: [], parent: null, act: 4 })
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
        const sw0 = (node.mask >> SW) & 7
        if (a < 4 && !canStep(level, x0, y0, dx, dy, (node.mask & PEN) !== 0, sw0)) continue
        const cell = (y0 + dy) * cols + (x0 + dx)
        // Entering a plate's cell flips its colour's doors (mid-move, at the
        // edge crossing — checked below under BOTH states around then).
        const pc = a < 4 && !noPlates ? level.plate[cell] : -1
        const sw1 = pc >= 0 ? sw0 ^ (1 << pc) : sw0
        let mask = pc >= 0 ? (node.mask & ~(7 << SW)) | (sw1 << SW) : node.mask
        let ord = node.ord
        const ci = cageAt.get(cell)
        // Walking through the exit cell with a partial line would end the
        // run early in the real game (the door is open) — not a 3-star.
        const anyPup = (mask & PUPS) !== 0
        if (cell === exitCell && anyPup && (mask & PUPS) !== goal) continue
        // Room for the longest line this move could end with.
        const need =
          lineLen(ord) +
          (ci !== undefined && !(mask & (1 << ci)) ? gapOf(level, ci) : 0) +
          (level.lock && !(mask & PEN) ? lineLen(penIdx) : 0)
        if (need > 0) history(node, need)
        // Waiting in a bush hides the dog (only the dog, only standing still).
        const dogHidden = !noHide && a === 4 && level.bush[node.cell] === 1
        let ok = true
        for (let i = 1; i <= SAMPLES && ok; i++) {
          const f = i / SAMPLES
          const x = cx(node.cell) + dx * f
          const y = cy(node.cell) + dy * f
          // Pickups fire a little EARLY here (margins): the line grows and
          // the padlock opens sooner than in the game — the safe direction.
          if (ci !== undefined && !(mask & (1 << ci)) && Math.hypot(x - cx(cell), y - cy(cell)) < CAGE_R + M_CAGE) {
            mask |= 1 << ci
            ord = [...ord, ci]
          }
          if (level.key && !(mask & (KEY | PEN)) && Math.hypot(x - level.key.x, y - level.key.y) < KEY_R + M_CAGE)
            mask |= KEY
          if (level.lock && mask & KEY && Math.hypot(x - level.lock.x, y - level.lock.y) < LOCK_R + M_CAGE) {
            mask = (mask & ~KEY) | PEN
            ord = [...ord, ...penIdx]
          }
          const shut = !(mask & PEN)
          const poses = poseBuf[i]
          // Door state at this sample: before the press, after it, or (near
          // the edge crossing) both — whichever is seen counts.
          const sws = sw1 === sw0 ? [sw0] : f < 0.4 ? [sw0] : f > 0.6 ? [sw1] : [sw0, sw1]
          for (const p of poses) if (Math.hypot(x - p.x, y - p.y) < BUMP_R + M_BUMP) ok = false
          if (!ok || (!dogHidden && sws.some((w) => exposed(level, poses, x, y, shut, w)))) {
            ok = false
            break
          }
          let back = 0
          for (let j = 0; j < ord.length; j++) {
            back += gapOf(level, ord[j])
            pointBack(trail, trail.length, x, y, back, pb)
            if (sws.some((w) => exposed(level, poses, pb.x, pb.y, shut, w))) {
              ok = false
              break
            }
          }
        }
        if (!ok) continue
        const key = cell * space + mask
        if (next.has(key) || (timeless && visited.has(key))) continue
        if (timeless) visited.add(key)
        const child: Node = { cell, mask, ord, parent: node, act: a }
        if (cell === exitCell && (mask & PUPS) === goal) return { route: toRoute(child, cols), time: (k + 1) * TAU, states }
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
