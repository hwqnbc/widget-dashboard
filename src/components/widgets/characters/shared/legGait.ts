/**
 * Shared leg-gait rig for the avatar `Model3D`s — the first thing in the repo
 * that actually animates legs (everything else sells walking with a body-bob).
 * Used by the Drone Strike patrol soldiers (Scar / Bazooka Joe); any avatar can
 * adopt it.
 *
 * **Hip-pivot convention** (already matched by BazookaJoeModel3D's kneel legs):
 * wrap each leg's meshes in a `<group>` pivoted at the hip `[±0.14, 0.5, 0]`
 * with the meshes offset −0.5 in y (so the box centre that was at world y≈0.27
 * sits at local y≈−0.23, the boot at ≈−0.45). Swinging that group's
 * `rotation.x` then rotates the whole leg about the hip — forward/back stride.
 *
 * **Driving it**: the model keeps a `walkPhase` accumulator advanced by the
 * live ground speed (`AimPose.speed`) each frame — `walkPhase += speed * dt *
 * GAIT_RATE` — and reads `legGait(walkPhase, speed)` for the two hip angles.
 * The legs swing in opposite phase, amplitude scaled by speed so they ease to
 * neutral (0) as the soldier stops at a turnaround. Pure + allocation-free
 * (writes into a caller-owned scratch object); no three import.
 */

/** Radians of hip swing at full stride (peak forward/back). */
export const GAIT_STRIDE = 0.7
/** Walk-cycle rate multiplier on distance travelled (higher = quicker steps). */
export const GAIT_RATE = 2.2
/** Speed (u/s) at which the stride reaches full amplitude. */
const GAIT_FULL_SPEED = 1.4
/** Nominal speed a canned `action: 'walk'` walk-in-place strides at (full
 * amplitude) — shared by every avatar model's `'walk'` branch and the Drone
 * Sim operator so a walking figure looks the same everywhere. */
export const WALK_ACTION_SPEED = 1.4

export interface LegSwing {
  left: number
  right: number
}

/**
 * Opposite-phase hip angles for a walk cycle at `phase` (radians), scaled by
 * `speed` so the stride fades out when standing. Writes into `out` (reuse a
 * per-model scratch object to stay allocation-free) and returns it.
 */
export function legGait(phase: number, speed: number, out: LegSwing): LegSwing {
  const amp = GAIT_STRIDE * Math.min(1, speed / GAIT_FULL_SPEED)
  const s = Math.sin(phase) * amp
  out.left = s
  out.right = -s
  return out
}
