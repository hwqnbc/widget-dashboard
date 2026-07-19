/**
 * The weapon gimbal — pure module. Realism model: an armed drone's gun
 * rides a gimballed turret aimed independently of the airframe (the MQ-9's
 * sensor-operator/pilot split), with a wide yaw arc and a steep look-DOWN
 * for ground attack. The gimbal is stored relative to the drone's nose, so
 * a centred gimbal is exactly the old fly-to-aim scheme.
 *
 * Three aim-control modes share the same gimbal state; they differ only in
 * what the camera does and what the right stick drives:
 *  - 'gimbal' (default): camera stays flight-locked, the reticle moves
 *    across the view where the gun points (drag the free screen to slew).
 *  - 'gunner': the camera slews with the gimbal (sensor-operator screen).
 *  - 'hover': gunner camera + the right stick becomes the gimbal rate
 *    control while lateral flight input is ignored (altitude-hold hovers).
 */

/** 'classic' = the original fly-to-aim (gimbal frozen at boresight, no
 * drag, no soft-track — the pre-gimbal behaviour) and the default. The
 * other three are the gimbal modes. */
export type AimMode = 'classic' | 'gimbal' | 'gunner' | 'hover'

export const coerceAimMode = (v: unknown): AimMode | undefined =>
  v === 'classic' || v === 'gimbal' || v === 'gunner' || v === 'hover'
    ? v
    : undefined

/** Yaw arc, radians (±60°) relative to the nose. */
export const GIMBAL_YAW_MAX = 1.05
/** Elevation arc: +20° up, −70° down — Reaper-style ground look-down. */
export const GIMBAL_PITCH_MAX = 0.35
export const GIMBAL_PITCH_MIN = -1.22

/** Drag sensitivity, radians per CSS px (halved while scoped). */
export const DRAG_SENS = 0.0035
/** Hover-mode right-stick slew rates, rad/s at full deflection (the Tank
 * Battle camera-aim rates — proven feel). */
export const GIMBAL_YAW_RATE = 2.4
export const GIMBAL_PITCH_RATE = 1.3
/** Soft-track slew rate at full assist, rad/s (scaled per assist level). */
export const TRACK_RATE = 1.2
/** Soft-track strength per aim-assist level. */
export const TRACK_MULT = { off: 0, mild: 0.5, strong: 1 } as const
/** Idle return-to-boresight: after this long with no lock and no manual
 * aim input, the gimbal eases back to centre (a gimbal camera resting to
 * boresight), at this rate. Assist-off keeps manual aim — see the rig. */
export const RECENTER_DELAY_MS = 700
export const RECENTER_RATE = 1.1

export interface GimbalState {
  /** Yaw relative to the drone's heading; + = left (heading convention). */
  yaw: number
  /** Elevation relative to level; + = up. */
  pitch: number
}

export function createGimbalState(): GimbalState {
  return { yaw: 0, pitch: 0 }
}

export function resetGimbal(g: GimbalState): void {
  g.yaw = 0
  g.pitch = 0
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/** Nudge the gimbal by deltas (drag / gyro-style input), clamped to arc. */
export function slewGimbal(g: GimbalState, dYaw: number, dPitch: number): void {
  g.yaw = clamp(g.yaw + dYaw, -GIMBAL_YAW_MAX, GIMBAL_YAW_MAX)
  g.pitch = clamp(g.pitch + dPitch, GIMBAL_PITCH_MIN, GIMBAL_PITCH_MAX)
}

/** Hover mode: the right stick slews the gimbal at a rate (Tank Battle's
 * camera-aim pattern) — stick right aims right (yaw decreases). */
export function stepGimbalRates(
  g: GimbalState,
  rx: number,
  ry: number,
  sens: number,
  dt: number,
): void {
  slewGimbal(g, -rx * GIMBAL_YAW_RATE * sens * dt, ry * GIMBAL_PITCH_RATE * sens * dt)
}

/** Soft track: move the gimbal toward a desired (relative) aim by at most
 * rate·dt per axis — error-reducing only, still clamped to the arc. */
export function trackToward(
  g: GimbalState,
  desiredYaw: number,
  desiredPitch: number,
  maxStep: number,
): void {
  const dy = clamp(desiredYaw, -GIMBAL_YAW_MAX, GIMBAL_YAW_MAX) - g.yaw
  const dp = clamp(desiredPitch, GIMBAL_PITCH_MIN, GIMBAL_PITCH_MAX) - g.pitch
  g.yaw += clamp(dy, -maxStep, maxStep)
  g.pitch += clamp(dp, -maxStep, maxStep)
}

/** Ease the gimbal toward boresight by at most maxStep per axis. */
export function recenterGimbal(g: GimbalState, maxStep: number): void {
  g.yaw -= clamp(g.yaw, -maxStep, maxStep)
  g.pitch -= clamp(g.pitch, -maxStep, maxStep)
}

export interface AimAngles {
  yaw: number
  pitch: number
}

/** The single aim composition every consumer shares (fire path, lock cone,
 * reticle projection, gunner camera): flight yaw + tilt follow + gimbal +
 * gyro offsets. Total pitch is clamped to the gimbal arc so stacked
 * offsets can't aim past the turret's physical limits. */
export function aimAngles(
  flightYaw: number,
  basePitch: number,
  g: GimbalState,
  offYaw: number,
  offPitch: number,
  out: AimAngles,
): void {
  out.yaw = flightYaw + g.yaw + offYaw
  out.pitch = clamp(
    basePitch + g.pitch + offPitch,
    GIMBAL_PITCH_MIN,
    GIMBAL_PITCH_MAX,
  )
}

/** Unit direction for aim angles (heading convention: nose = -Z at yaw 0). */
export function dirFromAngles(
  yaw: number,
  pitch: number,
  out: { x: number; y: number; z: number },
): void {
  const cosP = Math.cos(pitch)
  out.x = -Math.sin(yaw) * cosP
  out.y = Math.sin(pitch)
  out.z = -Math.cos(yaw) * cosP
}
