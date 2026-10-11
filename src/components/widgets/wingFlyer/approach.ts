/**
 * The approach — pure, React-free: which runway end to land on, the hoop
 * pass/miss tally, and the glide-slope target the Trainer's slope hold
 * follows (landing-feel round, docs/wing-flyer.md §0).
 *
 * End choice: once the objective's land step begins, the end the plane can
 * reach with the smaller turn (its heading vs each landing heading) is the
 * active one; it re-evaluates while far out, and LOCKS inside LOCK_DIST so
 * a wobble near the runway never flips the hoops. Hoops are a guide, never
 * a requirement: each is scored once as the plane passes its plane —
 * `passed` inside HOOP_PASS of its centre, else `missed` — and all reset
 * on take-off.
 */
import type { ApproachPoint } from './islandLayout'
import { APPROACH_HOOPS, HOOP_PASS, STRIP, approachPath, landingHeading, slopeHeightAt } from './islandLayout'

export type RunwayEnd = -1 | 1
export type HoopState = 'pending' | 'passed' | 'missed'

/** Inside this distance from the runway centre the chosen end is locked. */
export const LOCK_DIST = 300
/** "Lined up" for the slope hold / hints: within this of the centreline… */
export const CORRIDOR_Z = 10
/** …and heading within this of the landing heading. */
export const CORRIDOR_HEADING = (35 * Math.PI) / 180
/** Once captured, the hold is KEPT inside this wider envelope (a plane
 * crossing the corridor at 25° leaves the tight one in a second — before
 * the lateral hold can turn it). */
export const CAPTURE_KEEP_Z = 40
export const CAPTURE_KEEP_HEADING = (60 * Math.PI) / 180
/** The other end must be better by this much before the choice switches
 * (no flicker while the nose wanders near 0°/180°). */
export const END_HYSTERESIS = (20 * Math.PI) / 180
/** Lock only once COMMITTED: heading within this of the chosen landing
 * heading. (Mid-turn, heading north, both ends need 90° — the first cut
 * chose one on that knife-edge and locked at once.) */
export const LOCK_HEADING = (45 * Math.PI) / 180

export interface ApproachState {
  /** Active end, or null until the plane heads home on the land step. */
  end: RunwayEnd | null
  locked: boolean
  hoops: HoopState[]
  /** Index of the next unscored hoop (outermost first). */
  next: number
  /** Hoops already behind the plane when the approach was joined — not
   * scored, not counted (joining the line late is fine). */
  skipped: number
  /** The slope/lateral hold has captured the line (hysteresis: enters
   * inside the tight corridor, leaves only outside the wide one). */
  captured: boolean
}

export const createApproach = (): ApproachState => ({
  end: null,
  locked: false,
  hoops: Array.from({ length: APPROACH_HOOPS }, () => 'pending' as HoopState),
  next: 0,
  skipped: 0,
  captured: false,
})

export function resetApproach(a: ApproachState): void {
  a.end = null
  a.locked = false
  a.hoops.fill('pending')
  a.next = 0
  a.skipped = 0
  a.captured = false
}

/** Hoops that count for this approach (6 minus the ones joined past). */
export const hoopsInPlay = (a: ApproachState) => a.hoops.length - a.skipped

const wrapPi = (v: number) => Math.atan2(Math.sin(v), Math.cos(v))

/** Heading change needed to line up with `end`. */
const turnTo = (end: RunwayEnd, heading: number) => Math.abs(wrapPi(landingHeading(end) - heading))

/** The end with the smaller heading change from `heading`. */
export function nearerEnd(heading: number): RunwayEnd {
  return turnTo(-1, heading) <= turnTo(1, heading) ? -1 : 1
}

export const passedCount = (a: ApproachState) => a.hoops.filter((h) => h === 'passed').length

export interface ApproachFacts {
  landStep: boolean
  airborne: boolean
  x: number
  y: number
  z: number
  /** Plane heading, radians (compass style, 0 = −Z). */
  heading: number
}

const _path: Record<string, ApproachPoint[]> = { '-1': approachPath(-1), '1': approachPath(1) }

/** The hoops of `end`, outermost first. */
export const hoopsOf = (end: RunwayEnd): ApproachPoint[] => _path[String(end)]

/**
 * One step: choose/lock the end, score hoops the plane has just passed.
 * Returns true when a hoop was scored this step (for a chime/colour).
 */
