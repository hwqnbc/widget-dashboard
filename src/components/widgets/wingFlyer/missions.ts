/**
 * Landing missions — pure, React-free (Round 1b "Score it",
 * docs/wing-flyer.md §10 / §13). A mission is the Free Flight checklist
 * (objective.ts) plus ONE pass condition and, for two of them, a twist on
 * the Trainer: the five teach one skill each, in order —
 *
 *   1. first      take off, fly out, land on the runway
 *   2. circuit    …through all six approach hoops
 *   3. short      …and stop before the painted line
 *   4. crosswind  …with a steady wind across the strip (no lateral hold)
 *   5. engineout  fly out, climb to CUT_AGL, the motor cuts, glide back
 *
 * Every mission is scored by the one landing scorecard (scorecard.ts);
 * the pass condition only decides whether the score counts. `touchgo` is
 * the endless variant: no stars, a CHAIN of consecutive runway landings
 * scoring at least one star, broken by a crash, a weak landing or a stop.
 * `free` is the sandbox: the run object exists but never resolves.
 */
import type { AssistLevel } from './assists'
import type { GroundEvent } from './ground'
import type { Vec3 } from './planeModel'
import { nearerEnd } from './approach'
import { APPROACH_HOOPS, STRIP } from './islandLayout'
import type { LandingScore } from './scorecard'
import { STAR_1, scoreLanding } from './scorecard'

export type MissionId = 'first' | 'circuit' | 'short' | 'crosswind' | 'engineout'
export type PlayMode = 'free' | MissionId | 'touchgo'

export const MISSION_IDS: readonly MissionId[] = ['first', 'circuit', 'short', 'crosswind', 'engineout']
export const PLAY_MODES: readonly PlayMode[] = ['free', ...MISSION_IDS, 'touchgo']

export const coerceMode = (v: unknown): PlayMode | undefined =>
  (PLAY_MODES as readonly unknown[]).includes(v) ? (v as PlayMode) : undefined

/** Engine-out: the motor cuts once the plane is this high (AGL, m) AFTER
 * the fly-out — so the glide home is a real one (cut over the strip, the
 * plane has nowhere to lose its height). */
export const CUT_AGL = 35
/** Short field: the stop line, metres past the runway centre in the
 * landing direction (160 m from the threshold the plane came over — a
 * hands-off Trainer float rolls to ~170). */
export const STOP_LINE = 60
/** Crosswind: a steady wind ACROSS the runway (world m/s, +z). */
export const CROSSWIND: Vec3 = { x: 0, y: 0, z: 3 }

export interface MissionSpec {
  id: MissionId
  title: string
  /** One line for the menu row. */
  blurb: string
  /** The pass condition, for the scorecard panel. */
  goal: string
  wind?: Vec3
  /** The checklist needs the 150 m fly-out. */
  needsFlyout: boolean
  needsAllHoops?: boolean
  stopLine?: boolean
  cutAgl?: number
  /** The Trainer keeps its centreline (lateral) hold on the approach. */
  trainerLateralHold: boolean
}

export const MISSIONS: readonly MissionSpec[] = [
  {
    id: 'first',
    title: 'First flight',
    blurb: 'Take off, fly out, land on the runway',
    goal: 'Land on the runway after the fly-out',
    needsFlyout: true,
    trainerLateralHold: true,
  },
  {
    id: 'circuit',
    title: 'Circuit',
    blurb: 'Come in through all six hoops',
    goal: 'Pass every hoop on the way in',
    needsFlyout: true,
    needsAllHoops: true,
    trainerLateralHold: true,
  },
  {
    id: 'short',
    title: 'Short field',
    blurb: 'Stop before the painted line',
    goal: 'Touch down and stop before the line',
    needsFlyout: true,
    stopLine: true,
    trainerLateralHold: true,
  },
  {
    id: 'crosswind',
    title: 'Crosswind',
    blurb: 'A steady wind across the strip — hold the centreline yourself',
    goal: 'Land on the runway in the crosswind',
    wind: CROSSWIND,
    needsFlyout: true,
    trainerLateralHold: false,
  },
  {
    id: 'engineout',
    title: 'Engine out',
    blurb: `Fly out, climb to ${CUT_AGL} m — the motor cuts. Glide home`,
    goal: 'Glide back and land on the runway with no motor',
    needsFlyout: true,
    cutAgl: CUT_AGL,
    trainerLateralHold: true,
  },
]

