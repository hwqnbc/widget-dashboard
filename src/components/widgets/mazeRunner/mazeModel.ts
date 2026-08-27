/**
 * Maze Runner's pure core: generation, movement and search.
 *
 * No React, no DOM — the e2e suite imports this module directly and asserts
 * the invariants (determinism, the spanning-tree property, solvability) that
 * would be miserable to check through a rendered board. It is also how the
 * suite knows the real solution to a maze the widget generated, so it can walk
 * it and prove the win.
 *
 * The maze itself is never persisted. Only its **seed** and dimensions are,
 * and the walls rebuild from those — the same contract `droneSim/worldLayout`
 * and `tankBattle/terrain` already have with their widgets.
 */

/** Stable default, so an existing instance's maze never changes shape under
 * it. Same convention as `DEFAULT_TANK_SEED`. */
export const DEFAULT_MAZE_SEED = 20260827

export type Dir = 'n' | 'e' | 's' | 'w'
/** How far one swipe carries. See `stepMove`. */
export type MoveRule = 'junction' | 'cell'
export type MazeSize = 'small' | 'medium' | 'large'
export type Orientation = 'portrait' | 'landscape'

/** Wall bits. A SET bit means the wall is still standing. */
const N = 1
const E = 2
const S = 4
const W = 8
const ALL_WALLS = N | E | S | W

const BIT: Record<Dir, number> = { n: N, e: E, s: S, w: W }
const OPPOSITE: Record<Dir, Dir> = { n: 's', e: 'w', s: 'n', w: 'e' }
/** Fixed order — the generator's neighbour scan must not depend on anything
 * but the seed, or the same seed would stop meaning the same maze. */
export const DIRS: Dir[] = ['n', 'e', 's', 'w']

export interface Maze {
  cols: number
  rows: number
  /** One wall bitmask per cell, indexed `row * cols + col`. */
  walls: Uint8Array
  start: number
  goal: number
}

/**
 * Board shape per size. A maze has no natural aspect ratio, so each size is a
 * long side and a short side, assigned by which way up the device is — which
 * is what makes the orientation hook do real work here rather than just
 * nudging a rotate hint.
 */
export const MAZE_DIMS: Record<MazeSize, { long: number; short: number }> = {
  small: { long: 11, short: 9 },
  medium: { long: 17, short: 13 },
  large: { long: 23, short: 17 },
}

/**
 * Fog-of-war sight radius per size, in passages. Scaled: a radius of 3 on a
 * 9x11 board reveals a third of it, while on 17x23 it is a keyhole.
 */
export const FOG_DEPTH: Record<MazeSize, number> = { small: 3, medium: 4, large: 5 }

export function mazeDims(
  size: MazeSize,
  orientation: Orientation,
): { cols: number; rows: number } {
  const { long, short } = MAZE_DIMS[size]
  return orientation === 'portrait'
    ? { cols: short, rows: long }
    : { cols: long, rows: short }
}

/** Same seeded PRNG the other four generators use, kept module-private here
 * exactly as they each keep their own copy. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const cellOf = (maze: Maze, col: number, row: number): number =>
  row * maze.cols + col
export const colOf = (maze: Maze, cell: number): number => cell % maze.cols
export const rowOf = (maze: Maze, cell: number): number => Math.floor(cell / maze.cols)

/** The neighbouring cell in `dir`, or -1 off the edge. */
export function neighbour(maze: Maze, cell: number, dir: Dir): number {
  const col = colOf(maze, cell)
  const row = rowOf(maze, cell)
  if (dir === 'n') return row > 0 ? cell - maze.cols : -1
  if (dir === 's') return row < maze.rows - 1 ? cell + maze.cols : -1
  if (dir === 'w') return col > 0 ? cell - 1 : -1
  return col < maze.cols - 1 ? cell + 1 : -1
}