/** Skip the hoops already behind the plane for the chosen end. */
function joinLine(a: ApproachState, x: number) {
  const hoops = hoopsOf(a.end as RunwayEnd)
  let n = 0
  while (n < hoops.length && (a.end === -1 ? hoops[n].x <= x : hoops[n].x >= x)) n++
  a.next = n
  a.skipped = n
}

export function stepApproach(a: ApproachState, f: ApproachFacts, prevX: number): boolean {
  // (The tally is NOT cleared when the land step ends — the completed run
  // keeps its hoops for the banner; `resetApproach` runs with the objective.)
  if (!f.landStep || !f.airborne) return false
  const dist = Math.hypot(f.x - STRIP.x, f.z - STRIP.z)
  // Only while heading HOME: the end is chosen after the turn-back (the
  // first version locked at 150 m out, still flying away, and picked the
  // far end). Heading away keeps whatever was chosen.
  const bearing = Math.atan2(STRIP.x - f.x, -(STRIP.z - f.z))
  const towardHome = Math.abs(wrapPi(bearing - f.heading)) < Math.PI / 2
  if (!a.locked && towardHome) {
    if (a.end === null) {
      a.end = nearerEnd(f.heading)
      joinLine(a, f.x)
    } else {
      const other: RunwayEnd = a.end === -1 ? 1 : -1
      if (turnTo(other, f.heading) + END_HYSTERESIS < turnTo(a.end, f.heading)) {
        a.end = other
        a.hoops.fill('pending')
        joinLine(a, f.x)
      }
    }
    if (dist <= LOCK_DIST && turnTo(a.end, f.heading) <= LOCK_HEADING) a.locked = true
  }
  if (a.locked && dist > LOCK_DIST * 1.5) a.locked = false
  if (a.end === null) return false
  // Capture hysteresis for the hold.
  const dz = Math.abs(f.z - STRIP.z)
  const dh = turnTo(a.end, f.heading)
  if (!a.captured && dz <= CORRIDOR_Z && dh <= CORRIDOR_HEADING) a.captured = true
  else if (a.captured && (dz > CAPTURE_KEEP_Z || dh > CAPTURE_KEEP_HEADING)) a.captured = false

  // Score the next hoop once the plane crosses its x (travelling toward
  // the runway: end −1 lands eastbound, x increasing).
  const hoops = hoopsOf(a.end)
  if (a.next >= hoops.length) return false
  const h = hoops[a.next]
  const crossed = a.end === -1 ? prevX < h.x && f.x >= h.x : prevX > h.x && f.x <= h.x
  if (!crossed) return false
  const off = Math.hypot(f.y - h.y, f.z - h.z)
  a.hoops[a.next] = off <= HOOP_PASS ? 'passed' : 'missed'
  a.next++
  return true
}

/** True when the plane is on the approach corridor of the active end
 * (the instantaneous test; the hold itself uses `captured`). */
export function linedUp(a: ApproachState, f: { z: number; heading: number }): boolean {
  if (a.end === null) return false
  return Math.abs(f.z - STRIP.z) <= CORRIDOR_Z && Math.abs(wrapPi(landingHeading(a.end) - f.heading)) <= CORRIDOR_HEADING
}

/** The hold is engaged (captured), or the plane is inside the corridor
 * right now — what the sim and the hints should treat as "lined up". */
export const onLine = (a: ApproachState, f: { z: number; heading: number }) => a.captured || linedUp(a, f)

/** Glide-slope target height at `x` for the active end (NaN when none). */
export const slopeTarget = (a: ApproachState, x: number): number => (a.end === null ? Number.NaN : slopeHeightAt(a.end, x))

/** Where the home arrow should point: the next hoop still AHEAD on the
 * active approach; past the last hoop, the FAR threshold of the runway
 * (straight ahead along the landing — the centre would be right under the
 * plane and the arrow would spin); with no end, the runway centre. */
export function homeTarget(a: ApproachState, x: number, out: { x: number; z: number }): void {
  if (a.end !== null) {
    const hoops = hoopsOf(a.end)
    for (let i = a.next; i < hoops.length; i++) {
      const h = hoops[i]
      if (a.end === -1 ? h.x > x : h.x < x) {
        out.x = h.x
        out.z = h.z
        return
      }
    }
    out.x = STRIP.x - a.end * (STRIP.length / 2)
    out.z = STRIP.z
    return
  }
  out.x = STRIP.x
  out.z = STRIP.z
}
