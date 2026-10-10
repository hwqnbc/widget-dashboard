/**
 * Pure fixed-wing flight model for Wing Flyer — no React, no three.js.
 *
 * Unlike the drone's yaw + visual-tilt kinematics, a plane needs full 3D
 * attitude, so the state carries a unit quaternion. Forces are real
 * aerodynamics (lift with a stall, parasitic + induced drag, side force,
 * thrust falling off with airspeed, gravity); moments are game-friendly
 * RATE COMMAND: a `PlaneCommand` asks for body rates, the rates chase it with
 * a short lag, and control authority scales with dynamic pressure so the
 * controls go mushy near the stall. Two stability terms stand in for real
 * aerodynamic moments: the nose seeks its trimmed angle of attack (hands-off
 * the plane settles at cruise speed) and weathervanes into the airflow
 * (no ice-skating sideways). See docs/wing-flyer.md §5.
 *
 * Conventions (shared with the drone): world +Y up, the nose faces −Z at
 * identity. Body axes: forward = −Z, up = +Y, right = +X. Rates: roll `p`
 * positive = right wing down, pitch `q` positive = nose up, yaw `r`
 * positive = nose right.
 *
 * Everything mutates in place with no allocation per step; the sim loop
 * calls `advanceFixed` every frame, which runs whole `STEP_DT` sub-steps.
 */
import type { AirframeSpec } from './airframes'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Unit quaternion (x, y, z, w). */
export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** Target body rates (rad/s) and throttle (0..1) — what the assists ask for. */
export interface PlaneCommand {
  roll: number
  pitch: number
  yaw: number
  throttle: number
}

export interface PlaneState {
  pos: Vec3
  vel: Vec3
  q: Quat
  /** Commanded rates after the response lag, rad/s. */
  cmdRoll: number
  cmdPitch: number
  cmdYaw: number
  /** Effective body rates last step (command + stability), rad/s. */
  rollRate: number
  pitchRate: number
  yawRate: number
  throttle: number
  // Derived each step — read by the assists, the HUD and the tests.
  airspeed: number
  /** Angle of attack, radians. */
  aoa: number
  /** Sideslip, radians (positive = air moving right relative to the nose). */
  slip: number
  /** Dynamic pressure, Pa. */
  qbar: number
  stalled: boolean
}

export const GRAVITY = 9.81
export const RHO = 1.225
/** Fixed physics step: 120 Hz. At the wing's 30 m/s top speed that is
 * 0.25 m per step — well under the smallest collider (lesson #34). */
export const STEP_DT = 1 / 120
/** At most this many sub-steps per frame; excess time is dropped, so a
 * stutter becomes momentary slow motion instead of a tunnelling jump. */
export const MAX_SUBSTEPS = 8
/** Command → rate response lag, seconds. */
export const RATE_TAU = 0.1
/** Pitch stability: nose-toward-trim-AoA gain, (rad/s) per rad. */
export const K_ALPHA = 4
/** Yaw weathervane gain, (rad/s) per rad of sideslip. */
export const K_BETA = 3
/** Authority floor — even at near-zero airspeed a little control remains. */
export const MIN_AUTHORITY = 0.15
/** Stall break width: lift falls from peak to the stalled level over this. */
export const STALL_BREAK = (4 * Math.PI) / 180
/** Extra flat-plate drag once stalled (× sin²α). */
export const STALL_DRAG = 1.2
/** Wing-drop roll rate once fully stalled (Acro), rad/s. */
export const WING_DROP_RATE = 2.5

export interface StepOptions {
  /** Air-mass velocity at the plane (wind + updrafts), world m/s. */
  wind?: Vec3
  /** Let a stall drop a wing (Acro). Off: the stall only drops the nose. */
  wingDrop?: boolean
  /** Scales the nose-seeks-trim-AoA term (default 1). Acro passes 0 so a
   * centred stick HOLDS attitude, like a flight controller's rate mode. */
  pitchStability?: number
}

const NO_WIND: Vec3 = { x: 0, y: 0, z: 0 }

// --- quaternion / vector helpers (in place, no allocation) -------------

/** out = q · v (rotate v by q). `out` may alias `v`. */
export function rotate(q: Quat, vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  // t = 2 · (q.xyz × v); out = v + w·t + q.xyz × t
  const tx = 2 * (q.y * vz - q.z * vy)
  const ty = 2 * (q.z * vx - q.x * vz)
  const tz = 2 * (q.x * vy - q.y * vx)
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty)
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz)
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx)
  return out
}

