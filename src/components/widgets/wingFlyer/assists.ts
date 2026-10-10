/**
 * Wing Flyer assists — the outer loops that turn stick positions into the
 * `PlaneCommand` (target body rates + throttle) the flight model flies.
 * Pure, React-free, mutate-in-place; called once per fixed physics step.
 *
 * The three levels (docs/wing-flyer.md §4), modelled on real flight
 * controllers:
 * - **Trainer** (Horizon SAFE Beginner): the right stick sets bank/pitch
 *   ANGLE inside a small envelope; release levels the wings and holds
 *   altitude; throttle is an automatic airspeed hold (the left stick only
 *   nudges the target speed); stall-proof (pitch-up refused near the stall).
 * - **Normal** (ArduPlane FBWA + STALL_PREVENTION): angle command with a
 *   wider envelope; the bank limit shrinks toward 25° as airspeed nears the
 *   turn's stall speed; manual throttle; a hard pull can still stall it.
 * - **Acro**: the stick sets roll/pitch RATE; a centred stick holds the
 *   attitude (loops, rolls, inverted); manual throttle and (trainer)
 *   rudder; stalls can drop a wing.
 *
 * Plus the modes every level shares: **Panic** (wings level, nose +10°,
 * full power for PANIC_TIME, then hand back) and the **hand-launch**
 * autopilot (INAV-style: motor after a beat, wings-level climb until a
 * hand-over height or time, early hand-over on right-stick input).
 */
import type { AirframeSpec } from './airframes'
import {
  GRAVITY,
  attitudeOf,
  stallSpeed,
  type Attitude,
  type PlaneCommand,
  type PlaneState,
  type StepOptions,
} from './planeModel'

export type AssistLevel = 'trainer' | 'normal' | 'acro'

export const ASSIST_LEVELS: readonly AssistLevel[] = ['trainer', 'normal', 'acro']

export const coerceAssist = (v: unknown): AssistLevel | undefined =>
  v === 'trainer' || v === 'normal' || v === 'acro' ? v : undefined

/** Sticks, each axis −1..1 (Mode 2). `left.y` is the LATCHING throttle
 * stick (−1 = idle, +1 = full); `left.x` rudder; `right` pitch (y, + = pull
 * back = nose up) and roll (x, + = right). */
export interface AssistSticks {
  left: { x: number; y: number }
  right: { x: number; y: number }
}

/** What the assist is doing right now. */
export type AssistMode = 'fly' | 'panic' | 'launch'

export interface AssistState {
  mode: AssistMode
  /** Seconds in the current mode. */
  timer: number
  /** Altitude being held (Trainer, stick released), metres; NaN = none. */
  holdAlt: number
  /** Pitch-loop integrator. */
  pitchI: number
  /** Airspeed-loop integrator (Trainer auto-throttle). */
  speedI: number
  /** The attitude read this step (exposed for the HUD / tests). */
  att: Attitude
}

const DEG = Math.PI / 180

/** Envelopes per level. */
export const TRAINER_BANK = 35 * DEG
export const TRAINER_PITCH = 20 * DEG
export const NORMAL_BANK = 60 * DEG
export const NORMAL_PITCH = 35 * DEG
/** STALL_PREVENTION never limits bank below this (ArduPlane's floor). */
export const MIN_PROTECTED_BANK = 25 * DEG
/** Airspeed margin the bank limiter keeps above the turn's stall speed. */
export const BANK_SPEED_MARGIN = 1.2
/** Trainer refuses nose-up once α is within this of the critical angle. */
export const TRAINER_AOA_MARGIN = 3 * DEG
export const STICK_DEADZONE = 0.06
export const PANIC_TIME = 2
export const PANIC_PITCH = 10 * DEG
/** Hand launch (INAV-style): motor beat, climb angle, hand-over. */
export const LAUNCH_MOTOR_DELAY = 0.3
export const LAUNCH_CLIMB = 15 * DEG
export const LAUNCH_HANDOVER_AGL = 15
export const LAUNCH_MAX_TIME = 3
/** Right-stick deflection that takes control back during a launch. */
export const LAUNCH_ABORT_STICK = 0.3

