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
  authority,
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
/** `runway`: take-off roll (Trainer drives it); `rollout`: on the ground
 * after a touchdown (Trainer brakes and keeps straight). */
export type AssistMode = 'fly' | 'panic' | 'launch' | 'runway' | 'rollout'

/** Where the plane is, as the assist needs to know it. */
export interface AssistEnv {
  /** Height above the ground under the plane, metres. */
  agl: number
  onGround: boolean
  /** The ground below is somewhere a plane can touch down. */
  landable: boolean
}

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
  /** Heading to hold on the runway / roll-out, radians. */
  runwayHeading: number
}

const DEG = Math.PI / 180

/** Envelopes per level. */
/** 45° (not SAFE's tighter envelope): play-testing showed a 35° Trainer
 * turned too wide to line up with the runway. */
export const TRAINER_BANK = 45 * DEG
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
export const LAUNCH_MAX_TIME = 6
/** Right-stick deflection that takes control back during a launch… */
export const LAUNCH_ABORT_STICK = 0.3
/** …but only after this long — a thumb already resting on the stick when
 * Launch is pressed must not cancel the climb-out (stale-touch guard). */
export const LAUNCH_ABORT_GRACE = 0.5
/** Trainer auto-flare: below this height the descent rate is limited… */
export const FLARE_AGL = 6
/** …to this (m/s) at the ground, easing to FLARE_SINK_HIGH at FLARE_AGL. */
export const FLARE_SINK_LOW = 0.5
export const FLARE_SINK_HIGH = 2
/** Throttle-stick position (−1..1) that turns a Trainer roll-out into a
 * touch-and-go. */
export const GO_AROUND_STICK = 0.5
/** Below this height while descending, the Trainer flies approach speed. */
export const APPROACH_AGL = 20

export function createAssist(): AssistState {
  return {
    mode: 'fly',
    timer: 0,
    holdAlt: Number.NaN,
    pitchI: 0,
    speedI: 0,
    att: { heading: 0, pitch: 0, bank: 0 },
    runwayHeading: 0,
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
  spec: AirframeSpec,
  bankT: number,
  pitchT: number,
  dt: number,
  out: PlaneCommand,
) {
  const { bank, pitch } = a.att
  // Airspeed scaling (what real flight controllers do): the model shrinks a
  // rate command by its control authority when slow, so ask for more.
  const gain = 1 / authority(spec, s.qbar)
  out.roll = 4 * wrapPi(bankT - bank) * gain
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
    out.pitch = ((3 * e + a.pitchI) / cb) * gain + ff
  }
  out.yaw = 0
}

/** Pitch attitude for a target vertical speed (m/s), radians: the
 * flight-path angle γ for that climb rate PLUS the angle of attack the wing
 * is flying at (θ = γ + α), corrected by the vertical-speed error. */
function vsPitch(s: PlaneState, vsT: number, gain = 0.04): number {
  const v = Math.max(s.airspeed, 4)
  return Math.asin(clamp(vsT / v, -0.5, 0.5)) + clamp(s.aoa, -0.1, 0.25) + gain * (vsT - s.vel.y)
}

/** Pitch attitude that holds altitude `alt`, radians: the flight-path angle
 * for a climb rate proportional to the altitude error, corrected by the
 * vertical-speed error (the attitude loop's integrator finds the trim). */
