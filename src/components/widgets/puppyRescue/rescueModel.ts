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
/** Pen puppies huddle tighter — a crowd of 6–8 stays a playable ~2 cells. */
export const PEN_GAP = 0.3
/** Pen puppies per `P` cell (sat side by side). */
export const PEN_PER_CELL = 2
/** Picking up the key / opening the padlock (distance to its centre). */
export const KEY_R = 0.5
export const LOCK_R = 0.65
/** Bark lure: hearing range (cells, through walls), cooldown (s), the
 * look-around at the bark spot (s) and the turn back onto the route (s). */
export const BARK_R = 4
export const BARK_COOLDOWN = 6
export const LURE_LOOK = 2
const LURE_TURN = 0.4
/** Sentry defaults: sweep rate (°/s) and the pause at each end (s). */
export const SWEEP_RATE = 45
export const SWEEP_PAUSE = 0.6
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

export type Tier = 'sneak' | 'patrol' | 'sentry' | 'key' | 'hide'

export interface GuardSpec {
  /** Waypoints in CELL coords (the catcher walks between cell centres). One
   * point = a static catcher. */
  path: [number, number][]
  /** Static catchers: facing in degrees, 0 = up the map, 90 = right. With
   * `sweep`, the CENTRE of the arc. */
  facing?: number
  /** Sentry: sweep the cone back and forth across this arc (total °). */
  sweep?: number
  /** Sentry sweep rate (°/s, default `SWEEP_RATE`). */
  sweepRate?: number
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
   * (`.` floor, `D` dog start, `C` a caged puppy, `K` the gold key, `P` a
   * pen cell holding `PEN_PER_CELL` pen puppies, `B` a bush — standing
   * still in one hides the dog); chars between them are
   * edges (`-`, `|` or `#` wall, `L` the padlock — a wall until opened with
   * the key, anything else open); even/even chars are posts (ignored —
   * write `+`). One `E` on the top border is the exit door.
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
  /** Pen puppies (sitting spots). Puppy index `cages.length + j`. */
  pen: { x: number; y: number }[]
  /** Bush cells (hiding spots): `bush[y*cols+x]` = 1. */
  bush: Uint8Array
  /** Bush cell centres, for drawing. */
  bushes: { x: number; y: number }[]
  /** The gold key's cell centre, if the level has one. */
  key: { x: number; y: number } | null
  /** The padlock edge: its segment (blocks movement and sight while shut),
   * its centre, and the grid edge it occupies. */
  lock: { seg: Seg; sight: Seg; x: number; y: number; horiz: boolean; ex: number; ey: number } | null
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
  let lock: Level['lock'] = null
  const setLock = (horiz: boolean, ex: number, ey: number) => {
    if (lock) throw new Error(`${spec.id}: one padlock per level`)
    const seg: Seg = horiz ? [ex, ey, ex + 1, ey] : [ex, ey, ex, ey + 1]
    const sight: Seg = horiz ? [ex - WALL_HALF, ey, ex + 1 + WALL_HALF, ey] : [ex, ey - WALL_HALF, ex, ey + 1 + WALL_HALF]
    lock = { seg, sight, x: horiz ? ex + 0.5 : ex, y: horiz ? ey : ey + 0.5, horiz, ex, ey }
  }
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = lines[2 * y][2 * x + 1]
      if (c === 'E') {
        if (y !== 0) throw new Error(`${spec.id}: exit must be on the top border`)
        exitCol = x
      }
      if (c === '-' || c === '#' || c === 'E') hWall[y * cols + x] = 1
      if (c === 'L') {
        hWall[y * cols + x] = 2
        setLock(true, x, y)
      }
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x <= cols; x++) {
      const c = lines[2 * y + 1][2 * x]
      if (isWall(c)) vWall[y * (cols + 1) + x] = 1
      if (c === 'L') {
        vWall[y * (cols + 1) + x] = 2
        setLock(false, x, y)
      }
    }
  if (exitCol < 0) throw new Error(`${spec.id}: no exit`)
  let start: { x: number; y: number } | null = null
  const cages: { x: number; y: number }[] = []
  const pen: { x: number; y: number }[] = []
  const bush = new Uint8Array(rows * cols)
  const bushes: { x: number; y: number }[] = []
  let key: { x: number; y: number } | null = null
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = lines[2 * y + 1][2 * x + 1]
      if (c === 'D') start = { x: x + 0.5, y: y + 0.5 }
      else if (c === 'C') cages.push({ x: x + 0.5, y: y + 0.5 })
      else if (c === 'K') key = { x: x + 0.5, y: y + 0.5 }
      else if (c === 'B') {
        bush[y * cols + x] = 1
        bushes.push({ x: x + 0.5, y: y + 0.5 })
      }
      else if (c === 'P')
        for (let k = 0; k < PEN_PER_CELL; k++)
          pen.push({ x: x + 0.5 + (k - (PEN_PER_CELL - 1) / 2) * 0.42, y: y + 0.5 })
    }
  if (!start) throw new Error(`${spec.id}: no dog start`)
  if ((pen.length > 0) !== (lock !== null) || (lock !== null) !== (key !== null))
    throw new Error(`${spec.id}: a pen needs a padlock and a key (and vice versa)`)
  // Merge edge walls into runs: horizontal per line, vertical per column.
  const walls: Seg[] = []
  for (let y = 0; y <= rows; y++) {
    let x = 0
    while (x < cols) {
      if (hWall[y * cols + x] !== 1) {
        x++
        continue
      }
      const x0 = x
      while (x < cols && hWall[y * cols + x] === 1) x++
      walls.push([x0, y, x, y])
    }
  }
  for (let x = 0; x <= cols; x++) {
    let y = 0
    while (y < rows) {
      if (vWall[y * (cols + 1) + x] !== 1) {
        y++
        continue
      }
      const y0 = y
      while (y < rows && vWall[y * (cols + 1) + x] === 1) y++
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
    pen,
    key,
    lock,
    bush,
    bushes,
    exitCol,
    guards: spec.guards.map(buildTrack),
  }
}

