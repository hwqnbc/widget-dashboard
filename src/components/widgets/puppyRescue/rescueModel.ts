/**
 * Puppy Rescue — the pure game model (no React, no three.js). The widget's
 * rAF loop, the lazy 3D view and the e2e suites all run THIS code, so what
 * the player sees, what the tests prove and what the planner searches are
 * one simulation.
 *
 * World: 1 unit = 1 maze cell. x runs right, y runs DOWN the map (row 0 is
 * the top, where the exit door is). Walls are thin segments on cell edges,
 * authored as an ASCII grid (see `parseLevel`). The dog moves freely (a
 * circle sliding along wall capsules); catchers walk deterministic tracks,
 * so a catcher's pose is a pure function of time (`guardPose`) — which is
 * what lets the planner search (cell, time) and the replay prove a level.
 *
 * Fixed step: `step` always advances `STEP` seconds. The dog's speed is
 * chosen so one cell takes exactly `CELL_FRAMES` steps — a route through
 * cell centres replays frame-exact against the planner's timeline.
 */

/* ----------------------------------------------------------------- tuning */

/** Fixed simulation step (s). */
export const STEP = 1 / 60
/** Frames the dog needs to cross one cell at full speed. */
export const CELL_FRAMES = 24
/** Dog speed (cells/s) — 2.5, so one cell is exactly `CELL_FRAMES` steps. */
export const DOG_SPEED = 1 / (CELL_FRAMES * STEP)
/** Dog body radius (cells). */
export const DOG_R = 0.26
/** Default catcher patrol speed — 0.6× the dog. */
export const GUARD_SPEED = DOG_SPEED * 0.6
/** Default pause at each end of a back-and-forth walk (s). */
export const GUARD_PAUSE = 1.2
/** Turn time at an intermediate corner of a patrol path (s). */
const CORNER_TURN = 0.3
/** Vision cone reach (cells) and half-angle (radians, 37.5° → 75° wide). */
export const CONE_RANGE = 3.5
export const CONE_HALF = (37.5 * Math.PI) / 180
/** Touching distance: a catcher this close to the dog nets it, cone or not. */
export const BUMP_R = 0.6
/** "?" meter fill time at the cone's near edge / far edge (s). */
export const FILL_NEAR = 0.4
export const FILL_FAR = 0.8
/** Seconds for a full meter to drain once nobody is seen. */
export const DRAIN_S = 1
/** Distance at which the dog opens a cage. */
export const CAGE_R = 0.6
/** Gap between dog and first puppy, and between puppies (cells of path). */
export const FOLLOW_GAP = 0.55
/** Half thickness of a wall (cells). */
export const WALL_HALF = 0.07
/** Corner assist: within this of a cell-centre line, a blocked move slides
 * onto it (Pac-Man pre-turn) instead of grinding on the corner. */
const ASSIST = 0.45
/** Trail sample spacing (cells). */
const TRAIL_STEP = 0.04
/** Escape: in the exit cell with y under this — the dog reaching the door. */
const ESCAPE_Y = 0.55

/* ------------------------------------------------------------------ level */

export type Tier = 'sneak' | 'patrol'

export interface GuardSpec {
  /** Waypoints in CELL coords (the catcher walks between cell centres). One
   * point = a static catcher. */
  path: [number, number][]
  /** Static catchers: facing in degrees, 0 = up the map, 90 = right. */
  facing?: number
  speed?: number
  /** Pause at each end of a back-and-forth walk (s). */
  pause?: number
  /** Start offset into the patrol cycle (s). */
  phase?: number
  /** Walk the path as a closed loop instead of back-and-forth. */
  loop?: boolean
}

export interface LevelSpec {
  /** Stable record key, e.g. `sneak:0` — the pack is append-only. */
  id: string
  tier: Tier
  name: string
  /** One-line tip shown before the first move. */
  tip?: string
  /**
   * ASCII map, (2·rows+1) lines of (2·cols+1) chars. Odd/odd chars are cells
   * (`.` floor, `D` dog start, `C` a caged puppy); chars between them are
   * edges (`-`, `|` or `#` wall, anything else open); even/even chars are
   * posts (ignored — write `+`). One `E` on the top border is the exit door.
   */
  map: string[]
  guards: GuardSpec[]
}