/** Is there a passage out of `cell` in `dir`? False at the boundary. */
export function isOpen(maze: Maze, cell: number, dir: Dir): boolean {
  if (cell < 0 || cell >= maze.walls.length) return false
  if (neighbour(maze, cell, dir) < 0) return false
  return (maze.walls[cell] & BIT[dir]) === 0
}

/** Knock down the wall between `cell` and its neighbour in `dir` (both sides). */
function carve(maze: Maze, cell: number, dir: Dir): void {
  const next = neighbour(maze, cell, dir)
  if (next < 0) return
  maze.walls[cell] &= ~BIT[dir]
  maze.walls[next] &= ~BIT[OPPOSITE[dir]]
}

/**
 * Randomised depth-first carve (the "recursive backtracker"), iterative so a
 * big maze cannot blow the stack.
 *
 * Chosen over Prim's or Kruskal's because it produces long winding corridors
 * and few dead ends — it reads as *runnable* rather than fiddly, which is what
 * a young player wants. The result is a **perfect** maze: a spanning tree, so
 * exactly one route exists between any two cells and there are exactly
 * `cols * rows - 1` passages. The suite asserts both.
 */
export function generateMaze(seed: number, cols: number, rows: number): Maze {
  const count = cols * rows
  const maze: Maze = {
    cols,
    rows,
    walls: new Uint8Array(count).fill(ALL_WALLS),
    start: 0,
    goal: count - 1,
  }
  const rand = mulberry32(seed)
  const seen = new Uint8Array(count)
  const stack: number[] = [maze.start]
  seen[maze.start] = 1

  const options: Dir[] = []
  while (stack.length > 0) {
    const cell = stack[stack.length - 1]
    options.length = 0
    for (const dir of DIRS) {
      const next = neighbour(maze, cell, dir)
      if (next >= 0 && !seen[next]) options.push(dir)
    }
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const dir = options[Math.floor(rand() * options.length)]
    carve(maze, cell, dir)
    const next = neighbour(maze, cell, dir)
    seen[next] = 1
    stack.push(next)
  }
  return maze
}

/**
 * Move from `from` in `dir`, returning every cell entered — empty if a wall
 * blocks the first step. `from` itself is never included, so `[]` means
 * "blocked" unambiguously and the last element is the new position.
 *
 * The traversed cells (not just the destination) are what let the caller mark
 * a breadcrumb trail through a whole corridor, and tell "blocked" from "moved"
 * without a second call.
 *
 * - `'cell'` — exactly one cell. Precise, and tedious on a big board.
 * - `'junction'` — **follow the corridor**, turning corners, until the cell
 *   entered offers something other than exactly one way onward: a real
 *   junction (two or more), a dead end (none), or the goal.
 *
 * Following corners matters. The first version of this stopped at any bend,
 * which sounds equivalent and is not: a recursive-backtracker maze is windy,
 * so that rule advanced an average of **1.39 cells** and was almost
 * indistinguishable from `'cell'` — the setting would have been a lie.
 * Corridor-following makes one swipe mean "go to the next real decision",
 * which is the move a maze game actually wants.
 */
export function stepMove(maze: Maze, from: number, dir: Dir, rule: MoveRule): number[] {
  const path: number[] = []
  let cell = from
  let heading = dir
  // A perfect maze is a tree, so corridor-following cannot cycle. The cap is
  // a cheap backstop in case a braided-maze option ever lands.
  while (path.length < maze.walls.length) {
    if (!isOpen(maze, cell, heading)) break
    cell = neighbour(maze, cell, heading)
    path.push(cell)
    if (rule === 'cell') break
    if (cell === maze.goal) break
    // Exits other than the one we just came in through.
    const back = OPPOSITE[heading]
    const onward = DIRS.filter((d) => d !== back && isOpen(maze, cell, d))
    if (onward.length !== 1) break // a junction, or a dead end
    heading = onward[0] // round the bend
  }
  return path
}

/** Breadth-first route from `from` to `to`, inclusive of both. Empty if there
 * is none (impossible in a perfect maze, but the search does not assume it). */
