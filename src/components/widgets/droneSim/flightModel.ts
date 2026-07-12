/**
 * Pure kinematic flight model for the drone simulator — no React, no three.js.
 *
 * Altitude-hold style: the left stick commands vertical velocity and yaw rate,
 * the right stick commands forward/strafe velocity in the drone's body frame.
 * Velocities approach their targets exponentially (`damp`), so releasing the
 * sticks brakes the drone to a stationary hover. All mutation is in place —
 * the sim loop calls `stepFlight` every frame with zero allocation.
 */

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Live joystick values, each axis -1..1; y = +1 means stick pushed up. */
export interface ControlInput {
  left: Vec2
  right: Vec2
}

export interface FlightState {
  pos: Vec3
  vel: Vec3
  /** Heading in radians about +Y; the nose faces -Z at yaw 0. */
  yaw: number
  /** Visual-only attitude, radians — never feeds back into motion. */
  tiltPitch: number
  tiltRoll: number
}

/**
 * An axis-aligned collision box, pre-inflated by DRONE_RADIUS in x/z (drone
 * treated as a point) with `top` at roof height + DRONE_RADIUS so the drone
 * can land on roofs.
 */
export interface Collider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
}

export type DroneView = 'tp' | 'fp'

export const coerceView = (v: unknown): DroneView | undefined =>
  v === 'tp' || v === 'fp' ? v : undefined

export type Weather = 'clear' | 'storm'

export const coerceWeather = (v: unknown): Weather | undefined =>
  v === 'clear' || v === 'storm' ? v : undefined

/** 'hold' = beginner altitude-hold; 'acro' = gravity + attitude-based thrust. */
export type FlightMode = 'hold' | 'acro'

export const coerceFlightMode = (v: unknown): FlightMode | undefined =>
  v === 'hold' || v === 'acro' ? v : undefined

export const SPAWN: Vec3 = { x: 0, y: 2, z: 18 }
export const MAX_HORIZ_SPEED = 12
export const MAX_VERT_SPEED = 5
export const YAW_RATE = 2.8
export const RESPONSE_H = 5
export const RESPONSE_V = 8
export const MAX_TILT = 0.35
export const TILT_RESPONSE = 8
export const WORLD_HALF = 60
export const MAX_ALT = 40
export const DRONE_RADIUS = 0.25
export const MAX_DT = 0.05
export const DEADZONE = 0.08
/** Impact speed (u/s) into a building that counts as a crash. Full-tilt
 * horizontal flight is 12 and max vertical is 5, so landings and gentle
 * bumps can never crash — only committed wall hits do. */
export const CRASH_SPEED = 8

// Acro mode: the drone is a thrust vector under gravity. The right stick
// commands attitude (pitch/roll angles), the left stick's Y is collective
// thrust around the hover point, and momentum coasts against light drag.
export const GRAVITY = 14
export const MAX_ATTITUDE = 0.5 // rad, ~29°
export const ATTITUDE_RESPONSE = 6
/** thrust = GRAVITY * (1 + left.y * THRUST_RANGE); stick centred hovers. */
export const THRUST_RANGE = 0.85
/** Light air drag so acro speeds coast but don't run away. */
export const DRAG_H = 0.35
export const ACRO_MAX_SPEED = 22
/** Length of the crash tumble before the auto-respawn, seconds. */
export const CRASH_DURATION = 1.6
const CRASH_GRAVITY = 20
const CRASH_SKID = 1.5

/** Exponential approach — framerate-independent smoothing. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

/** Per-widget rate tuning, applied inside stepFlight. */
export interface Tuning {
  /** Speed multiplier (hold targets; acro attitude authority + speed cap). */
  speed: number
  /** Yaw-rate multiplier. */
  yaw: number
  /** RC-style stick expo, 0..~0.8 — softens the centre, keeps the ends. */
  expo: number
}

export const NEUTRAL_TUNING: Tuning = { speed: 1, yaw: 1, expo: 0 }
/** Extra multiplier the Turbo switch stacks onto speed and yaw. */
export const TURBO_BOOST = 1.4
/** Hard cap on the combined speed multiplier: 2.5 × 12 u/s = 30 u/s means at
 * most 1.5 u per MAX_DT step — still under the smallest inflated building
 * footprint, so tunneling stays impossible. */