/** A wall run: (x1,y1)→(x2,y2), axis-aligned, merged across cells. */
export type Seg = [number, number, number, number]

export interface GuardTrack {
  legs: Leg[]
  period: number
  phase: number
}

interface Leg {
  t0: number
  dur: number
  x0: number
  y0: number
  x1: number
  y1: number
  h0: number
  h1: number
}

export interface Level {
  spec: LevelSpec
  cols: number
  rows: number
  /** Merged wall runs (the exit door included — it's solid and opaque). */
  walls: Seg[]
  /** Same runs, stretched by `WALL_HALF` each end, for sight lines (seals
   * the corners between runs). */
  sight: Seg[]
  /** Edge walls for grid search: hWall[y*cols+x] is the line y between rows
   * y-1 and y; vWall[y*(cols+1)+x] is the line x between columns x-1 and x. */
  hWall: Uint8Array
  vWall: Uint8Array
  start: { x: number; y: number }
  cages: { x: number; y: number }[]
  exitCol: number
  guards: GuardTrack[]
}

/** Map heading: degrees (0 = up, clockwise) → radians in map coords. */
export const facingToRad = (deg: number) => ((deg - 90) * Math.PI) / 180
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

const isWall = (c: string) => c === '|' || c === '#' || c === '-'

export function parseLevel(spec: LevelSpec): Level {
  const lines = spec.map
  const H = lines.length
  const W = lines[0].length
  if (H % 2 === 0 || W % 2 === 0) throw new Error(`${spec.id}: map must be odd×odd`)
  for (const l of lines) if (l.length !== W) throw new Error(`${spec.id}: ragged map`)
  const cols = (W - 1) / 2
  const rows = (H - 1) / 2
  const hWall = new Uint8Array((rows + 1) * cols)
  const vWall = new Uint8Array(rows * (cols + 1))
  let exitCol = -1
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = lines[2 * y][2 * x + 1]
      if (c === 'E') {
        if (y !== 0) throw new Error(`${spec.id}: exit must be on the top border`)
        exitCol = x
      }
      if (c === '-' || c === '#' || c === 'E') hWall[y * cols + x] = 1
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x <= cols; x++) if (isWall(lines[2 * y + 1][2 * x])) vWall[y * (cols + 1) + x] = 1
  if (exitCol < 0) throw new Error(`${spec.id}: no exit`)
  let start: { x: number; y: number } | null = null
  const cages: { x: number; y: number }[] = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = lines[2 * y + 1][2 * x + 1]
      if (c === 'D') start = { x: x + 0.5, y: y + 0.5 }
      else if (c === 'C') cages.push({ x: x + 0.5, y: y + 0.5 })
    }
  if (!start) throw new Error(`${spec.id}: no dog start`)
  // Merge edge walls into runs: horizontal per line, vertical per column.
  const walls: Seg[] = []
  for (let y = 0; y <= rows; y++) {
    let x = 0
    while (x < cols) {
      if (!hWall[y * cols + x]) {
        x++
        continue
      }
      const x0 = x
      while (x < cols && hWall[y * cols + x]) x++
      walls.push([x0, y, x, y])
    }
  }
  for (let x = 0; x <= cols; x++) {
    let y = 0
    while (y < rows) {
      if (!vWall[y * (cols + 1) + x]) {
        y++
        continue
      }
      const y0 = y
      while (y < rows && vWall[y * (cols + 1) + x]) y++
      walls.push([x, y0, x, y])
    }
  }
  const sight: Seg[] = walls.map(([x1, y1, x2, y2]) =>
    x1 === x2 ? [x1, y1 - WALL_HALF, x2, y2 + WALL_HALF] : [x1 - WALL_HALF, y1, x2 + WALL_HALF, y2],
  )
  return {
    spec,
    cols,
    rows,
    walls,
    sight,
    hWall,
    vWall,
    start,
    cages,
    exitCol,
    guards: spec.guards.map(buildTrack),
  }
}

/** True when the edge between cell (x,y) and its neighbour (dx,dy) is open. */
export function canStep(level: Level, x: number, y: number, dx: number, dy: number): boolean {
  const { cols, rows } = level
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false
  if (dx === 1) return !level.vWall[y * (cols + 1) + x + 1]
  if (dx === -1) return !level.vWall[y * (cols + 1) + x]
  if (dy === 1) return !level.hWall[(y + 1) * cols + x]
  return !level.hWall[y * cols + x]
}

