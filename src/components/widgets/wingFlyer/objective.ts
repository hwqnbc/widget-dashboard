/**
 * Free Flight's objective — pure, React-free. The play-test showed the
 * sandbox read as "a plane with no reason to fly it", so Free Flight carries
 * one standing goal: **Take off ▸ Fly out 150 m ▸ Land**, with a bonus mark
 * for landing on the runway. Round 1b's Landing mission 1 is this same
 * checklist with stars on top, so it lives here as data + a pure stepper.
 *
 * Steps are judged from the sim's own facts each step: airborne/ground,
 * distance from the runway centre, the last touchdown. A crash resets the
 * run (the next launch starts a fresh checklist).
 */
import type { TouchResult } from './ground'

/** Fly at least this far from the runway centre… */
export const FLY_OUT_DIST = 150
/** …then come back inside this before the landing counts as "back". */
export const COME_BACK_DIST = 100

export type ObjectiveStep = 'takeoff' | 'flyout' | 'land'
export const OBJECTIVE_STEPS: readonly ObjectiveStep[] = ['takeoff', 'flyout', 'land']

export interface ObjectiveState {
  takeoff: boolean
  flyout: boolean
  /** Back within COME_BACK_DIST after the fly-out. */
  back: boolean
  land: boolean
  /** The completing landing was on the runway (the bonus mark). */
  runway: boolean
  /** Sink rate of the completing landing, m/s. */
  sink: number
  /** Farthest the plane has been from the runway this run, metres. */
  maxDist: number
  /** Completed runs this session. */
  completed: number
}

export const createObjective = (): ObjectiveState => ({
  takeoff: false,
  flyout: false,
  back: false,
  land: false,
  runway: false,
  sink: 0,
  maxDist: 0,
  completed: 0,
})

/** Start a fresh run (new launch, or after a crash). Keeps `completed`. */
export function resetObjective(o: ObjectiveState): void {
  o.takeoff = o.flyout = o.back = o.land = o.runway = false
  o.sink = 0
  o.maxDist = 0
}

/** The step the player is on now, or null once the run is complete. */
export function currentStep(o: ObjectiveState): ObjectiveStep | null {
  if (!o.takeoff) return 'takeoff'
  if (!o.flyout) return 'flyout'
  if (!o.land) return 'land'
  return null
}

export interface ObjectiveFacts {
  /** The plane is off the ground (not in the hand, not rolling). */
  airborne: boolean
  /** Distance from the runway centre, metres. */
  homeDist: number
  /** A touchdown just happened this step (else null). */
  touchdown: { result: TouchResult; sink: number; onRunway: boolean } | null
}

/**
 * Advance the checklist from this step's facts. Returns true the step the
 * run completes (the caller plays the fanfare). Order matters: a landing
 * only completes the run after the fly-out AND the return — landing far
 * out on the grass is still a safe landing, just not the goal.
 */
export function stepObjective(o: ObjectiveState, f: ObjectiveFacts): boolean {
  if (f.airborne && !o.takeoff) o.takeoff = true
  if (o.takeoff) {
    if (f.homeDist > o.maxDist) o.maxDist = f.homeDist
    if (!o.flyout && f.homeDist >= FLY_OUT_DIST) o.flyout = true
    if (o.flyout && !o.back && f.homeDist <= COME_BACK_DIST) o.back = true
  }
  if (f.touchdown && f.touchdown.result === 'landed' && o.flyout && o.back && !o.land) {
    o.land = true
    o.runway = f.touchdown.onRunway
    o.sink = f.touchdown.sink
    o.completed++
    return true
  }
  return false
}

// --- landing hints -----------------------------------------------------------

export type LandingHint = 'lineup' | 'follow' | 'low' | null

/** Hints only while heading roughly toward the runway… */
export const HINT_MAX_BEARING = (60 * Math.PI) / 180
/** …inside this distance from the runway centre… */
export const HINT_MAX_DIST = 320
/** …and this far off the extended centreline counts as "lined up". */
export const HINT_CORRIDOR = 25
/** Below this height the final hint shows (the Trainer's flare height). */
export const HINT_LOW_AGL = 6

export interface HintFacts {
  /** The objective is on its "land" step. */
  landStep: boolean
  airborne: boolean
  homeDist: number
  /** Bearing to the runway relative to the nose, radians. */
  homeRel: number
  /** Distance from the runway's extended centreline, metres. */
  offCentreline: number
  agl: number
}

/**
 * Which landing hint to show, or null: `lineup` (far, not yet on the
 * centreline), `follow` (lined up — follow the hoops down), `low` (under
 * the flare height — let go / ease back). Pure; the body maps it to words
 * per assist level.
 */
export function landingHint(f: HintFacts): LandingHint {
  if (!f.landStep || !f.airborne) return null
  if (f.agl < HINT_LOW_AGL) return 'low'
  if (f.homeDist > HINT_MAX_DIST || Math.abs(f.homeRel) > HINT_MAX_BEARING) return null
  return f.offCentreline <= HINT_CORRIDOR ? 'follow' : 'lineup'
}
