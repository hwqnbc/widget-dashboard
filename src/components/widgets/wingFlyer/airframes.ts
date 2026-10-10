/**
 * Airframe specs for Wing Flyer — pure data, the `WeaponSpec` pattern: one
 * flight model (`planeModel.ts`), different numbers per aircraft.
 *
 * The aerodynamic numbers are calibrated so the derived figures land on the
 * design targets in docs/wing-flyer.md §3 (stall / cruise / top speed and
 * glide ratio). `e2e/170-wing-physics` measures them from the live model, so
 * a retune here that drifts off-target fails the suite.
 */

export type AirframeId = 'trainer' | 'wing'

export const AIRFRAME_IDS: readonly AirframeId[] = ['trainer', 'wing']

export const coerceAirframe = (v: unknown): AirframeId | undefined =>
  v === 'trainer' || v === 'wing' ? v : undefined

export interface AirframeSpec {
  id: AirframeId
  /** kg */
  mass: number
  /** Wing area, m². */
  wingArea: number
  /** Lift coefficient at zero angle of attack (camber). */
  cl0: number
  /** Lift-curve slope, per radian (finite wing). */
  clAlpha: number
  /** Critical angle of attack (stall), radians. */
  alphaCrit: number
  /** Fraction of peak lift left once fully stalled. */
  stallLiftFrac: number
  /** Parasitic drag coefficient. */
  cd0: number
  /** Induced-drag factor k = 1/(π·e·AR). */
  k: number
  /** Side-force coefficient per radian of sideslip. */
  cyBeta: number
  /** Static thrust at full throttle, N. */
  thrustMax: number
  /** Propeller pitch speed, m/s — thrust falls to zero at this airspeed. */
  vPitch: number
  /** Max commanded body rates, rad/s. */
  maxRoll: number
  maxPitch: number
  maxYaw: number
  /** Trimmed angle of attack, radians: hands-off the nose settles here, so
   * the plane seeks its cruise speed (speed stability). */
  alphaTrim: number
  /** Airspeed at which control authority reaches 100 %, m/s. */
  vAuthority: number
  /** Has a rudder (the trainer) — the wing's yaw is always automatic. */
  rudder: boolean
  /** Has wheels — can take off from the runway (the wing belly-lands). */
  wheels: boolean
}

const DEG = Math.PI / 180

/** High-wing trainer — modelled on an E-flite Apprentice-class foamie:
 * stall ≈ 7, cruise ≈ 13, top ≈ 20 m/s, glide ratio ≈ 8. */
export const TRAINER: AirframeSpec = {
  id: 'trainer',
  mass: 1.2,
  wingArea: 0.29,
  cl0: 0.2,
  clAlpha: 4.2,
  alphaCrit: 16 * DEG,
  stallLiftFrac: 0.6,
  cd0: 0.059,
  k: 0.066,
  cyBeta: 0.8,
  thrustMax: 12.9,
  vPitch: 30,
  maxRoll: 150 * DEG,
  maxPitch: 90 * DEG,
  maxYaw: 45 * DEG,
  alphaTrim: 2.6 * DEG,
  vAuthority: 13,
  rudder: true,
  wheels: true,
}

/** FPV flying wing — modelled on a ZOHD Dart XL-class foam delta:
 * stall ≈ 9, cruise ≈ 18, top ≈ 30 m/s, glide ratio ≈ 12. */
export const WING: AirframeSpec = {
  id: 'wing',
  mass: 1.1,
  wingArea: 0.196,
  cl0: 0.05,
  clAlpha: 3.8,
  alphaCrit: 16 * DEG,
  stallLiftFrac: 0.55,
  cd0: 0.0231,
  k: 0.075,
  cyBeta: 0.6,
  thrustMax: 10.3,
  vPitch: 40,
  maxRoll: 300 * DEG,
  maxPitch: 140 * DEG,
  maxYaw: 60 * DEG,
  alphaTrim: 3.4 * DEG,
  vAuthority: 18,
  rudder: false,
  wheels: false,
}

export const AIRFRAMES: Record<AirframeId, AirframeSpec> = {
  trainer: TRAINER,
  wing: WING,
}