/** True when the edge between cell (x,y) and its neighbour (dx,dy) is open.
 * The padlock edge is open only once the pen is (`penOpen`). */
export function canStep(level: Level, x: number, y: number, dx: number, dy: number, penOpen = false): boolean {
  const { cols, rows } = level
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false
  const e =
    dx === 1
      ? level.vWall[y * (cols + 1) + x + 1]
      : dx === -1
        ? level.vWall[y * (cols + 1) + x]
        : dy === 1
          ? level.hWall[(y + 1) * cols + x]
          : level.hWall[y * cols + x]
  return e === 0 || (e === 2 && penOpen)
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
  if (pts.length === 1 && g.sweep) {
    // Sentry: sweep the arc and back, pausing at each end.
    const [x, y] = pts[0]
    const c = facingToRad(g.facing ?? 180)
    const half = ((g.sweep / 2) * Math.PI) / 180
    const turn = g.sweep / (g.sweepRate ?? SWEEP_RATE)
    const pause = g.pause ?? SWEEP_PAUSE
    push(turn, x, y, x, y, c - half, c + half)
    push(pause, x, y, x, y, c + half, c + half)
    push(turn, x, y, x, y, c + half, c - half)
    push(pause, x, y, x, y, c - half, c - half)
    return { legs, period: t, phase: g.phase ?? 0 }
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

/** Clear line of sight between two points (no wall run in between). The
 * padlock blocks it while `shut`. */
export function lineOfSight(level: Level, ax: number, ay: number, bx: number, by: number, shut = true): boolean {
  for (const s of level.sight) if (crosses(ax, ay, bx, by, s)) return false
  if (shut && level.lock && crosses(ax, ay, bx, by, level.lock.sight)) return false
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
  shut = true,
): number {
  const dx = px - g.x
  const dy = py - g.y
  const d = Math.hypot(dx, dy)
  if (d > range) return -1
  if (d > 1e-6 && Math.abs(wrapAngle(Math.atan2(dy, dx) - g.h)) > half) return -1
  return lineOfSight(level, g.x, g.y, px, py, shut) ? d : -1
}

/** Distance along ray (ox,oy)+t·(dx,dy) to the first wall, capped at `max`. */
export function rayLength(
  level: Level,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  max: number,
  shut = true,
): number {
  let best = max
  const n = level.sight.length
  for (let i = 0; i <= n; i++) {
    const seg = i < n ? level.sight[i] : shut && level.lock ? level.lock.sight : null
    if (!seg) break
    const [ax, ay, bx, by] = seg
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
export function coneRays(level: Level, g: Pose, out: Float32Array, shut = true): Float32Array {
  const n = out.length
  for (let i = 0; i < n; i++) {
    const a = g.h - CONE_HALF + (2 * CONE_HALF * i) / (n - 1)
    out[i] = rayLength(level, g.x, g.y, Math.cos(a), Math.sin(a), CONE_RANGE, shut)
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
  key: number
  unlock: number
  /** Times the dog settled into a bush (for the rustle sfx). */
  hide: number
  /** Barks made, and barks that drew a catcher. */
  bark: number
  heard: number
}

/** A catcher drawn off its route by a bark. Its route clock is paused
 * while it's away, so it resumes exactly where it left. */
export interface Lure {
  mode: 'go' | 'look' | 'back' | 'turn'
  /** Waypoints (flat x,y) of the current walk, and the next one's index. */
  pts: number[]
  i: number
  /** Where it left its route — the walk back ends here. */
  ox: number
  oy: number
  /** Seconds into 'look' / 'turn'; the heading the look sweeps around /
   * the turn starts from. */
  tt: number
  h0: number
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
  /** Puppy indices in the order they joined (= puppy line order): cage i is
   * `i`, pen puppy j is `cages.length + j`. */
  order: number[]
  freed: boolean[]
  /** Carrying the gold key (picked up, padlock not yet opened). */
  hasKey: boolean
  /** Standing still in a bush this frame: cones can't see the dog (its
   * puppies, and a catcher's touch, still count). */
  hidden: boolean
  /** The padlock is open: its edge no longer blocks, the pen has joined. */
  penOpen: boolean
  /** Puppy positions/facings, parallel to `order`. */
  px: number[]
  py: number[]
  ph: number[]
  guards: Pose[]
  /** Each catcher's route clock (== t unless a bark drew it away). */
  gclock: number[]
  /** Lured catchers (null = on its route). */
  lure: (Lure | null)[]
  /** Seconds until the next bark; and when / where the last bark was. */
  barkCd: number
  barkT: number
  barkX: number
  barkY: number
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
    hasKey: false,
    hidden: false,
    penOpen: false,
    px: [],
    py: [],
    ph: [],
    guards: level.guards.map(() => ({ x: 0, y: 0, h: 0, v: 0 })),
    gclock: level.guards.map(() => 0),
    lure: level.guards.map(() => null),
    barkCd: 0,
    barkT: -1,
    barkX: 0,
    barkY: 0,
    seeing: 0,
    meter: 0,
    spotted: false,
    status: 'ready',
    caughtBy: -1,
    caughtWho: -1,
    ev: { freed: 0, alert: 0, door: 0, key: 0, unlock: 0, hide: 0, bark: 0, heard: 0 },
  }
  level.guards.forEach((g, i) => guardPose(g, 0, s.guards[i]))
  return s
}

export const doorOpen = (s: RescueState) => s.order.length > 0
export const puppyCount = (level: Level) => level.cages.length + level.pen.length
export const allFreed = (level: Level, s: RescueState) => s.order.length === puppyCount(level)
/** Path gap in front of puppy `idx` (a pen puppy huddles closer). */
export const gapOf = (level: Level, idx: number) => (idx >= level.cages.length ? PEN_GAP : FOLLOW_GAP)

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

/** Push a circle at (x,y) radius r out of every wall capsule (and the
 * padlock edge while it's `shut`). */
function resolve(level: Level, p: { x: number; y: number }, r: number, shut: boolean): void {
  const rr = r + WALL_HALF
  const nw = level.walls.length
  for (let iter = 0; iter < 3; iter++) {
    let moved = false
    for (let i = 0; i <= nw; i++) {
      const seg = i < nw ? level.walls[i] : shut && level.lock ? level.lock.seg : null
      if (!seg) break
      const [ax, ay, bx, by] = seg
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

/* ------------------------------------------------------------------ bark */

/** Cell path (centres, flat) from cell a to cell b by BFS, or null. */
function cellPath(level: Level, ax: number, ay: number, bx: number, by: number, penOpen: boolean): number[] | null {
  const { cols, rows } = level
  const start = ay * cols + ax
  const goal = by * cols + bx
  const prev = new Int32Array(cols * rows).fill(-2)
  prev[start] = -1
  const q = [start]
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]
    if (c === goal) break
    const x = c % cols
    const y = (c - x) / cols
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!canStep(level, x, y, dx, dy, penOpen)) continue
      const n = (y + dy) * cols + x + dx
      if (prev[n] !== -2) continue
      prev[n] = c
      q.push(n)
    }
  }
  if (prev[goal] === -2) return null
  const out: number[] = []
  for (let c = goal; c >= 0; c = prev[c]) out.push((c % cols) + 0.5, Math.floor(c / cols) + 0.5)
  // reverse pairs
  const r: number[] = []
  for (let i = out.length - 2; i >= 0; i -= 2) r.push(out[i], out[i + 1])
  return r
}

/**
 * Bark: the nearest catcher within `BARK_R` (through walls) that can walk
 * to the dog's cell heads there. Returns the catcher index, or -1 (on
 * cooldown, nobody in range, or not playing). Starts the cooldown either way.
 */
export function bark(level: Level, s: RescueState): number {
  if (s.status !== 'play' || s.barkCd > 0) return -1
  s.barkCd = BARK_COOLDOWN
  s.barkT = s.t
  s.barkX = s.x
  s.barkY = s.y
  s.ev.bark += 1
  const bx = Math.floor(s.x)
  const by = Math.floor(s.y)
  let best = -1
  let bestD = BARK_R
  let bestPath: number[] | null = null
  for (let g = 0; g < level.guards.length; g++) {
    const p = s.guards[g]
    const d = Math.hypot(p.x - s.x, p.y - s.y)
    if (d > bestD) continue
    const path = cellPath(level, Math.floor(p.x), Math.floor(p.y), bx, by, s.penOpen)
    if (!path) continue
    best = g
    bestD = d
    bestPath = path
  }
  if (best < 0 || !bestPath) return -1
  const p = s.guards[best]
  const prev = s.lure[best]
  s.lure[best] = {
    mode: 'go',
    pts: [p.x, p.y, ...bestPath],
    i: 0,
    // A re-bark keeps the ORIGINAL departure point (the route is where it
    // must go back to).
    ox: prev ? prev.ox : p.x,
    oy: prev ? prev.oy : p.y,
    tt: 0,
    h0: p.h,
  }
  s.ev.heard += 1
  return best
}

/** Advance a catcher one step: along its route (clock ticking), or along
 * its lure (clock paused). Writes `s.guards[g]`. */
function stepGuard(level: Level, s: RescueState, g: number): Pose {
  const p = s.guards[g]
  const L = s.lure[g]
  if (!L) {
    s.gclock[g] += STEP
    return guardPose(level.guards[g], s.gclock[g], p)
  }
  if (L.mode === 'go' || L.mode === 'back') {
    let left = GUARD_SPEED * STEP
    while (left > 0 && L.i < L.pts.length / 2) {
      const tx = L.pts[2 * L.i]
      const ty = L.pts[2 * L.i + 1]
      const d = Math.hypot(tx - p.x, ty - p.y)
      if (d <= left) {
        p.x = tx
        p.y = ty
        left -= d
        L.i++
      } else {
        p.h = Math.atan2(ty - p.y, tx - p.x)
        p.x += ((tx - p.x) / d) * left
        p.y += ((ty - p.y) / d) * left
        left = 0
      }
    }
    p.v = GUARD_SPEED
    if (L.i >= L.pts.length / 2) {
      p.v = 0
      if (L.mode === 'go') {
        L.mode = 'look'
        L.tt = 0
        L.h0 = p.h
      } else {
        L.mode = 'turn'
        L.tt = 0
        L.h0 = p.h
      }
    }
    return p
  }
  L.tt += STEP
  if (L.mode === 'look') {
    // Look around: a slow ±60° sweep about the arrival heading.
    p.h = wrapAngle(L.h0 + Math.sin((L.tt / LURE_LOOK) * Math.PI * 2) * (Math.PI / 3))
    p.v = 0
    if (L.tt >= LURE_LOOK) {
      // Walk back the way it came, ending exactly where it left its route.
      const back: number[] = []
      for (let i = L.pts.length - 4; i >= 2; i -= 2) back.push(L.pts[i], L.pts[i + 1])
      back.push(L.ox, L.oy)
      L.pts = back
      L.i = 0
      L.mode = 'back'
    }
    return p
  }
  // 'turn': ease back to the route's heading, then rejoin it.
  const route = guardPose(level.guards[g], s.gclock[g], { x: 0, y: 0, h: 0, v: 0 })
  const f = Math.min(1, L.tt / LURE_TURN)
  p.h = wrapAngle(L.h0 + wrapAngle(route.h - L.h0) * f)
  p.v = 0
  if (f >= 1) {
    s.lure[g] = null
    guardPose(level.guards[g], s.gclock[g], p)
  }
  return p
}

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
  if (s.barkCd > 0) s.barkCd = Math.max(0, s.barkCd - STEP)

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
      resolve(level, scratchP, DOG_R, !s.penOpen)
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
          resolve(level, scratchP, DOG_R, !s.penOpen)
        }
      } else {
        const c = Math.floor(scratchP.x) + 0.5
        const off = c - scratchP.x
        if (Math.abs(off) < ASSIST && Math.abs(off) > 1e-4) {
          scratchP.x += Math.sign(off) * Math.min(Math.abs(off), want)
          resolve(level, scratchP, DOG_R, !s.penOpen)
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

  // --- hiding: still, in a bush cell
  const inBush = level.bush[Math.floor(s.y) * level.cols + Math.floor(s.x)] === 1
  const hidden = inBush && moved <= 1e-5
  if (hidden && !s.hidden) s.ev.hide += 1
  s.hidden = hidden

  // --- the gold key, then the padlock: the whole pen joins the line
  if (level.key && !s.hasKey && !s.penOpen && Math.hypot(s.x - level.key.x, s.y - level.key.y) < KEY_R) {
    s.hasKey = true
    s.ev.key += 1
  }
  if (level.lock && s.hasKey && !s.penOpen && Math.hypot(s.x - level.lock.x, s.y - level.lock.y) < LOCK_R) {
    s.hasKey = false
    s.penOpen = true
    s.ev.unlock += 1
    if (s.order.length === 0) s.ev.door += 1
    for (let j = 0; j < level.pen.length; j++) s.order.push(level.cages.length + j)
    s.ev.freed += 1
  }

  // --- the puppy line
  const nf = s.order.length
  s.px.length = nf
  s.py.length = nf
  s.ph.length = nf
  let back = 0
  for (let j = 0; j < nf; j++) {
    back += gapOf(level, s.order[j])
    pointBack(s.trail, s.trail.length, s.x, s.y, back, scratchB)
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
    const p = stepGuard(level, s, g)
    if (Math.hypot(s.x - p.x, s.y - p.y) < BUMP_R) bump = g
    const d = s.hidden ? -1 : seenAt(level, p, s.x, s.y, CONE_RANGE, CONE_HALF, !s.penOpen)
    if (d >= 0) {
      seeing |= 1 << g
      if (d < nearest) {
        nearest = d
        who = -1
        by = g
      }
    }
    for (let j = 0; j < nf; j++) {
      const dj = seenAt(level, p, s.px[j], s.py[j], CONE_RANGE, CONE_HALF, !s.penOpen)
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
