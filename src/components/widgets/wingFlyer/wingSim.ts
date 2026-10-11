/**
 * The one shared Wing Flyer sim object (lesson #41) and the pure step that
 * drives it: assist → flight model → ground contact → buildings, plus the
 * phase machine (preflight → flying → landed / crashed). Created once by
 * the body, stepped by the rig every fixed sub-step, read by the DOM layer —
 * and stepped directly by the node suites, so tests fly the exact code the
 * game flies.
 */
import type { AirframeId } from './airframes'
import { AIRFRAMES } from './airframes'
import type { AssistLevel, AssistSticks, AssistState } from './assists'
import { createAssist, setAssistMode, startLaunch, startRollout, startRunway, stepAssist } from './assists'
import type { GroundEvent, GroundState } from './ground'
import { GEAR, createGroundState, placeOnGround, stepGround } from './ground'
import type { IslandSpec } from './islandLayout'
import { PILOT, STRIP, STRIP_Y, WORLD_HALF, isLandable, islandHeight, landingHeading } from './islandLayout'
import type { PlaneCommand, PlaneState, StepOptions } from './planeModel'
import { createPlaneState, forwardOf, quatFromEuler, stallSpeed, stepPlane } from './planeModel'
import type { ObjectiveState } from './objective'
import { createObjective, resetObjective, stepObjective } from './objective'
import type { ApproachState } from './approach'
import { createApproach, onLine, passedCount, resetApproach, slopeTarget, stepApproach } from './approach'

export type Phase = 'preflight' | 'flying' | 'landed' | 'crashed'
export type StartKind = 'hand' | 'runway'

export interface WingSim {
  s: PlaneState
  a: AssistState
  g: GroundState
  cmd: PlaneCommand
  opts: StepOptions
  sticks: AssistSticks
  /** Fixed-step accumulator carry. */
  acc: number
  phase: Phase
  /** How the current flight started / will start. */
  start: StartKind
  /** Seconds left in the crash tumble. */
  crashTimer: number
  /** Auto-pause (widget hidden / blurred / dialog open): no stepping. */
  paused: boolean
  /** Requests from the DOM layer, consumed by the rig. */
  resetRequested: StartKind | null
  launchRequested: boolean
  /** Session tallies (test contract). */
  crashes: number
  landings: number
  /** Last ground event and a counter that bumps with each one. */
  lastEvent: GroundEvent | null
  eventSeq: number
  /** Free Flight's standing goal (objective.ts); bumps `objectiveSeq` on
   * every change so the DOM layer re-renders the chip only then. */
  objective: ObjectiveState
  objectiveSeq: number
  /** The approach: active runway end + hoop tally (approach.ts). */
  approach: ApproachState
  /** Lined up on the active approach this step (hints, slope hold). */
  linedUp: boolean
  /** Previous step's x, for hoop crossings. */
  prevX: number
}

export function createWingSim(): WingSim {
  return {
    s: createPlaneState(),
    a: createAssist(),
    g: createGroundState(),
    cmd: { roll: 0, pitch: 0, yaw: 0, throttle: 0 },
    opts: {},
    sticks: { left: { x: 0, y: -1 }, right: { x: 0, y: 0 } },
    acc: 0,
    phase: 'preflight',
    start: 'hand',
    crashTimer: 0,
    paused: false,
    resetRequested: 'hand',
    launchRequested: false,
    crashes: 0,
    landings: 0,
    lastEvent: null,
    eventSeq: 0,
    objective: createObjective(),
    objectiveSeq: 0,
    approach: createApproach(),
    linedUp: false,
    prevX: 0,
  }
}

/** Seconds of crash tumble before the respawn. */
export const CRASH_TIME = 0.9
/** Where the plane is held for a hand launch: the pilot's raised hand. */
export const HAND = { x: PILOT.x + 0.35, y: STRIP_Y + 1.75, z: PILOT.z - 0.2 } as const
/** Hand-launch throw speed, × stall speed. */
export const THROW_SPEED = 1.15
/** Runway start: a few metres in from the west threshold, facing east. */
export const RUNWAY_START = { x: STRIP.x - STRIP.length / 2 + 6, z: STRIP.z } as const