/* ----------------------------------------------------------------- guards */

function buildTrack(g: GuardSpec): GuardTrack {
  const pts = g.path.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number])
  const legs: Leg[] = []
  let t = 0
  const push = (dur: number, x0: number, y0: number, x1: number, y1: number, h0: number, h1: number) => {
    legs.push({ t0: t, dur, x0, y0, x1, y1, h0, h1 })
    t += dur
  }
  if (pts.length === 1) {
    const h = facingToRad(g.facing ?? 180)
    push(1, pts[0][0], pts[0][1], pts[0][0], pts[0][1], h, h)
    return { legs, period: t, phase: g.phase ?? 0 }
  }
  const speed = g.speed ?? GUARD_SPEED
  const pause = g.pause ?? GUARD_PAUSE
  const route = g.loop ? [...pts, pts[0]] : [...pts, ...pts.slice(0, -1).reverse()]
  const dirOf = (i: number) => Math.atan2(route[i + 1][1] - route[i][1], route[i + 1][0] - route[i][0])
  const nLegs = route.length - 1
  for (let i = 0; i < nLegs; i++) {
    const [x0, y0] = route[i]
    const [x1, y1] = route[i + 1]
    const h = dirOf(i)
    push(Math.hypot(x1 - x0, y1 - y0) / speed, x0, y0, x1, y1, h, h)
    // Turn toward the next leg (wrapping round for the cycle).
    const hn = dirOf((i + 1) % nLegs)
    const reversal = !g.loop && (i === pts.length - 2 || i === nLegs - 1)
    if (reversal) {
      // Back-and-forth end: hold, turn round, hold.
      push(pause * 0.25, x1, y1, x1, y1, h, h)
      push(pause * 0.5, x1, y1, x1, y1, h, h + Math.PI)
      push(pause * 0.25, x1, y1, x1, y1, h + Math.PI, h + Math.PI)
    } else if (Math.abs(wrapAngle(hn - h)) > 1e-6) {
      push(CORNER_TURN, x1, y1, x1, y1, h, h + wrapAngle(hn - h))
    }
  }
  return { legs, period: t, phase: g.phase ?? 0 }
}

export interface Pose {
  x: number
  y: number
  h: number
  /** Ground speed (cells/s) — drives the walk cycle. */
  v: number
}

/** A catcher's pose at time `t` — pure, so any time can be asked. */
export function guardPose(g: GuardTrack, t: number, out: Pose): Pose {
  let tt = (t + g.phase) % g.period
  if (tt < 0) tt += g.period
  let leg = g.legs[g.legs.length - 1]
  for (const l of g.legs)
    if (tt < l.t0 + l.dur) {
      leg = l
      break
    }
  const f = leg.dur > 0 ? Math.min(1, Math.max(0, (tt - leg.t0) / leg.dur)) : 1
  out.x = leg.x0 + (leg.x1 - leg.x0) * f
  out.y = leg.y0 + (leg.y1 - leg.y0) * f
  out.h = wrapAngle(leg.h0 + (leg.h1 - leg.h0) * f)
  out.v = leg.dur > 0 ? Math.hypot(leg.x1 - leg.x0, leg.y1 - leg.y0) / leg.dur : 0
  return out
}

/* ------------------------------------------------------------------ sight */

/** Does segment p→q cross wall run s? (Proper or touching intersection.) */
function crosses(px: number, py: number, qx: number, qy: number, s: Seg): boolean {
  const [ax, ay, bx, by] = s
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const d2 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax)
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return false
  const d3 = (qx - px) * (ay - py) - (qy - py) * (ax - px)
  const d4 = (qx - px) * (by - py) - (qy - py) * (bx - px)
  if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) return false
  return true
}

/** Clear line of sight between two points (no wall run in between). */
export function lineOfSight(level: Level, ax: number, ay: number, bx: number, by: number): boolean {
  for (const s of level.sight) if (crosses(ax, ay, bx, by, s)) return false
  return true
}

/**
 * Is point (px,py) inside catcher pose `g`'s vision cone, unblocked? Returns
 * the distance when seen, -1 when not. `range`/`half` default to the game's
 * cone; the planner passes inflated ones for its safety margin.
 */
