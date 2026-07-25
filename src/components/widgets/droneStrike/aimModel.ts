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

/* ------------------------------ ADS / zoom ------------------------------ */

/** Unzoomed field of view (matches the Canvas camera). */
export const BASE_FOV = 60

/** Adjustable scope magnification (settings `zoomPower`). Higher power =
 * narrower FOV and, to keep the aim feel consistent, proportionally slower
 * aim inputs (a wider magnification exaggerates apparent motion). */
export type ZoomPower = 1.5 | 2 | 3
export const ZOOM_POWERS: readonly ZoomPower[] = [1.5, 2, 3]
/** Default scope power (2× reproduces the original fixed zoom). */
export const DEFAULT_ZOOM_POWER: ZoomPower = 2

export const coerceZoomPower = (v: unknown): ZoomPower | undefined =>
  v === 1.5 || v === 2 || v === 3 ? v : undefined

/** Scoped field of view for a given power (BASE / power). */
export const zoomFovFor = (power: number): number => BASE_FOV / power
/** Scoped aim-sensitivity multiplier for a given power (1 / power): yaw rate
 * AND the pitch follow, so a stronger zoom aims proportionally finer. */
export const zoomSensFor = (power: number): number => 1 / power

/** Scoped field of view at the default power — the original fixed 2× zoom. */
export const ZOOM_FOV = zoomFovFor(DEFAULT_ZOOM_POWER)
/** Scoped sensitivity at the default power (0.5). */
export const ZOOM_SENS = zoomSensFor(DEFAULT_ZOOM_POWER)

/** The effective FPV pitch follow. Used by BOTH the camera and the fire
 * path so the bolt always goes exactly where the reticle points. In acro,
 * `tiltPitch` IS the flight attitude — the camera follows the real nose
 * (gain 1) and pitching the drone becomes vertical aim. `zoomSens` is the
 * power-derived scoped multiplier (defaults to the 2× value). */
export const fpvPitchGain = (
  zoom: boolean,
  mode: 'hold' | 'acro' = 'hold',
  zoomSens: number = ZOOM_SENS,
) => (mode === 'acro' ? 1 : FPV_PITCH_GAIN * (zoom ? zoomSens : 1))

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