/** The game modes of the start screen; only Landing exists yet (§10). */
export const GAME_MODES = [
  { id: 'landing', label: 'Landing', ready: true },
  { id: 'rings', label: 'Rings', ready: false },
  { id: 'soaring', label: 'Soaring', ready: false },
  { id: 'combat', label: 'Combat', ready: false },
] as const

export const BADGE_LETTER: Record<AssistLevel, string> = { trainer: 'T', normal: 'N', acro: 'A' }

/** Mission `i` is open: the first, unlock-all, or the previous one starred
 * (`stars` = the records' per-mission stars). */
export const missionUnlocked = (i: number, stars: Record<string, number>, unlockAll: boolean): boolean =>
  unlockAll || i === 0 || (stars[MISSIONS[i - 1].id] ?? 0) >= 1

export const missionById = (id: MissionId): MissionSpec => MISSIONS.find((m) => m.id === id) as MissionSpec
export const isMission = (mode: PlayMode): mode is MissionId => (MISSION_IDS as readonly string[]).includes(mode)
export const missionIndex = (id: MissionId) => MISSION_IDS.indexOf(id)
export const nextMission = (id: MissionId): MissionId | null => MISSION_IDS[missionIndex(id) + 1] ?? null

/** x of the short-field stop line for a landing onto `end`. */
export const stopLineX = (end: -1 | 1) => STRIP.x - end * STOP_LINE

/** Assist badge: the lowest level used during a run; harder wins ties. */
export const ASSIST_RANK: Record<AssistLevel, number> = { trainer: 0, normal: 1, acro: 2 }
export const easierAssist = (a: AssistLevel, b: AssistLevel): AssistLevel => (ASSIST_RANK[a] <= ASSIST_RANK[b] ? a : b)
export const harderAssist = (a: AssistLevel, b: AssistLevel): AssistLevel => (ASSIST_RANK[a] >= ASSIST_RANK[b] ? a : b)

export type MissionOutcome = 'flying' | 'done' | 'fail'
export type FailReason = 'crash' | 'grass' | 'early' | 'hoops' | 'overrun' | null

export interface MissionRun {
  mode: PlayMode
  outcome: MissionOutcome
  fail: FailReason
  /** Engine-out: the climb target reached → the motor is dead. */
  motorOut: boolean
  /** Bounces since the last clean touchdown. */
  bounces: number
  /** The run's (first) landing, scored. */
  landing: LandingScore | null
  landingEnd: -1 | 1
  landingOnRunway: boolean
  /** Where the roll-out stopped (x), NaN until it has. */
  stopX: number
  score: number
  stars: 0 | 1 | 2 | 3
  /** The lowest assist level flown during the run (the badge). */
  badge: AssistLevel
  /** Touch-and-go: the live chain and the run's best. */
  chain: number
  bestChain: number
  /** Touch-and-go: why the last chain broke (for the panel), or null. */
  chainBreak: 'weak' | 'grass' | 'crash' | 'stop' | null
}

export const createMissionRun = (mode: PlayMode = 'free'): MissionRun => ({
  mode,
  outcome: 'flying',
  fail: null,
  motorOut: false,
  bounces: 0,
  landing: null,
  landingEnd: -1,
  landingOnRunway: false,
  stopX: Number.NaN,
  score: 0,
  stars: 0,
  badge: 'acro',
  chain: 0,
  bestChain: 0,
  chainBreak: null,
})