export function seenAt(
  level: Level,
  g: Pose,
  px: number,
  py: number,
  range = CONE_RANGE,
  half = CONE_HALF,
): number {
  const dx = px - g.x
  const dy = py - g.y
  const d = Math.hypot(dx, dy)
  if (d > range) return -1
  if (d > 1e-6 && Math.abs(wrapAngle(Math.atan2(dy, dx) - g.h)) > half) return -1
  return lineOfSight(level, g.x, g.y, px, py) ? d : -1
}

/** Distance along ray (ox,oy)+t·(dx,dy) to the first wall, capped at `max`. */
export function rayLength(level: Level, ox: number, oy: number, dx: number, dy: number, max: number): number {
  let best = max
  for (const [ax, ay, bx, by] of level.sight) {
    const ex = bx - ax
    const ey = by - ay
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den
    const u = ((ax - ox) * dy - (ay - oy) * dx) / den
    if (t >= 0 && t < best && u >= 0 && u <= 1) best = t
  }
  return best
}

/** Fill `out` (length n) with ray lengths fanning across the cone — the
 * view draws the wedge from these, clipped by walls exactly like `seenAt`. */
export function coneRays(level: Level, g: Pose, out: Float32Array): Float32Array {
  const n = out.length
  for (let i = 0; i < n; i++) {
    const a = g.h - CONE_HALF + (2 * CONE_HALF * i) / (n - 1)
    out[i] = rayLength(level, g.x, g.y, Math.cos(a), Math.sin(a), CONE_RANGE)
  }
  return out
}

/* ------------------------------------------------------------------ state */

export type Status = 'ready' | 'play' | 'caught' | 'escaped'

/** Event tallies — the widget diffs them each frame to play sounds and
 * publishes them as the e2e contract. */
export interface Events {
  freed: number
  alert: number
  door: number
}

export interface RescueState {
  t: number
  frames: number
  x: number
  y: number
  /** Dog facing (radians, map coords) and current speed (cells/s). */
  h: number
  v: number
  /** Dog path history, flat x,y pairs, oldest first. */
  trail: number[]
  /** Cage indices in the order they were opened (= puppy line order). */
  order: number[]
  freed: boolean[]
  /** Puppy positions/facings, parallel to `order`. */
  px: number[]
  py: number[]
  ph: number[]
  guards: Pose[]
  /** Bit i set: catcher i sees someone this frame. */
  seeing: number
  /** "?" meter 0..1; 1 = caught. */
  meter: number
  /** The meter ever started filling (costs the "never spotted" star). */
  spotted: boolean
  status: Status
  /** Catcher that made the catch (-1 none) and who it saw: -1 the dog,
   * otherwise the index into the puppy line. */
  caughtBy: number
  caughtWho: number
  ev: Events
}

export function initialState(level: Level): RescueState {
  const s: RescueState = {
    t: 0,
    frames: 0,
    x: level.start.x,
    y: level.start.y,
    h: -Math.PI / 2,
    v: 0,
    trail: [level.start.x, level.start.y],
    order: [],
    freed: level.cages.map(() => false),
    px: [],
    py: [],
    ph: [],
    guards: level.guards.map(() => ({ x: 0, y: 0, h: 0, v: 0 })),
    seeing: 0,
    meter: 0,
    spotted: false,
    status: 'ready',
    caughtBy: -1,
    caughtWho: -1,
    ev: { freed: 0, alert: 0, door: 0 },
  }
  level.guards.forEach((g, i) => guardPose(g, 0, s.guards[i]))
  return s
}

export const doorOpen = (s: RescueState) => s.order.length > 0
export const allFreed = (level: Level, s: RescueState) => s.order.length === level.cages.length

/** Stars for a finished run: escaped, every puppy, never spotted. */
export function starsFor(level: Level, s: RescueState): number {
  if (s.status !== 'escaped') return 0
  return 1 + (allFreed(level, s) ? 1 : 0) + (s.spotted ? 0 : 1)
}

/* ------------------------------------------------------------------- trail */

/**
 * The point `dist` back along a path that ends at (hx,hy) and continues
 * backward through `trail` (flat pairs, oldest first, newest last). Writes
 * x, y and the travel heading at that point into `out`. Shared by the sim
 * and the planner so their puppy lines agree.
 */