export const MAX_SPEED_MULT = 2.5
/** Acro attitude authority never exceeds this, whatever the tuning. */
export const MAX_ATTITUDE_CAP = 0.65

/** Expo curve: v' = v(1−e) + v³e. Endpoints (±1) are preserved. */
export const applyExpo = (v: number, e: number) => v * (1 - e) + v * v * v * e

// Battery mode: flying drains charge (harder flying drains faster), landing
// on the spawn pad (or an active landing-challenge pad) recharges. An empty
// battery kills the sticks and the drone auto-descends where it is.
export const BATTERY_DRAIN_BASE = 0.8 // %/s just staying airborne
export const BATTERY_DRAIN_ACTIVE = 2.2 // additional %/s at full stick
export const BATTERY_RECHARGE = 25 // %/s while resting on a pad
export const BATTERY_LOW = 15 // one-shot warning threshold
export const BATTERY_REVIVE = 20 // a dead drone wakes at this charge
/** Stick override while dead: gentle powered descent, no lateral control. */
export const DEAD_INPUT: ControlInput = {
  left: { x: 0, y: -0.7 },
  right: { x: 0, y: 0 },
}

export interface BatteryState {
  level: number
  dead: boolean
  /** Low-battery warning fired for the current discharge cycle. */
  warned: boolean
}

export type BatteryEvent = 'low' | 'died' | 'revived'

export function createBatteryState(): BatteryState {
  return { level: 100, dead: false, warned: false }
}

export function resetBatteryState(b: BatteryState): void {
  b.level = 100
  b.dead = false
  b.warned = false
}

/**
 * One frame of battery bookkeeping. `activity` is 0..1 stick effort,
 * `charging` is whether the drone is resting on a recharge pad. Mutates in
 * place; returns an event when something noteworthy happened.
 */
export function stepBattery(
  b: BatteryState,
  activity: number,
  charging: boolean,
  dt: number,
): BatteryEvent | null {
  if (charging) {
    b.level = Math.min(100, b.level + BATTERY_RECHARGE * dt)
    if (b.dead && b.level >= BATTERY_REVIVE) {
      b.dead = false
      b.warned = false
      return 'revived'
    }
    if (b.level > BATTERY_LOW) b.warned = false
    return null
  }
  if (b.dead) return null
  b.level = Math.max(
    0,
    b.level - (BATTERY_DRAIN_BASE + BATTERY_DRAIN_ACTIVE * Math.min(1, activity)) * dt,
  )
  if (b.level === 0) {
    b.dead = true
    return 'died'
  }
  if (b.level <= BATTERY_LOW && !b.warned) {
    b.warned = true
    return 'low'
  }
  return null
}

/** Peak horizontal wind speed in storm weather, world-units/s. */
export const WIND_MAX = 4.5

/**
 * Storm wind at time t (seconds) — layered sines give a slowly veering base
 * wind with irregular gusts, deterministic and allocation-free (writes into
 * `out`). Magnitude stays within WIND_MAX.
 */
export function sampleWind(t: number, out: Vec2): void {
  const heading = Math.sin(t * 0.05) * Math.PI + Math.sin(t * 0.023) * 1.2
  const gust =
    0.45 +
    0.3 * Math.sin(t * 0.7) +
    0.15 * Math.sin(t * 1.7 + 1.3) +
    0.1 * Math.sin(t * 3.1 + 0.4)
  const speed = WIND_MAX * Math.min(1, Math.max(0.1, gust))
  out.x = Math.sin(heading) * speed
  out.y = Math.cos(heading) * speed // y is the z-axis component here (Vec2)
}

export function createControlInput(): ControlInput {
  return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }
}

export function createFlightState(): FlightState {
  return {
    pos: { ...SPAWN },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    tiltPitch: 0,
    tiltRoll: 0,
  }
}

export function resetFlightState(s: FlightState): void {
  s.pos.x = SPAWN.x
  s.pos.y = SPAWN.y
  s.pos.z = SPAWN.z
  s.vel.x = 0
  s.vel.y = 0
  s.vel.z = 0
  s.yaw = 0
  s.tiltPitch = 0
  s.tiltRoll = 0
}