/** Body forward (−Z) in world space. */
export const forwardOf = (q: Quat, out: Vec3) => rotate(q, 0, 0, -1, out)
/** Body up (+Y) in world space. */
export const upOf = (q: Quat, out: Vec3) => rotate(q, 0, 1, 0, out)
/** Body right (+X) in world space. */
export const rightOf = (q: Quat, out: Vec3) => rotate(q, 1, 0, 0, out)

export function normalizeQuat(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1
  q.x /= n
  q.y /= n
  q.z /= n
  q.w /= n
  return q
}

/** q ← q ⊗ rotation(axis-angle of body vector (ax, ay, az) · dt). */
function integrateBody(q: Quat, ax: number, ay: number, az: number, dt: number) {
  const angle = Math.hypot(ax, ay, az) * dt
  if (angle < 1e-12) return
  const s = Math.sin(angle / 2) / (angle / dt)
  const dx = ax * s
  const dy = ay * s
  const dz = az * s
  const dw = Math.cos(angle / 2)
  const { x, y, z, w } = q
  q.x = w * dx + x * dw + y * dz - z * dy
  q.y = w * dy - x * dz + y * dw + z * dx
  q.z = w * dz + x * dy - y * dx + z * dw
  q.w = w * dw - x * dx - y * dy - z * dz
  normalizeQuat(q)
}

/** Quaternion from heading (rad, + = nose right), pitch (+ = nose up) and
 * bank (+ = right wing down) — the order a pilot reads them. */
export function quatFromEuler(heading: number, pitch: number, bank: number, out: Quat): Quat {
  // yaw about −Y (nose right), then pitch about +X, then roll about −Z.
  const ch = Math.cos(-heading / 2)
  const sh = Math.sin(-heading / 2)
  const cp = Math.cos(pitch / 2)
  const sp = Math.sin(pitch / 2)
  const cb = Math.cos(-bank / 2)
  const sb = Math.sin(-bank / 2)
  // qYaw = (0, sh, 0, ch); qPitch = (sp, 0, 0, cp); qRoll = (0, 0, sb, cb)
  // q = qYaw ⊗ qPitch ⊗ qRoll
  const ax = ch * sp
  const ay = sh * cp
  const az = -sh * sp
  const aw = ch * cp
  out.x = ax * cb + ay * sb
  out.y = ay * cb - ax * sb
  out.z = aw * sb + az * cb
  out.w = aw * cb - az * sb
  return normalizeQuat(out)
}

export interface Attitude {
  /** Radians, + = nose right of −Z (compass-style, 0 = north = −Z). */
  heading: number
  /** Radians, + = nose up. */
  pitch: number
  /** Radians, + = right wing down; ±π when inverted. */
  bank: number
}

const _f: Vec3 = { x: 0, y: 0, z: 0 }
const _u: Vec3 = { x: 0, y: 0, z: 0 }
const _r: Vec3 = { x: 0, y: 0, z: 0 }

/** Pilot-readable attitude of `q`, written into `out`. */
export function attitudeOf(q: Quat, out: Attitude): Attitude {
  forwardOf(q, _f)
  upOf(q, _u)
  rightOf(q, _r)
  out.pitch = Math.asin(Math.max(-1, Math.min(1, _f.y)))
  out.heading = Math.atan2(_f.x, -_f.z)
  out.bank = Math.atan2(-_r.y, _u.y)
  return out
}

// --- aerodynamics -------------------------------------------------------

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Lift coefficient at angle of attack `alpha` (rad): linear up to the
 * critical angle, then a smooth break down to `stallLiftFrac` of the peak,
 * then a flat-plate `sin 2α` tail. Mirrored for negative α. */
export function liftCoefficient(spec: AirframeSpec, alpha: number): number {
  const ac = spec.alphaCrit
  if (alpha >= -ac && alpha <= ac) return spec.cl0 + spec.clAlpha * alpha
  const sign = alpha > 0 ? 1 : -1
  const a = Math.abs(alpha)
  const peak = spec.cl0 * sign + spec.clAlpha * ac * sign
  const stalled = peak * spec.stallLiftFrac
  if (a <= ac + STALL_BREAK) {
    return peak + (stalled - peak) * smoothstep(ac, ac + STALL_BREAK, a)
  }
  // Flat-plate tail, continuous at ac + STALL_BREAK.
  const a0 = ac + STALL_BREAK
  return (stalled * Math.sin(2 * a)) / Math.sin(2 * a0)
}

/** Stall speed in level flight at load factor `n` (1 = straight and level). */
export function stallSpeed(spec: AirframeSpec, n = 1): number {
  const clMax = spec.cl0 + spec.clAlpha * spec.alphaCrit
  return Math.sqrt((2 * spec.mass * GRAVITY * n) / (RHO * spec.wingArea * clMax))
}

