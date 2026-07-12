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

export type DroneView = 'tp' | 'fp'

export const coerceView = (v: unknown): DroneView | undefined =>
  v === 'tp' || v === 'fp' ? v : undefined

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

/** Exponential approach — framerate-independent smoothing. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

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

export function stepFlight(s: FlightState, input: ControlInput, dt: number): void {
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

  // Visual tilt: nose dips into forward flight, body banks into a strafe.
  s.tiltPitch = damp(s.tiltPitch, -input.right.y * MAX_TILT, TILT_RESPONSE, step)
  s.tiltRoll = damp(s.tiltRoll, -input.right.x * MAX_TILT, TILT_RESPONSE, step)
}
