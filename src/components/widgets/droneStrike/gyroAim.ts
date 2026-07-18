/**
 * Gyro fine-aim: tilting the device nudges the reticle a few degrees on top
 * of stick flight — the hybrid aiming competitive mobile shooters use. The
 * offset is clamped small (GYRO_MAX_OFFSET) so it is a precision aid, not a
 * steering wheel, and it feeds the shared AimOffset that both the camera
 * and the fire path read, so bolts always go where the reticle points.
 *
 * iOS 13+ requires DeviceOrientationEvent.requestPermission(), which throws
 * unless called from a user gesture — the settings panel's "Enable motion
 * aim" button is that gesture. Everything degrades to a silent no-op where
 * the API is missing (desktop), and the settings row hides itself.
 */
import type { AimOffset } from './aimModel'

/** Max aim offset per axis, radians (~8.6°). */
export const GYRO_MAX_OFFSET = 0.15
/** Device tilt (radians) that maps to the full offset — ~25° of tilt. */
const FULL_TILT_RAD = 0.44
/** Smoothing on the neutral-pose tracker when recentring. */
const NEUTRAL_ALPHA = 0.02

interface OrientationLike {
  beta: number | null
  gamma: number | null
}

export interface GyroState {
  /** Neutral (rest) pose captured on attach/recenter, radians. */
  neutralBeta: number
  neutralGamma: number
  hasNeutral: boolean
}

export function createGyroState(): GyroState {
  return { neutralBeta: 0, neutralGamma: 0, hasNeutral: false }
}

/** Is there any point offering gyro aim on this device? */
export function gyroSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
}

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** iOS 13+ gates the sensor behind an explicit permission prompt. */
export function gyroNeedsPermission(): boolean {
  if (!gyroSupported()) return false
  const ctor = DeviceOrientationEvent as unknown as PermissionCapable
  return typeof ctor.requestPermission === 'function'
}

/** MUST be called from a user gesture (a button tap) on iOS. */
export async function requestGyroPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!gyroSupported()) return 'unsupported'
  const ctor = DeviceOrientationEvent as unknown as PermissionCapable
  if (typeof ctor.requestPermission !== 'function') return 'granted'
  try {
    return await ctor.requestPermission!()
  } catch {
    return 'denied'
  }
}

/** Forget the neutral pose — the next reading becomes the new centre. */
export function recenterGyro(g: GyroState): void {
  g.hasNeutral = false
}

/**
 * Fold one deviceorientation reading into the aim offset. beta = front/back
 * tilt (pitch), gamma = left/right tilt (yaw) — both relative to the neutral
 * pose captured when the listener attached. The neutral also creeps slowly
 * toward the current pose, so a drifting grip recentres itself.
 */
export function applyGyroReading(
  g: GyroState,
  e: OrientationLike,
  aim: AimOffset,
): void {
  if (e.beta === null || e.gamma === null) return
  const beta = (e.beta * Math.PI) / 180
  const gamma = (e.gamma * Math.PI) / 180
  if (!g.hasNeutral) {
    g.neutralBeta = beta
    g.neutralGamma = gamma
    g.hasNeutral = true
  } else {
    g.neutralBeta += (beta - g.neutralBeta) * NEUTRAL_ALPHA
    g.neutralGamma += (gamma - g.neutralGamma) * NEUTRAL_ALPHA
  }
  const clamp = (v: number) => Math.min(1, Math.max(-1, v))
  // Tilt back = aim up; tilt right = aim right (negative yaw offset — the
  // heading convention is yaw + = left).
  aim.pitch = clamp(-(beta - g.neutralBeta) / FULL_TILT_RAD) * GYRO_MAX_OFFSET
  aim.yaw = clamp(-(gamma - g.neutralGamma) / FULL_TILT_RAD) * GYRO_MAX_OFFSET
}

/**
 * Attach the deviceorientation listener, writing into `aim`. Returns the
 * detach function (which also zeroes the offsets so a disabled gyro leaves
 * the aim straight).
 */
export function attachGyro(g: GyroState, aim: AimOffset): () => void {
  recenterGyro(g)
  const onReading = (e: DeviceOrientationEvent) => applyGyroReading(g, e, aim)
  window.addEventListener('deviceorientation', onReading)
  return () => {
    window.removeEventListener('deviceorientation', onReading)
    aim.pitch = 0
    aim.yaw = 0
  }
}