export function createAssist(): AssistState {
  return {
    mode: 'fly',
    timer: 0,
    holdAlt: Number.NaN,
    pitchI: 0,
    speedI: 0,
    att: { heading: 0, pitch: 0, bank: 0 },
  }
}

/** Enter a mode (resets its timer and the loop integrators). */
export function setAssistMode(a: AssistState, mode: AssistMode): void {
  a.mode = mode
  a.timer = 0
  a.pitchI = 0
  a.holdAlt = Number.NaN
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const dead = (v: number) => (Math.abs(v) < STICK_DEADZONE ? 0 : v)
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * The bank limit STALL_PREVENTION allows at this airspeed: a turn at bank φ
 * loads the wing to n = 1/cosφ and raises the stall speed by √n, so keep
 * v ≥ BANK_SPEED_MARGIN · v_s · √n — but never below MIN_PROTECTED_BANK.
 */
export function protectedBank(spec: AirframeSpec, airspeed: number, maxBank: number): number {
  const vs = stallSpeed(spec) * BANK_SPEED_MARGIN
  const nMax = (airspeed / vs) ** 2
  const phi = nMax > 1 ? Math.acos(1 / nMax) : 0
  return clamp(phi, MIN_PROTECTED_BANK, maxBank)
}

/** Body rates that steer toward a target bank and pitch attitude — the
 * angle-mode inner loop shared by Trainer, Normal, Panic and launch. */
function attitudeRates(
  a: AssistState,
  s: PlaneState,
  bankT: number,
  pitchT: number,
  dt: number,
  out: PlaneCommand,
) {
  const { bank, pitch } = a.att
  out.roll = 4 * wrapPi(bankT - bank)
  // Pitch only means "up" while roughly upright; inverted, roll first.
  const upright = Math.abs(bank) < 70 * DEG
  if (!upright) {
    out.pitch = 0
    a.pitchI = 0
  } else {
    const e = pitchT - pitch
    a.pitchI = clamp(a.pitchI + e * dt * 2, -0.6, 0.6)
    const cb = Math.max(0.35, Math.cos(bank))
    // Feed-forward: holding the nose on the horizon in a bank needs a
    // steady body pitch rate g·sin²φ / (V·cosφ).
    const ff = (GRAVITY * Math.sin(bank) ** 2) / (Math.max(s.airspeed, 4) * cb)
    out.pitch = (3 * e + a.pitchI) / cb + ff
  }
  out.yaw = 0
}

/** Pitch attitude that holds altitude `alt`, radians: the flight-path angle
 * for a climb rate proportional to the altitude error, corrected by the
 * vertical-speed error (the attitude loop's integrator finds the trim). */
function altHoldPitch(s: PlaneState, alt: number): number {
  const vsT = clamp(0.6 * (alt - s.pos.y), -2.5, 2.5)
  const v = Math.max(s.airspeed, 4)
  return Math.asin(clamp(vsT / v, -0.5, 0.5)) + 0.04 * (vsT - s.vel.y)
}

/**
 * One assist step: read sticks, write `out` (the command for `stepPlane`)
 * and `opts` (Acro's attitude hold / wing drop). `agl` is height above the
 * ground under the plane, metres.
 */
export function stepAssist(
  a: AssistState,
  level: AssistLevel,
  s: PlaneState,
  spec: AirframeSpec,
  sticks: AssistSticks,
  agl: number,
  dt: number,
  out: PlaneCommand,
  opts: StepOptions,
): void {
  attitudeOf(s.q, a.att)
  a.timer += dt
  const vs = stallSpeed(spec)
  const rx = dead(sticks.right.x)
  const ry = dead(sticks.right.y)
  const manualThrottle = clamp((sticks.left.y + 1) / 2, 0, 1)
  opts.pitchStability = 1
  opts.wingDrop = false

  // --- shared modes --------------------------------------------------------
  if (a.mode === 'panic') {
    attitudeRates(a, s, 0, PANIC_PITCH, dt, out)
    out.throttle = 1
    if (a.timer >= PANIC_TIME) setAssistMode(a, 'fly')
    return
  }
  if (a.mode === 'launch') {
    attitudeRates(a, s, 0, LAUNCH_CLIMB, dt, out)
    out.throttle = a.timer >= LAUNCH_MOTOR_DELAY ? 1 : 0
    const stickTaken = Math.abs(sticks.right.x) > LAUNCH_ABORT_STICK || Math.abs(sticks.right.y) > LAUNCH_ABORT_STICK
    if (agl >= LAUNCH_HANDOVER_AGL || a.timer >= LAUNCH_MAX_TIME || stickTaken) {
      setAssistMode(a, 'fly')
    }
    return
  }

  // --- Acro: rate command --------------------------------------------------
  if (level === 'acro') {
    out.roll = rx * spec.maxRoll
    out.pitch = ry * spec.maxPitch
    out.yaw = spec.rudder ? dead(sticks.left.x) * spec.maxYaw : 0
    out.throttle = manualThrottle
    opts.pitchStability = 0
    opts.wingDrop = true
    a.holdAlt = Number.NaN
    return
  }

  // --- Normal: angle command, bank limited near the stall -------------------
  if (level === 'normal') {
    const maxBank = protectedBank(spec, s.airspeed, NORMAL_BANK)
    attitudeRates(a, s, rx * maxBank, ry * NORMAL_PITCH, dt, out)
    out.throttle = manualThrottle
    a.holdAlt = Number.NaN
    return
  }

  // --- Trainer: small envelope, altitude + airspeed hold, stall-proof -------
  const maxBank = Math.min(TRAINER_BANK, protectedBank(spec, s.airspeed, TRAINER_BANK))
  let pitchT: number
  if (ry === 0) {
    if (Number.isNaN(a.holdAlt)) a.holdAlt = s.pos.y
    pitchT = altHoldPitch(s, a.holdAlt)
  } else {
    a.holdAlt = Number.NaN
    pitchT = ry * TRAINER_PITCH
  }
  // Stall-proof: nose-up authority fades out near the stall speed …
  const speedRoom = clamp((s.airspeed - vs * 1.1) / (vs * 0.4), 0, 1)
  if (pitchT > 0) pitchT *= speedRoom
  pitchT = clamp(pitchT, -TRAINER_PITCH, TRAINER_PITCH)
  attitudeRates(a, s, rx * maxBank, pitchT, dt, out)
  // … and the pitch command is clipped before α reaches the stall.
  const aoaLimit = spec.alphaCrit - TRAINER_AOA_MARGIN
  if (s.aoa > aoaLimit) out.pitch = Math.min(out.pitch, -4 * (s.aoa - aoaLimit))

  // Auto-throttle: hold a target airspeed the left stick nudges between a
  // safe slow speed and a little above cruise.
  const cruise = spec.vAuthority
  const lo = vs * 1.45
  const hi = cruise * 1.25
  const ly = dead(sticks.left.y)
  const vT = ly >= 0 ? cruise + ly * (hi - cruise) : cruise + ly * (cruise - lo)
  const err = vT - s.airspeed
  a.speedI = clamp(a.speedI + err * dt * 0.08, -0.6, 0.6)
  out.throttle = clamp(0.35 + 0.12 * err + a.speedI + 1.2 * Math.max(0, a.att.pitch), 0, 1)
}

/** Enter Panic from any mode/level. */
export const triggerPanic = (a: AssistState) => setAssistMode(a, 'panic')
/** Enter the hand-launch autopilot (the plane has just left the hand). */
export const startLaunch = (a: AssistState) => setAssistMode(a, 'launch')
