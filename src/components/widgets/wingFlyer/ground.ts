/**
 * Wing Flyer ground contact — pure, React-free. Runs after every
 * `stepPlane` sub-step: decides what a touch of the ground MEANS (a landing,
 * a bounce or a crash — docs/wing-flyer.md §7), then, while the plane is on
 * the ground, holds it on the surface, levels the wings, limits the pitch to
 * what the gear allows, and applies rolling (wheels) or sliding (belly)
 * friction. Aerodynamics keep running, so a fast enough roll with the nose
 * raised lifts off by itself — the same physics for a take-off run, a
 * touch-and-go and a bounce.
 */
import type { AirframeId, AirframeSpec } from './airframes'
import type { Attitude, PlaneState } from './planeModel'
import { attitudeOf, quatFromEuler, stallSpeed } from './planeModel'
import type { IslandSpec } from './islandLayout'
import { isLandable, islandHeight, onStrip } from './islandLayout'

const DEG = Math.PI / 180

export interface GearSpec {
  /** CG height above the contact point (wheels / belly), metres. */
  height: number
  /** Pitch range allowed while on the ground (nose wheel / tail strike). */
  minPitch: number
  maxPitch: number
  /** Rolling deceleration on the runway / on grass, m/s². */
  decelStrip: number
  decelGrass: number
  /** Sideways velocity damping rate (wheels grip, a belly skids). */
  lateralGrip: number
  /** Touchdown attitude limits. */
  maxBank: number
  minTouchPitch: number
  maxTouchPitch: number
}

export const GEAR: Record<AirframeId, GearSpec> = {
  // Tricycle gear: sits level, rotates up to ~12° for take-off.
  trainer: {
    height: 0.22,
    minPitch: 0,
    maxPitch: 12 * DEG,
    decelStrip: 1.0,
    decelGrass: 1.8,
    lateralGrip: 12,
    maxBank: 15 * DEG,
    minTouchPitch: -5 * DEG,
    maxTouchPitch: 15 * DEG,
  },
  // Belly lander: skids to a stop.
  wing: {
    height: 0.06,
    minPitch: -3 * DEG,
    maxPitch: 10 * DEG,
    decelStrip: 2.5,
    decelGrass: 3.5,
    lateralGrip: 6,
    maxBank: 15 * DEG,
    minTouchPitch: -8 * DEG,
    maxTouchPitch: 20 * DEG,
  },
}

/** Sink rate (m/s) below which a touchdown is a landing… */
export const LAND_SINK = 2
/** …below which it bounces (score penalty, can still settle)… */
export const BOUNCE_SINK = 3.5
/** …and above which it is a crash. */
export const BOUNCE_REBOUND = 0.35
/** Below this ground speed (m/s) with the throttle idle, the plane has stopped. */
export const STOP_SPEED = 0.4

export type TouchResult = 'landed' | 'bounce' | 'crash'

export type GroundEvent =
  | { kind: 'touchdown'; result: TouchResult; sink: number; onRunway: boolean }
  | { kind: 'liftoff' }
  | { kind: 'stopped' }

export interface GroundState {
  onGround: boolean
  stopped: boolean
  /** Last touchdown, for the HUD / tests. */
  lastResult: TouchResult | null
  lastSink: number
}

export const createGroundState = (): GroundState => ({
  onGround: false,
  stopped: false,
  lastResult: null,
  lastSink: 0,
})

const _att: Attitude = { heading: 0, pitch: 0, bank: 0 }

/** Judge a touchdown from its sink rate, attitude and surface. */
export function classifyTouchdown(
  gear: GearSpec,
  sink: number,
  att: Attitude,
  landable: boolean,
): TouchResult {
  if (!landable) return 'crash'
  const attitudeOk =
    Math.abs(att.bank) <= gear.maxBank && att.pitch >= gear.minTouchPitch && att.pitch <= gear.maxTouchPitch
  if (sink < LAND_SINK && attitudeOk) return 'landed'
  if (sink < BOUNCE_SINK && Math.abs(att.bank) <= gear.maxBank * 1.7 && att.pitch >= gear.minTouchPitch - 5 * DEG) {
    return 'bounce'
  }
  return 'crash'
}