/**
 * Push the drone out of any collider along the axis of least penetration and
 * zero the velocity component that carried it in. Resolving upward lands the
 * drone on the roof (it can sit there — altitude hold keeps it in place).
 * Returns the largest velocity magnitude absorbed by a surface this step —
 * the impact speed the crash check compares against CRASH_SPEED.
 */
export function resolveCollisions(
  s: FlightState,
  colliders: readonly Collider[],
): number {
  let impact = 0
  for (const c of colliders) {
    if (
      s.pos.x <= c.minX ||
      s.pos.x >= c.maxX ||
      s.pos.z <= c.minZ ||
      s.pos.z >= c.maxZ ||
      s.pos.y >= c.top
    ) {
      continue
    }
    const pushWest = s.pos.x - c.minX
    const pushEast = c.maxX - s.pos.x
    const pushNorth = s.pos.z - c.minZ
    const pushSouth = c.maxZ - s.pos.z
    const pushUp = c.top - s.pos.y
    const min = Math.min(pushWest, pushEast, pushNorth, pushSouth, pushUp)
    if (min === pushUp) {
      s.pos.y = c.top
      impact = Math.max(impact, -Math.min(0, s.vel.y))
      s.vel.y = Math.max(0, s.vel.y)
    } else if (min === pushWest) {
      s.pos.x = c.minX
      impact = Math.max(impact, Math.max(0, s.vel.x))
      s.vel.x = Math.min(0, s.vel.x)
    } else if (min === pushEast) {
      s.pos.x = c.maxX
      impact = Math.max(impact, -Math.min(0, s.vel.x))
      s.vel.x = Math.max(0, s.vel.x)
    } else if (min === pushNorth) {
      s.pos.z = c.minZ
      impact = Math.max(impact, Math.max(0, s.vel.z))
      s.vel.z = Math.min(0, s.vel.z)
    } else {
      s.pos.z = c.maxZ
      impact = Math.max(impact, -Math.min(0, s.vel.z))
      s.vel.z = Math.max(0, s.vel.z)
    }
  }
  return impact
}