/** A fresh run of the same mode (a new launch / retry). */
export function resetMissionRun(r: MissionRun, mode: PlayMode = r.mode): void {
  r.mode = mode
  r.outcome = 'flying'
  r.fail = null
  r.motorOut = false
  r.bounces = 0
  r.landing = null
  r.landingEnd = -1
  r.landingOnRunway = false
  r.stopX = Number.NaN
  r.score = 0
  r.stars = 0
  r.badge = 'acro'
  r.chain = 0
  r.bestChain = 0
  r.chainBreak = null
}

/** The wind a mode flies in (undefined = calm). */
export const modeWind = (mode: PlayMode): Vec3 | undefined => (isMission(mode) ? missionById(mode).wind : undefined)
/** Whether the Free Flight checklist's fly-out step applies in `mode`. */
export const modeNeedsFlyout = (mode: PlayMode): boolean => (isMission(mode) ? missionById(mode).needsFlyout : mode === 'free')
/** Whether the Trainer's lateral (centreline) hold is on in `mode`. */
export const modeLateralHold = (mode: PlayMode): boolean => (isMission(mode) ? missionById(mode).trainerLateralHold : true)

export interface MissionFacts {
  level: AssistLevel
  airborne: boolean
  agl: number
  /** The checklist (objective.ts) as it stands after this step. */
  takeoff: boolean
  flyout: boolean
  /** Hoops passed / in play on the active approach. */
  hoopsPassed: number
  hoopsInPlay: number
  /** This step's ground event, if any. */
  event: GroundEvent | null
  crashed: boolean
  x: number
  z: number
  heading: number
}

/**
 * One step of the mission: tracks the badge, the engine cut, bounces, the
 * landing score, and resolves the run on a crash or a stop. Returns true
 * when something the panel/chip shows changed.
 */
export function stepMission(r: MissionRun, f: MissionFacts): boolean {
  if (r.mode === 'free' || r.outcome !== 'flying') return false
  let changed = false
  if (f.airborne && ASSIST_RANK[f.level] < ASSIST_RANK[r.badge]) {
    r.badge = f.level
    changed = true
  }
  const spec = isMission(r.mode) ? missionById(r.mode) : null

  if (spec?.cutAgl !== undefined && !r.motorOut && f.airborne && f.flyout && f.agl >= spec.cutAgl) {
    r.motorOut = true
    changed = true
  }

  if (f.crashed) {
    if (r.mode === 'touchgo') {
      r.chain = 0
      r.chainBreak = 'crash'
    } else {
      r.fail = 'crash'
    }
    r.outcome = 'fail'
    return true
  }

  const ev = f.event
  if (ev?.kind === 'touchdown' && ev.result === 'bounce') {
    r.bounces++
    changed = true
  }
  if (ev?.kind === 'touchdown' && ev.result === 'landed') {
    const end = nearerEnd(f.heading)
    const landing = scoreLanding({ x: f.x, z: f.z, end, sink: ev.sink, onRunway: ev.onRunway, bounces: r.bounces })
    r.bounces = 0
    if (r.mode === 'touchgo') {
      r.landing = landing
      r.landingEnd = end
      r.landingOnRunway = ev.onRunway
      r.score = landing.score
      if (ev.onRunway && landing.score >= STAR_1) {
        r.chain++
        r.bestChain = Math.max(r.bestChain, r.chain)
        r.chainBreak = null
      } else {
        r.chain = 0
        r.chainBreak = ev.onRunway ? 'weak' : 'grass'
      }
      return true
    }
    if (r.landing === null) {
      r.landing = landing
      r.landingEnd = end
      r.landingOnRunway = ev.onRunway
      changed = true
    }
  }

  if (ev?.kind === 'stopped') {
    r.stopX = f.x
    if (r.mode === 'touchgo') {
      // A stop ends the chain; the run's best is what gets recorded.
      r.chain = 0
      r.chainBreak = 'stop'
      r.outcome = 'done'
      return true
    }
    r.outcome = 'done'
    r.fail = judge(r, spec as MissionSpec, f)
    if (r.fail !== null) r.outcome = 'fail'
    else {
      r.score = r.landing?.score ?? 0
      r.stars = r.landing?.stars ?? 0
    }
    return true
  }
  return changed
}