export function pointBack(
  trail: ArrayLike<number>,
  n: number,
  hx: number,
  hy: number,
  dist: number,
  out: { x: number; y: number; h: number },
): void {
  let cx = hx
  let cy = hy
  let left = dist
  for (let i = n - 2; i >= 0; i -= 2) {
    const ax = trail[i]
    const ay = trail[i + 1]
    const seg = Math.hypot(cx - ax, cy - ay)
    if (seg >= left && seg > 1e-9) {
      const f = left / seg
      out.x = cx + (ax - cx) * f
      out.y = cy + (ay - cy) * f
      out.h = Math.atan2(cy - ay, cx - ax)
      return
    }
    if (seg > 1e-9) out.h = Math.atan2(cy - ay, cx - ax)
    left -= seg
    cx = ax
    cy = ay
  }
  out.x = cx
  out.y = cy
}

/* -------------------------------------------------------------- collision */

/** Push a circle at (x,y) radius r out of every wall capsule. */
function resolve(level: Level, p: { x: number; y: number }, r: number): void {
  const rr = r + WALL_HALF
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (const [ax, ay, bx, by] of level.walls) {
      const ex = bx - ax
      const ey = by - ay
      const len2 = ex * ex + ey * ey
      let f = ((p.x - ax) * ex + (p.y - ay) * ey) / len2
      f = f < 0 ? 0 : f > 1 ? 1 : f
      const cx = ax + ex * f
      const cy = ay + ey * f
      const dx = p.x - cx
      const dy = p.y - cy
      const d2 = dx * dx + dy * dy
      if (d2 >= rr * rr) continue
      const d = Math.sqrt(d2)
      if (d < 1e-9) {
        // Dead centre on the wall line — push perpendicular to it.
        p.x += (-ey / Math.sqrt(len2)) * rr
        p.y += (ex / Math.sqrt(len2)) * rr
      } else {
        p.x = cx + (dx / d) * rr
        p.y = cy + (dy / d) * rr
      }
      moved = true
    }
    if (!moved) break
  }
}

/* ------------------------------------------------------------------- step */

const scratchP = { x: 0, y: 0 }
const scratchB = { x: 0, y: 0, h: 0 }

/** Leave 'ready' — the clock and the catchers start on the first move. */
export function start(s: RescueState): void {
  if (s.status === 'ready') s.status = 'play'
}

/**
 * Advance one fixed step with stick input (ix, iy) in -1..1 MAP axes
 * (iy +1 = down the map). Mutates `s`. A 'ready' state starts on the first
 * non-zero input; finished states don't move.
 */