export function stepFlight(
  s: FlightState,
  input: ControlInput,
  dt: number,
  colliders: readonly Collider[] = [],
  /** Horizontal wind (x, z) added as position drift the pilot must counter. */
  wind?: Vec2,
  mode: FlightMode = 'hold',
  tuning: Tuning = NEUTRAL_TUNING,
): number {
  const step = Math.min(dt, MAX_DT) // survive tab-switch dt spikes
  const speedMult = Math.min(MAX_SPEED_MULT, tuning.speed)
  const leftX = applyExpo(input.left.x, tuning.expo)
  const leftY = applyExpo(input.left.y, tuning.expo)
  const rightX = applyExpo(input.right.x, tuning.expo)
  const rightY = applyExpo(input.right.y, tuning.expo)

  // Left stick X: yaw rate (stick right turns the nose right).
  s.yaw -= leftX * YAW_RATE * tuning.yaw * step

  // At yaw 0 the nose faces -Z, so forward = (-sin yaw, 0, -cos yaw).
  const sin = Math.sin(s.yaw)
  const cos = Math.cos(s.yaw)

  if (mode === 'acro') {
    // Attitude follows the right stick — in acro tiltPitch/tiltRoll ARE the
    // flight attitude, not cosmetics (the same fields keep the rendering and
    // FPV camera working unchanged).
    const attitude = Math.min(MAX_ATTITUDE * speedMult, MAX_ATTITUDE_CAP)
    s.tiltPitch = damp(s.tiltPitch, -rightY * attitude, ATTITUDE_RESPONSE, step)
    s.tiltRoll = damp(s.tiltRoll, -rightX * attitude, ATTITUDE_RESPONSE, step)

    // Thrust acts along the body-up axis (yaw ψ, pitch θ, roll φ; YXZ order);
    // gravity pulls straight down; light drag lets momentum coast.
    const thrust = GRAVITY * Math.max(0, 1 + leftY * THRUST_RANGE)
    const sinP = Math.sin(s.tiltPitch)
    const cosP = Math.cos(s.tiltPitch)
    const sinR = Math.sin(s.tiltRoll)
    const cosR = Math.cos(s.tiltRoll)
    const upX = -sinR * cos + cosR * sinP * sin
    const upY = cosR * cosP
    const upZ = sinR * sin + cosR * sinP * cos
    s.vel.x += thrust * upX * step
    s.vel.y += (thrust * upY - GRAVITY) * step
    s.vel.z += thrust * upZ * step
    const drag = Math.exp(-DRAG_H * step)
    s.vel.x *= drag
    s.vel.y *= drag
    s.vel.z *= drag
    const speedCap = ACRO_MAX_SPEED * speedMult
    const speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z)
    if (speed > speedCap) {
      const k = speedCap / speed
      s.vel.x *= k
      s.vel.y *= k
      s.vel.z *= k
    }
  } else {
    // Altitude hold: sticks command target velocities directly.
    const forward = rightY * MAX_HORIZ_SPEED * speedMult
    const strafe = rightX * MAX_HORIZ_SPEED * speedMult
    const targetX = forward * -sin + strafe * cos
    const targetZ = forward * -cos + strafe * -sin
    const targetY = leftY * MAX_VERT_SPEED * speedMult

    s.vel.x = damp(s.vel.x, targetX, RESPONSE_H, step)
    s.vel.z = damp(s.vel.z, targetZ, RESPONSE_H, step)
    s.vel.y = damp(s.vel.y, targetY, RESPONSE_V, step)
  }

  s.pos.x += s.vel.x * step
  s.pos.y += s.vel.y * step
  s.pos.z += s.vel.z * step
  if (wind) {
    s.pos.x += wind.x * step
    s.pos.z += wind.y * step
  }

  // World bounds: clamp position and zero the outward velocity component.
  if (s.pos.x > WORLD_HALF) {
    s.pos.x = WORLD_HALF
    s.vel.x = Math.min(0, s.vel.x)
  } else if (s.pos.x < -WORLD_HALF) {
    s.pos.x = -WORLD_HALF
    s.vel.x = Math.max(0, s.vel.x)
  }
  if (s.pos.z > WORLD_HALF) {
    s.pos.z = WORLD_HALF
    s.vel.z = Math.min(0, s.vel.z)
  } else if (s.pos.z < -WORLD_HALF) {
    s.pos.z = -WORLD_HALF
    s.vel.z = Math.max(0, s.vel.z)
  }
  if (s.pos.y < DRONE_RADIUS) {
    s.pos.y = DRONE_RADIUS
    s.vel.y = Math.max(0, s.vel.y)
  } else if (s.pos.y > MAX_ALT) {
    s.pos.y = MAX_ALT
    s.vel.y = Math.min(0, s.vel.y)
  }

  const impact = resolveCollisions(s, colliders)

  if (mode === 'hold') {
    // Visual-only tilt: nose dips into forward flight, body banks in a strafe.
    s.tiltPitch = damp(s.tiltPitch, -rightY * MAX_TILT, TILT_RESPONSE, step)
    s.tiltRoll = damp(s.tiltRoll, -rightX * MAX_TILT, TILT_RESPONSE, step)
  }

  return impact
}

/**
 * One frame of the crash tumble: controls are dead, the drone skids and
 * falls under gravity, still collides with buildings, and bounces once off
 * the ground before coming to rest. Attitude (the spin) is handled by the
 * rig — this is translation only.
 */
export function stepCrash(
  s: FlightState,
  dt: number,
  colliders: readonly Collider[] = [],
): void {
  const step = Math.min(dt, MAX_DT)
  s.vel.x = damp(s.vel.x, 0, CRASH_SKID, step)
  s.vel.z = damp(s.vel.z, 0, CRASH_SKID, step)
  s.vel.y -= CRASH_GRAVITY * step
  s.pos.x += s.vel.x * step
  s.pos.y += s.vel.y * step
  s.pos.z += s.vel.z * step
  if (s.pos.y < DRONE_RADIUS) {
    s.pos.y = DRONE_RADIUS
    s.vel.y = s.vel.y < -2 ? -s.vel.y * 0.3 : 0
  }
  resolveCollisions(s, colliders)
}