function altHoldPitch(s: PlaneState, alt: number): number {
  return vsPitch(s, clamp(0.6 * (alt - s.pos.y), -2.5, 2.5))
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
  env: AssistEnv,
  dt: number,
  out: PlaneCommand,
  opts: StepOptions,
): void {
  const agl = env.agl
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
    attitudeRates(a, s, spec, 0, PANIC_PITCH, dt, out)
    out.throttle = 1
    if (a.timer >= PANIC_TIME) setAssistMode(a, 'fly')
    return
  }
  if (a.mode === 'launch') {
    attitudeRates(a, s, spec, 0, LAUNCH_CLIMB, dt, out)
    out.throttle = a.timer >= LAUNCH_MOTOR_DELAY ? 1 : 0
    const stickTaken =
      a.timer > LAUNCH_ABORT_GRACE &&
      (Math.abs(sticks.right.x) > LAUNCH_ABORT_STICK || Math.abs(sticks.right.y) > LAUNCH_ABORT_STICK)
    if (agl >= LAUNCH_HANDOVER_AGL || a.timer >= LAUNCH_MAX_TIME || stickTaken) {
      setAssistMode(a, 'fly')
    }
    return
  }

  // --- take-off roll ---------------------------------------------------------
  if (a.mode === 'runway') {
    const hdgErr = wrapPi(a.runwayHeading - a.att.heading)
    if (level === 'trainer') {
      // The Trainer flies the whole take-off: full power, straight down the
      // centreline, rotate at 1.25 v_s, then the launch climb-out.
      out.roll = -4 * a.att.bank
      out.yaw = 2.5 * hdgErr
      const rotate = s.airspeed >= vs * 1.25
      out.pitch = (rotate ? 3 * (10 * DEG - a.att.pitch) : -2 * a.att.pitch)
      out.throttle = 1
    } else {
      out.roll = level === 'acro' ? rx * spec.maxRoll : 4 * (rx * NORMAL_BANK - a.att.bank)
      out.pitch = level === 'acro' ? ry * spec.maxPitch : 3 * (ry * NORMAL_PITCH - a.att.pitch)
      out.yaw = dead(sticks.left.x) * spec.maxYaw
      out.throttle = manualThrottle
    }
    if (!env.onGround && agl > 0.5) {
      if (level === 'trainer') {
        setAssistMode(a, 'launch')
        a.timer = LAUNCH_MOTOR_DELAY // motor already running; climb out
      } else {
        setAssistMode(a, 'fly')
      }
    }
    return
  }

  // --- roll-out after a touchdown ----------------------------------------------
  if (a.mode === 'rollout') {
    if (!env.onGround) {
      setAssistMode(a, 'fly')
    } else if (level === 'trainer') {
      if (sticks.left.y > GO_AROUND_STICK) {
        // Touch-and-go: the Trainer takes off again along its heading.
        a.runwayHeading = a.att.heading
        setAssistMode(a, 'runway')
        out.throttle = 1
        return
      }
      out.roll = -4 * a.att.bank
      out.pitch = -2 * a.att.pitch
      out.yaw = 2.5 * wrapPi(a.runwayHeading - a.att.heading)
      out.throttle = 0
      return
    }
    // Normal / Acro: the pilot keeps control on the ground (rudder steers).
    out.roll = 0
    out.pitch = level === 'acro' ? ry * spec.maxPitch : 3 * (ry * NORMAL_PITCH - a.att.pitch)
    out.yaw = dead(sticks.left.x) * spec.maxYaw
    out.throttle = manualThrottle
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
    attitudeRates(a, s, spec, rx * maxBank, ry * NORMAL_PITCH, dt, out)
    out.throttle = manualThrottle
    a.holdAlt = Number.NaN
    return
  }

  // --- Trainer: small envelope, altitude + airspeed hold, stall-proof -------
  const maxBank = Math.min(TRAINER_BANK, protectedBank(spec, s.airspeed, TRAINER_BANK))
  let pitchT: number
  const settle = ry === 0 && env.landable && agl < FLARE_AGL
  if (settle) {
    // Released low over landable ground: settle onto it gently instead of
    // holding a few metres up forever.
    a.holdAlt = Number.NaN
    pitchT = vsPitch(s, -FLARE_SINK_LOW)
  } else if (ry === 0) {
    if (Number.isNaN(a.holdAlt)) a.holdAlt = s.pos.y
    pitchT = altHoldPitch(s, a.holdAlt)
  } else {
    a.holdAlt = Number.NaN
    pitchT = ry * TRAINER_PITCH
  }
  // Auto-flare: near the ground the descent rate is limited, easing from
  // FLARE_SINK_HIGH at FLARE_AGL to FLARE_SINK_LOW at touchdown.
  if (agl < FLARE_AGL && env.landable) {
    const k = Math.max(0, agl) / FLARE_AGL
    // Quadratic: firm near the ground, gentle where the flare begins.
    const maxSink = FLARE_SINK_LOW + (FLARE_SINK_HIGH - FLARE_SINK_LOW) * k * k
    pitchT = Math.max(pitchT, vsPitch(s, -maxSink, 0.1))
  }
  // Stall-proof: nose-up authority fades out near the stall speed …
  const speedRoom = clamp((s.airspeed - vs * 1.1) / (vs * 0.4), 0, 1)
  if (pitchT > 0) pitchT *= speedRoom
  pitchT = clamp(pitchT, -TRAINER_PITCH, TRAINER_PITCH)
  attitudeRates(a, s, spec, rx * maxBank, pitchT, dt, out)
  // … and the pitch command is clipped before α reaches the stall.
  const aoaLimit = spec.alphaCrit - TRAINER_AOA_MARGIN
  if (s.aoa > aoaLimit) out.pitch = Math.min(out.pitch, -4 * (s.aoa - aoaLimit))

  // Auto-throttle: hold a target airspeed the left stick nudges between a
  // safe slow speed and a little above cruise.
  const cruise = spec.vAuthority
  const lo = vs * 1.45
  const hi = cruise * 1.25
  const ly = dead(sticks.left.y)
  let vT = ly >= 0 ? cruise + ly * (hi - cruise) : cruise + ly * (cruise - lo)
  // On approach (low and descending) slow to approach speed, so a Trainer
  // landing touches down slow enough to stop on the runway.
  if (agl < APPROACH_AGL && s.vel.y < -0.3) vT = Math.min(vT, lo)
  const err = vT - s.airspeed
  a.speedI = clamp(a.speedI + err * dt * 0.08, -0.6, 0.6)
  out.throttle = clamp(0.35 + 0.12 * err + a.speedI + 1.2 * Math.max(0, a.att.pitch), 0, 1)
  // Settling onto the ground: ease the power off.
  if (settle && agl < FLARE_AGL * 0.6) out.throttle = Math.min(out.throttle, 0.15)
}

/** Start a take-off roll along `heading` (runway or after a stop). */
export function startRunway(a: AssistState, heading: number): void {
  setAssistMode(a, 'runway')
  a.runwayHeading = heading
}

/** Enter the roll-out after a touchdown, holding the current heading. */
export function startRollout(a: AssistState, s: PlaneState): void {
  attitudeOf(s.q, a.att)
  setAssistMode(a, 'rollout')
  a.runwayHeading = a.att.heading
}

/** Enter Panic from any mode/level. */
export const triggerPanic = (a: AssistState) => setAssistMode(a, 'panic')
/** Enter the hand-launch autopilot (the plane has just left the hand). */
export const startLaunch = (a: AssistState) => setAssistMode(a, 'launch')