/** Theoretical best glide ratio L/D max = 1 / (2√(cd0·k)). */
export const bestGlideRatio = (spec: AirframeSpec) => 1 / (2 * Math.sqrt(spec.cd0 * spec.k))

/** Airspeed of best glide (CL = √(cd0/k)). */
export function bestGlideSpeed(spec: AirframeSpec): number {
  const cl = Math.sqrt(spec.cd0 / spec.k)
  return Math.sqrt((2 * spec.mass * GRAVITY) / (RHO * spec.wingArea * cl))
}

// --- state --------------------------------------------------------------

export function createPlaneState(): PlaneState {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    q: { x: 0, y: 0, z: 0, w: 1 },
    cmdRoll: 0,
    cmdPitch: 0,
    cmdYaw: 0,
    rollRate: 0,
    pitchRate: 0,
    yawRate: 0,
    throttle: 0,
    airspeed: 0,
    aoa: 0,
    slip: 0,
    qbar: 0,
    stalled: false,
  }
}

/** Place the plane at `pos` flying straight along `heading` at `speed`,
 * wings level, nose at `pitch` (rates and lag state cleared). */
export function resetPlane(
  s: PlaneState,
  pos: Vec3,
  heading: number,
  speed: number,
  pitch = 0,
  throttle = 0,
): PlaneState {
  s.pos.x = pos.x
  s.pos.y = pos.y
  s.pos.z = pos.z
  quatFromEuler(heading, pitch, 0, s.q)
  forwardOf(s.q, _f)
  s.vel.x = _f.x * speed
  s.vel.y = _f.y * speed
  s.vel.z = _f.z * speed
  s.cmdRoll = s.cmdPitch = s.cmdYaw = 0
  s.rollRate = s.pitchRate = s.yawRate = 0
  s.throttle = throttle
  updateAir(s, NO_WIND, null)
  return s
}

/** Recompute airspeed / α / β / q̄ / stalled for the current state. Pass
 * the spec to refresh `stalled` too. */
function updateAir(s: PlaneState, wind: Vec3, spec: AirframeSpec | null) {
  const vx = s.vel.x - wind.x
  const vy = s.vel.y - wind.y
  const vz = s.vel.z - wind.z
  const v = Math.hypot(vx, vy, vz)
  forwardOf(s.q, _f)
  upOf(s.q, _u)
  rightOf(s.q, _r)
  const vf = vx * _f.x + vy * _f.y + vz * _f.z
  const vu = vx * _u.x + vy * _u.y + vz * _u.z
  const vr = vx * _r.x + vy * _r.y + vz * _r.z
  s.airspeed = v
  s.aoa = v > 1e-6 ? Math.atan2(-vu, vf) : 0
  s.slip = v > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, vr / v))) : 0
  s.qbar = 0.5 * RHO * v * v
  if (spec) s.stalled = Math.abs(s.aoa) > spec.alphaCrit
}

/** Control authority 0.15..1 — scales with dynamic pressure, so the same
 * stick does less near the stall. */
