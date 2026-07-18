/**
 * Shared aim state between the camera rig and the sim loop — a pure module
 * so both (and the gyro fine-aim in settings) can import it without pulling
 * React components into each other.
 */

/** Strike camera views: FPV gun cam (default) or third-person chase. */
export type StrikeView = 'fp' | 'tp'

export const coerceStrikeView = (v: unknown): StrikeView | undefined =>
  v === 'fp' || v === 'tp' ? v : undefined

/**
 * Fraction of the drone's visual tilt the FPV camera follows. Kept gentler
 * than the drone sim's 0.6 so the reticle stays steady while closing on a
 * target — aiming is mostly yaw + altitude, by design.
 */
export const FPV_PITCH_GAIN = 0.35

/** How hard a shot kicks the camera pitch (radians). */
export const RECOIL_KICK = 0.018

/** Extra aim rotation applied on top of the flight pose — written by the
 * gyro fine-aim and read by both the camera and the fire path so the bolt
 * always goes where the reticle points. Recoil is a visual kick only. */
export interface AimOffset {
  yaw: number
  pitch: number
  /** Live recoil kick, decayed by the camera rig every frame. */
  recoil: number
}

export function createAimOffset(): AimOffset {
  return { yaw: 0, pitch: 0, recoil: 0 }
}