/** Put the plane back at a start: in the pilot's hand, or (wheels only) on
 * the runway threshold. The wing has no wheels → always the hand. */
export function resetSim(sim: WingSim, airframe: AirframeId, island: IslandSpec, start: StartKind): void {
  const spec = AIRFRAMES[airframe]
  const kind: StartKind = start === 'runway' && spec.wheels ? 'runway' : 'hand'
  const s = sim.s
  sim.start = kind
  sim.acc = 0
  sim.crashTimer = 0
  sim.launchRequested = false
  s.cmdRoll = s.cmdPitch = s.cmdYaw = 0
  sim.g = createGroundState()
  resetObjective(sim.objective)
  resetApproach(sim.approach)
  sim.linedUp = false
  sim.objectiveSeq++
  setAssistMode(sim.a, 'fly')
  if (kind === 'runway') {
    placeOnGround(sim.g, s, airframe, island, RUNWAY_START.x, RUNWAY_START.z, STRIP.heading)
    startRunway(sim.a, STRIP.heading)
    s.throttle = 0
    sim.phase = 'flying'
  } else {
    holdInHand(sim)
    sim.phase = 'preflight'
  }
}

/** Preflight: the plane sits in the pilot's hand, nose east, level. */
export function holdInHand(sim: WingSim): void {
  const s = sim.s
  s.pos.x = HAND.x
  s.pos.y = HAND.y
  s.pos.z = HAND.z
  s.vel.x = s.vel.y = s.vel.z = 0
  quatFromEuler(STRIP.heading, 0, 0, s.q)
  s.airspeed = 0
  s.throttle = 0
}

const _f = { x: 0, y: 0, z: 0 }

/** Throw the plane from the hand and start the launch autopilot. */
export function launchSim(sim: WingSim, airframe: AirframeId): void {
  const s = sim.s
  const v = stallSpeed(AIRFRAMES[airframe]) * THROW_SPEED
  forwardOf(s.q, _f)
  s.vel.x = _f.x * v
  s.vel.y = _f.y * v + 0.6
  s.vel.z = _f.z * v
  startLaunch(sim.a)
  sim.phase = 'flying'
}

/** Ground or rooftop contact with a building (plane as a point + margin). */
export function hitsBuilding(island: IslandSpec, s: PlaneState): boolean {
  const { x, y, z } = s.pos
  for (const b of island.buildings) {
    if (Math.abs(x - b.x) < b.hw + 0.4 && Math.abs(z - b.z) < b.hd + 0.4 && y < b.y + b.h + 0.3) return true
  }
  return false
}

function crash(sim: WingSim) {
  sim.phase = 'crashed'
  sim.crashTimer = CRASH_TIME
  sim.crashes++
}

/**
 * One fixed physics sub-step while flying (or rolling). Handles every
 * ground event and phase change; returns the event (or null).
 */