/** The pass condition, judged at the stop. */
function judge(r: MissionRun, spec: MissionSpec, f: MissionFacts): FailReason {
  if (r.landing === null || !r.landingOnRunway) return 'grass'
  if (spec.needsFlyout && !f.flyout) return 'early'
  if (spec.cutAgl !== undefined && !r.motorOut) return 'early'
  if (spec.needsAllHoops && (f.hoopsInPlay < APPROACH_HOOPS || f.hoopsPassed < APPROACH_HOOPS)) return 'hoops'
  if (spec.stopLine && (r.stopX - stopLineX(r.landingEnd)) * -r.landingEnd > 0) return 'overrun'
  return null
}

/** The words for a fail reason (short — the panel is small). */
export function failWords(reason: FailReason, mode: PlayMode): string {
  switch (reason) {
    case 'crash':
      return 'Crashed'
    case 'grass':
      return 'Landed on the grass — the runway counts'
    case 'early':
      return mode === 'engineout' ? `Landed before the motor cut — fly out and climb to ${CUT_AGL} m first` : 'Landed before the fly-out — fly out 150 m first'
    case 'hoops':
      return 'Missed a hoop — pass all six'
    case 'overrun':
      return 'Rolled past the line — touch down earlier, land slower'
    default:
      return ''
  }
}

export interface ChecklistStep {
  key: string
  label: string
  done: boolean
}

/**
 * The chip's checklist for a mode, from the run and the Free Flight
 * checklist facts. Free Flight keeps its own three steps.
 */
/** What the checklist needs of a run (the body passes a plain snapshot). */
export type ChecklistRun = Pick<MissionRun, 'mode' | 'outcome' | 'motorOut' | 'chain'> & { landing: object | null }

export function missionChecklist(
  r: ChecklistRun,
  o: { takeoff: boolean; flyout: boolean; land: boolean; runway: boolean },
  hoops: { passed: number; inPlay: number },
): ChecklistStep[] {
  const landed = r.landing !== null
  switch (r.mode) {
    case 'circuit':
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'flyout', label: 'Fly out', done: o.flyout },
        { key: 'hoops', label: `Hoops ${hoops.passed}/${APPROACH_HOOPS}`, done: hoops.passed >= APPROACH_HOOPS },
        { key: 'land', label: 'Land', done: landed },
      ]
    case 'short':
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'flyout', label: 'Fly out', done: o.flyout },
        { key: 'land', label: 'Land', done: landed },
        { key: 'stop', label: 'Stop before the line', done: r.outcome === 'done' },
      ]
    case 'crosswind':
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'flyout', label: 'Fly out', done: o.flyout },
        { key: 'land', label: 'Land · wind ↓', done: landed },
      ]
    case 'engineout':
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'flyout', label: 'Fly out', done: o.flyout },
        { key: 'climb', label: r.motorOut ? 'Motor out!' : `Climb to ${CUT_AGL} m`, done: r.motorOut },
        { key: 'land', label: 'Glide home · land', done: landed },
      ]
    case 'touchgo':
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'land', label: 'Land', done: landed && r.chain > 0 },
        { key: 'chain', label: `Chain ×${r.chain}`, done: false },
      ]
    default:
      // Free Flight: the run never resolves, so the checklist's own facts.
      return [
        { key: 'takeoff', label: 'Take off', done: o.takeoff },
        { key: 'flyout', label: 'Fly out', done: o.flyout },
        { key: 'land', label: o.land && o.runway ? 'Land · Runway!' : 'Land', done: o.land },
      ]
  }
}