export function solve(maze: Maze, from: number, to: number): number[] {
  const prev = new Int32Array(maze.walls.length).fill(-1)
  const seen = new Uint8Array(maze.walls.length)
  const queue = [from]
  seen[from] = 1
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]
    if (cell === to) {
      const path: number[] = []
      for (let at = to; at !== -1; at = prev[at]) path.push(at)
      return path.reverse()
    }
    for (const dir of DIRS) {
      if (!isOpen(maze, cell, dir)) continue
      const next = neighbour(maze, cell, dir)
      if (seen[next]) continue
      seen[next] = 1
      prev[next] = cell
      queue.push(next)
    }
  }
  return []
}

/** The directions that walk a cell path, one per hop. */
export function pathToDirs(maze: Maze, path: number[]): Dir[] {
  const dirs: Dir[] = []
  for (let i = 1; i < path.length; i++) {
    const found = DIRS.find((d) => neighbour(maze, path[i - 1], d) === path[i])
    if (found) dirs.push(found)
  }
  return dirs
}

/** Cells within `depth` passages of `from`, including `from` — the fog-of-war
 * aid's visible set. */
export function reachableWithin(maze: Maze, from: number, depth: number): Set<number> {
  const seen = new Set<number>([from])
  let frontier = [from]
  for (let step = 0; step < depth; step++) {
    const next: number[] = []
    for (const cell of frontier) {
      for (const dir of DIRS) {
        if (!isOpen(maze, cell, dir)) continue
        const to = neighbour(maze, cell, dir)
        if (seen.has(to)) continue
        seen.add(to)
        next.push(to)
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return seen
}

/** Total passages in the maze — `cols * rows - 1` for a perfect maze. */
export function passageCount(maze: Maze): number {
  let open = 0
  for (let cell = 0; cell < maze.walls.length; cell++) {
    // Count each passage once, from its north/west side only.
    if (isOpen(maze, cell, 'n')) open++
    if (isOpen(maze, cell, 'w')) open++
  }
  return open
}

/**
 * The same maze reflected left-to-right, with start and goal moving to the
 * opposite corners.
 *
 * This is what the second player runs in a duel. Hot-seat on the *identical*
 * seed would hand P2 a large memorisation advantage — they just watched the
 * solution — which Memory and Archery never have to worry about because those
 * games are symmetric. A mirror has an identical solution length and identical
 * difficulty, and is not memorisable from watching the original.
 */
export function mirrorMaze(maze: Maze): Maze {
  const { cols, rows } = maze
  const walls = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const from = maze.walls[row * cols + col]
      // North and south are unchanged by a horizontal flip; east and west swap.
      let to = from & (N | S)
      if (from & E) to |= W
      if (from & W) to |= E
      walls[row * cols + (cols - 1 - col)] = to
    }
  }
  return { cols, rows, walls, start: cols - 1, goal: (rows - 1) * cols }
}

/** One wall segment in cell units: a line from (x1,y1) to (x2,y2). */
export interface WallSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Every standing wall as a line segment, each emitted exactly once.
 *
 * Only each cell's NORTH and WEST walls are considered, plus the last column's
 * east edge and the last row's south edge — walking all four sides of every
 * cell would emit every interior wall twice (the two cells that share it both
 * record it), doubling the render for nothing.
 */
export function wallSegments(maze: Maze): WallSegment[] {
  const out: WallSegment[] = []
  const { cols, rows } = maze
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col
      const walls = maze.walls[cell]
      if (walls & N) out.push({ x1: col, y1: row, x2: col + 1, y2: row })
      if (walls & W) out.push({ x1: col, y1: row, x2: col, y2: row + 1 })
      if (col === cols - 1 && walls & E) {
        out.push({ x1: col + 1, y1: row, x2: col + 1, y2: row + 1 })
      }
      if (row === rows - 1 && walls & S) {
        out.push({ x1: col, y1: row + 1, x2: col + 1, y2: row + 1 })
      }
    }
  }
  return out
}
