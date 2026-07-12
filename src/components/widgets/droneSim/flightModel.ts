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
/** Length of the crash tumble before the auto-respawn, seconds. */
export const CRASH_DURATION = 1.6
const CRASH_GRAVITY = 20
const CRASH_SKID = 1.5

/** Exponential approach — framerate-independent smoothing. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

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
): number {
  const step = Math.min(dt, MAX_DT) // survive tab-switch dt spikes

  // Left stick X: yaw rate (stick right turns the nose right).
  s.yaw -= input.left.x * YAW_RATE * step

  // Right stick: target velocity in the body frame, rotated to world frame.
  // At yaw 0 the nose faces -Z, so forward = (-sin yaw, 0, -cos yaw).
  const sin = Math.sin(s.yaw)
  const cos = Math.cos(s.yaw)
  const forward = input.right.y * MAX_HORIZ_SPEED
  const strafe = input.right.x * MAX_HORIZ_SPEED
  const targetX = forward * -sin + strafe * cos
  const targetZ = forward * -cos + strafe * -sin
  const targetY = input.left.y * MAX_VERT_SPEED

  s.vel.x = damp(s.vel.x, targetX, RESPONSE_H, step)
  s.vel.z = damp(s.vel.z, targetZ, RESPONSE_H, step)
  s.vel.y = damp(s.vel.y, targetY, RESPONSE_V, step)

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

  // Visual tilt: nose dips into forward flight, body banks into a strafe.
  s.tiltPitch = damp(s.tiltPitch, -input.right.y * MAX_TILT, TILT_RESPONSE, step)
  s.tiltRoll = damp(s.tiltRoll, -input.right.x * MAX_TILT, TILT_RESPONSE, step)

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