export function authority(spec: AirframeSpec, qbar: number): number {
  const qRef = 0.5 * RHO * spec.vAuthority * spec.vAuthority
  return Math.max(MIN_AUTHORITY, Math.min(1, qbar / qRef))
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Advance the plane by one fixed step `dt` (use `STEP_DT`). Forces are
 * integrated semi-implicitly (velocity, then position); orientation by the
 * effective body rates. Mutates `s` in place.
 */
export function stepPlane(
  s: PlaneState,
  spec: AirframeSpec,
  cmd: PlaneCommand,
  dt: number,
  opts: StepOptions = {},
): void {
  const wind = opts.wind ?? NO_WIND
  updateAir(s, wind, spec)
  const v = s.airspeed

  // --- forces (world frame) ---
  const vx = s.vel.x - wind.x
  const vy = s.vel.y - wind.y
  const vz = s.vel.z - wind.z
  let fx = 0
  let fy = -spec.mass * GRAVITY
  let fz = 0
  s.throttle = clamp(cmd.throttle, 0, 1)

  if (v > 1e-3) {
    const ivx = vx / v
    const ivy = vy / v
    const ivz = vz / v
    const qS = s.qbar * spec.wingArea
    const alpha = s.aoa
    const cl = liftCoefficient(spec, alpha)
    const stallBlend = smoothstep(spec.alphaCrit, spec.alphaCrit + STALL_BREAK, Math.abs(alpha))
    const sa = Math.sin(alpha)
    const cd = spec.cd0 + spec.k * cl * cl + STALL_DRAG * sa * sa * stallBlend

    // Lift ⟂ airflow, in the plane of symmetry: right × v̂.
    let lx = _r.y * ivz - _r.z * ivy
    let ly = _r.z * ivx - _r.x * ivz
    let lz = _r.x * ivy - _r.y * ivx
    const ln = Math.hypot(lx, ly, lz)
    if (ln > 1e-6) {
      lx /= ln
      ly /= ln
      lz /= ln
      fx += lx * qS * cl
      fy += ly * qS * cl
      fz += lz * qS * cl
    }
    // Drag along −v̂.
    fx -= ivx * qS * cd
    fy -= ivy * qS * cd
    fz -= ivz * qS * cd
    // Side force opposes sideslip.
    const side = -qS * spec.cyBeta * s.slip
    fx += _r.x * side
    fy += _r.y * side
    fz += _r.z * side
  }

  // Thrust along the nose, falling off toward the prop's pitch speed.
  const u = vx * _f.x + vy * _f.y + vz * _f.z
  const thrust = s.throttle * spec.thrustMax * Math.max(0, 1 - Math.max(0, u) / spec.vPitch)
  fx += _f.x * thrust
  fy += _f.y * thrust
  fz += _f.z * thrust

  s.vel.x += (fx / spec.mass) * dt
  s.vel.y += (fy / spec.mass) * dt
  s.vel.z += (fz / spec.mass) * dt
  s.pos.x += s.vel.x * dt
  s.pos.y += s.vel.y * dt
  s.pos.z += s.vel.z * dt

  // --- rotation: rate command + stability ---
  const auth = authority(spec, s.qbar)
  const k = 1 - Math.exp(-dt / RATE_TAU)
  const tRoll = clamp(cmd.roll, -spec.maxRoll, spec.maxRoll) * auth
  const tPitch = clamp(cmd.pitch, -spec.maxPitch, spec.maxPitch) * auth
  const tYaw = clamp(cmd.yaw, -spec.maxYaw, spec.maxYaw) * auth
  s.cmdRoll += (tRoll - s.cmdRoll) * k
  s.cmdPitch += (tPitch - s.cmdPitch) * k
  s.cmdYaw += (tYaw - s.cmdYaw) * k

  // Stability scales with airflow, not the authority floor: no air, no
  // weathervane. Normalised to 1 at the authority speed.
  const airK = Math.min(1.5, s.qbar / (0.5 * RHO * spec.vAuthority * spec.vAuthority))
  let pitchStab = 0
  let yawStab = 0
  let rollStab = 0
  if (v > 0.5) {
    // A stall always drops the nose, even in Acro.
    const stab = s.stalled ? 1 : (opts.pitchStability ?? 1)
    pitchStab = -K_ALPHA * (s.aoa - spec.alphaTrim) * airK * stab
    // Turn coordination: a banked plane's nose follows its curving path at
    // r = g·sinφ·cosθ / V (−right.y = sinφ·cosθ). Without it the nose only
    // follows through a standing sideslip whose side force fights the turn.
    const coord = (GRAVITY * -_r.y) / Math.max(v, spec.vAuthority * 0.5)
    yawStab = K_BETA * s.slip * airK + coord
    if (opts.wingDrop && s.stalled) {
      const blend = smoothstep(spec.alphaCrit, spec.alphaCrit + STALL_BREAK, Math.abs(s.aoa))
      rollStab = (s.slip >= 0 ? 1 : -1) * WING_DROP_RATE * blend
    }
  }
  s.rollRate = s.cmdRoll + rollStab
  s.pitchRate = s.cmdPitch + pitchStab
  s.yawRate = s.cmdYaw + yawStab
  // Body angular velocity: pitch about +X, yaw (nose right) about −Y,
  // roll (right wing down) about −Z.
  integrateBody(s.q, s.pitchRate, -s.yawRate, -s.rollRate, dt)

  updateAir(s, wind, spec)
}

/**
 * Fixed-step accumulator. Adds `frameDt` (capped to MAX_SUBSTEPS steps) to
 * `acc`, calls `step(STEP_DT)` for each whole step, and returns the leftover
 * to carry into the next frame.
 */
export function advanceFixed(acc: number, frameDt: number, step: (dt: number) => void): number {
  acc += Math.min(Math.max(0, frameDt), MAX_SUBSTEPS * STEP_DT)
  let n = 0
  while (acc >= STEP_DT && n < MAX_SUBSTEPS) {
    step(STEP_DT)
    acc -= STEP_DT
    n++
  }
  return acc >= STEP_DT ? 0 : acc
}