export function step(level: Level, s: RescueState, ix: number, iy: number): void {
  let mag = Math.hypot(ix, iy)
  if (s.status === 'ready' && mag > 0.05) start(s)
  if (s.status !== 'play') return
  s.t += STEP
  s.frames += 1

  // --- the dog: no inertia — speed is the stick, stop is instant.
  const ox = s.x
  const oy = s.y
  if (mag > 1) {
    ix /= mag
    iy /= mag
    mag = 1
  }
  if (mag > 1e-6) {
    const dist = DOG_SPEED * mag * STEP
    const n = Math.max(1, Math.ceil(dist / 0.08))
    scratchP.x = s.x
    scratchP.y = s.y
    for (let k = 0; k < n; k++) {
      scratchP.x += (ix / mag) * (dist / n)
      scratchP.y += (iy / mag) * (dist / n)
      resolve(level, scratchP, DOG_R)
    }
    // Corner assist: mostly-blocked along the main axis → slide toward the
    // cell-centre line of the cross axis, so a turn into a gap just works.
    const want = dist
    const horiz = Math.abs(ix) >= Math.abs(iy)
    const progress = horiz ? Math.abs(scratchP.x - ox) : Math.abs(scratchP.y - oy)
    if (progress < want * 0.5) {
      if (horiz) {
        const c = Math.floor(scratchP.y) + 0.5
        const off = c - scratchP.y
        if (Math.abs(off) < ASSIST && Math.abs(off) > 1e-4) {
          scratchP.y += Math.sign(off) * Math.min(Math.abs(off), want)
          resolve(level, scratchP, DOG_R)
        }
      } else {
        const c = Math.floor(scratchP.x) + 0.5
        const off = c - scratchP.x
        if (Math.abs(off) < ASSIST && Math.abs(off) > 1e-4) {
          scratchP.x += Math.sign(off) * Math.min(Math.abs(off), want)
          resolve(level, scratchP, DOG_R)
        }
      }
    }
    s.x = scratchP.x
    s.y = scratchP.y
  }
  const moved = Math.hypot(s.x - ox, s.y - oy)
  s.v = moved / STEP
  if (moved > 1e-5) s.h = Math.atan2(s.y - oy, s.x - ox)
  const tn = s.trail.length
  if (Math.hypot(s.x - s.trail[tn - 2], s.y - s.trail[tn - 1]) >= TRAIL_STEP) {
    s.trail.push(s.x, s.y)
    if (s.trail.length > 4000) s.trail.splice(0, 2000)
  }

  // --- cages
  for (let i = 0; i < level.cages.length; i++) {
    if (s.freed[i]) continue
    const c = level.cages[i]
    if (Math.hypot(s.x - c.x, s.y - c.y) < CAGE_R) {
      s.freed[i] = true
      s.order.push(i)
      s.ev.freed += 1
      if (s.order.length === 1) s.ev.door += 1
    }
  }

  // --- the puppy line
  const nf = s.order.length
  s.px.length = nf
  s.py.length = nf
  s.ph.length = nf
  for (let j = 0; j < nf; j++) {
    pointBack(s.trail, s.trail.length, s.x, s.y, (j + 1) * FOLLOW_GAP, scratchB)
    s.px[j] = scratchB.x
    s.py[j] = scratchB.y
    s.ph[j] = scratchB.h
  }

  // --- catchers + detection
  let seeing = 0
  let nearest = Infinity
  let bump = -1
  let who = -1
  let by = -1
  for (let g = 0; g < level.guards.length; g++) {
    const p = guardPose(level.guards[g], s.t, s.guards[g])
    if (Math.hypot(s.x - p.x, s.y - p.y) < BUMP_R) bump = g
    const d = seenAt(level, p, s.x, s.y)
    if (d >= 0) {
      seeing |= 1 << g
      if (d < nearest) {
        nearest = d
        who = -1
        by = g
      }
    }
    for (let j = 0; j < nf; j++) {
      const dj = seenAt(level, p, s.px[j], s.py[j])
      if (dj >= 0) {
        seeing |= 1 << g
        if (dj < nearest) {
          nearest = dj
          who = j
          by = g
        }
      }
    }
  }
  s.seeing = seeing
  if (bump >= 0) {
    s.meter = 1
    s.spotted = true
    s.status = 'caught'
    s.caughtBy = bump
    s.caughtWho = -1
    return
  }
  if (seeing) {
    if (s.meter === 0) s.ev.alert += 1
    s.spotted = true
    const fill = FILL_NEAR + (FILL_FAR - FILL_NEAR) * Math.min(1, nearest / CONE_RANGE)
    s.meter = Math.min(1, s.meter + STEP / fill)
    if (s.meter >= 1) {
      s.status = 'caught'
      s.caughtBy = by
      s.caughtWho = who
      return
    }
  } else {
    s.meter = Math.max(0, s.meter - STEP / DRAIN_S)
  }

  // --- the door
  if (doorOpen(s) && Math.floor(s.x) === level.exitCol && s.y < ESCAPE_Y) s.status = 'escaped'
}

/* ------------------------------------------------------------------ route */

/** A replayable route: walk to (x,y), or stand still until time `until`. */
export type RouteStep = { x: number; y: number } | { until: number }

/**
 * Stick input that walks `route` from cursor `c.i` (advanced in place):
 * straight at full speed, landing exactly on each waypoint. Used by the
 * e2e replays of planner routes.
 */
export function routeInput(
  s: RescueState,
  route: readonly RouteStep[],
  c: { i: number },
): [number, number] {
  while (c.i < route.length) {
    const r = route[c.i]
    if ('until' in r) {
      if (s.t + STEP / 2 < r.until) return [0, 0]
      c.i++
      continue
    }
    const dx = r.x - s.x
    const dy = r.y - s.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) {
      c.i++
      continue
    }
    const k = Math.min(1, d / (DOG_SPEED * STEP)) / d
    return [dx * k, dy * k]
  }
  return [0, -1]
}