/** Put the plane on the ground at rest at (x, z) facing `heading`. */
export function placeOnGround(
  g: GroundState,
  s: PlaneState,
  airframe: AirframeId,
  island: IslandSpec,
  x: number,
  z: number,
  heading: number,
): void {
  const gear = GEAR[airframe]
  s.pos.x = x
  s.pos.z = z
  s.pos.y = islandHeight(island, x, z) + gear.height
  s.vel.x = s.vel.y = s.vel.z = 0
  quatFromEuler(heading, gear.minPitch, 0, s.q)
  s.cmdRoll = s.cmdPitch = s.cmdYaw = 0
  g.onGround = true
  g.stopped = true
}

/**
 * One ground sub-step. Returns the event this step produced (or null).
 * A 'crash' touchdown is reported, not resolved — the rig owns the tumble.
 */
export function stepGround(
  g: GroundState,
  s: PlaneState,
  spec: AirframeSpec,
  island: IslandSpec,
  dt: number,
): GroundEvent | null {
  const gear = GEAR[spec.id]
  const { x, z } = s.pos
  const h = islandHeight(island, x, z)
  const bottom = s.pos.y - gear.height

  if (!g.onGround) {
    if (bottom > h) return null
    attitudeOf(s.q, _att)
    const sink = Math.max(0, -s.vel.y)
    const result = classifyTouchdown(gear, sink, _att, isLandable(island, x, z))
    g.lastResult = result
    g.lastSink = sink
    const onRunway = onStrip(x, z)
    if (result === 'crash') return { kind: 'touchdown', result, sink, onRunway }
    s.pos.y = h + gear.height
    if (result === 'bounce') {
      s.vel.y = sink * BOUNCE_REBOUND
      return { kind: 'touchdown', result, sink, onRunway }
    }
    s.vel.y = 0
    g.onGround = true
    g.stopped = false
    return { kind: 'touchdown', result, sink, onRunway }
  }

  // --- on the ground ---
  // Lift-off: the wing is carrying the plane clear of the surface. (Only
  // snap back when the gear goes BELOW the surface — a climb of a few m/s
  // rises just centimetres per 120 Hz step.)
  if (bottom > h + 0.02 && s.vel.y > 0.2) {
    g.onGround = false
    g.stopped = false
    return { kind: 'liftoff' }
  }
  if (bottom < h) {
    s.pos.y = h + gear.height
    if (s.vel.y < 0) s.vel.y = 0
  }

  // Wings level, pitch within what the gear allows; heading free.
  attitudeOf(s.q, _att)
  const pitch = Math.min(gear.maxPitch, Math.max(gear.minPitch, _att.pitch))
  quatFromEuler(_att.heading, pitch, 0, s.q)
  s.cmdRoll = 0

  // Friction: split horizontal velocity into along-nose and sideways.
  const fx = Math.sin(_att.heading)
  const fz = -Math.cos(_att.heading)
  let along = s.vel.x * fx + s.vel.z * fz
  let side = s.vel.x * fz - s.vel.z * fx
  const decel = onStrip(x, z) ? gear.decelStrip : gear.decelGrass
  if (along > 0) along = Math.max(0, along - decel * dt)
  else along = Math.min(0, along + decel * dt)
  side *= Math.exp(-gear.lateralGrip * dt)
  s.vel.x = fx * along + fz * side
  s.vel.z = fz * along - fx * side

  const speed = Math.hypot(s.vel.x, s.vel.z)
  if (!g.stopped && speed < STOP_SPEED && s.throttle < 0.12) {
    g.stopped = true
    s.vel.x = s.vel.z = 0
    return { kind: 'stopped' }
  }
  if (g.stopped && speed > STOP_SPEED * 2) g.stopped = false
  return null
}

/** Rotation speed for a take-off run (m/s): 1.25 × stall. */
export const rotateSpeed = (spec: AirframeSpec) => stallSpeed(spec) * 1.25