export function stepSim(
  sim: WingSim,
  level: AssistLevel,
  airframe: AirframeId,
  island: IslandSpec,
  h: number,
): GroundEvent | null {
  if (sim.phase !== 'flying' && sim.phase !== 'landed') return null
  const s = sim.s
  const spec = AIRFRAMES[airframe]
  const ground = islandHeight(island, s.pos.x, s.pos.z)
  const agl = s.pos.y - GEAR[airframe].height - ground
  const outside = Math.hypot(s.pos.x, s.pos.z) > WORLD_HALF
  forwardOf(s.q, _f)
  const heading = Math.atan2(_f.x, -_f.z)
  let homeRel = 0
  if (outside) {
    const bearing = Math.atan2(STRIP.x - s.pos.x, -(STRIP.z - s.pos.z))
    homeRel = Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading))
  }
  const o0 = sim.objective
  const landStep = o0.takeoff && o0.flyout && !o0.land
  sim.linedUp = landStep && !sim.g.onGround && onLine(sim.approach, { z: s.pos.z, heading })
  const slopeY = sim.linedUp ? slopeTarget(sim.approach, s.pos.x) : Number.NaN
  stepAssist(
    sim.a,
    level,
    s,
    spec,
    sim.sticks,
    {
      agl,
      onGround: sim.g.onGround,
      landable: isLandable(island, s.pos.x, s.pos.z),
      outside,
      homeRel,
      slopeY,
      slopeZ: STRIP.z,
      slopeHeading: sim.approach.end === null ? undefined : landingHeading(sim.approach.end),
      heading,
    },
    h,
    sim.cmd,
    sim.opts,
  )
  stepPlane(s, spec, sim.cmd, h, sim.opts)
  const ev = stepGround(sim.g, s, spec, island, h)
  if (ev) {
    sim.lastEvent = ev
    sim.eventSeq++
    if (ev.kind === 'touchdown') {
      if (ev.result === 'crash') crash(sim)
      else if (ev.result === 'landed') {
        sim.landings++
        startRollout(sim.a, s)
      }
    } else if (ev.kind === 'stopped') {
      sim.phase = 'landed'
    }
  }
  if (sim.phase === 'landed' && !sim.g.stopped) sim.phase = 'flying'
  softBoundary(s, h)
  // The standing objective, from this step's facts.
  const o = sim.objective
  const before = o.takeoff + ':' + o.flyout + ':' + o.back + ':' + o.land
  stepObjective(o, {
    airborne: !sim.g.onGround && (sim.phase as Phase) !== 'crashed',
    homeDist: Math.hypot(s.pos.x - STRIP.x, s.pos.z - STRIP.z),
    touchdown: ev && ev.kind === 'touchdown' ? { result: ev.result, sink: ev.sink, onRunway: ev.onRunway } : null,
  })
  if (before !== o.takeoff + ':' + o.flyout + ':' + o.back + ':' + o.land) sim.objectiveSeq++
  // The approach (end choice + hoop tally) follows the objective's land step.
  const passedBefore = passedCount(sim.approach)
  const endBefore = sim.approach.end
  const scored = stepApproach(
    sim.approach,
    { landStep: o.takeoff && o.flyout && !o.land, airborne: !sim.g.onGround, x: s.pos.x, y: s.pos.y, z: s.pos.z, heading },
    sim.prevX,
  )
  sim.prevX = s.pos.x
  if (scored || passedCount(sim.approach) !== passedBefore || endBefore !== sim.approach.end) sim.objectiveSeq++
  if ((sim.phase as Phase) !== 'crashed' && hitsBuilding(island, s)) crash(sim)
  return ev
}

/** Beyond the island the air turns the plane back: a gentle push toward the
 * centre past WORLD_HALF, never an invisible wall. Trainer/Normal also bank
 * home (assists' steer-back) and the HUD warns "TURN BACK". */
export const BOUNDARY_PUSH = 3
function softBoundary(s: PlaneState, h: number) {
  const r = Math.hypot(s.pos.x, s.pos.z)
  if (r <= WORLD_HALF) return
  const k = (BOUNDARY_PUSH * Math.min(1, (r - WORLD_HALF) / 60) * h) / r
  s.vel.x -= s.pos.x * k
  s.vel.z -= s.pos.z * k
}

/** The crash tumble: fall and skid to rest, then respawn by hand launch. */
export function stepCrash(sim: WingSim, airframe: AirframeId, island: IslandSpec, dt: number): void {
  const s = sim.s
  sim.crashTimer -= dt
  s.vel.y -= 9.81 * dt
  s.vel.x *= Math.exp(-3 * dt)
  s.vel.z *= Math.exp(-3 * dt)
  s.pos.x += s.vel.x * dt
  s.pos.z += s.vel.z * dt
  s.pos.y = Math.max(islandHeight(island, s.pos.x, s.pos.z) + 0.2, s.pos.y + s.vel.y * dt)
  if (sim.crashTimer <= 0) resetSim(sim, airframe, island, 'hand')
}
