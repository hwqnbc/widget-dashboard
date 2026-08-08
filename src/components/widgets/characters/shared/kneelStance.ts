/**
 * Pure kneel-to-fire stance driver for a weaponized soldier model reused as an
 * in-game enemy (Drone Strike's Bazooka Joe). Advances a small stateful factor
 * toward "kneeling" (1) while the soldier is stationary and has recently fired,
 * and back toward "standing" (0) as it walks — so a soldier drops onto the
 * launcher knee to loose a rocket from a plant, then stands, and one caught
 * mid-stride fires upright (the kneel blends out with ground speed).
 *
 * Stateful across frames (an eased factor + a post-shot hold timer) but pure
 * and allocation-free — it mutates a caller-owned scratch object and returns
 * it, so it can be unit-tested off-canvas the same way `legGait` / `stepDrift`
 * are. The model reads `fire`/`speed` from its live `AimPose` ref and applies
 * `k` to the leg-fold / body-drop / brace pose in its own `useFrame`.
 */

export interface KneelState {
  /** Eased kneel factor in [0, 1] — 0 standing, 1 fully kneeling. */
  k: number
  /** Seconds of kneel still held after the last shot (keeps the stance up
   * across the gap between rockets so it reads as a firing pose). */
  hold: number
}

/** Ground speed (u/s) at/above which the kneel is fully suppressed (walking). */
export const KNEEL_WALK_SPEED = 0.8
/** Seconds the kneel is held after a shot before the soldier stands. */
export const KNEEL_HOLD = 1
/** Kneel raise/lower ease rate (per second). */
export const KNEEL_EASE = 6

/**
 * Advance the kneel stance one frame. `fire` is the model's firing signal
 * (>0 just after a shot, the `AimPose.fire` fraction), `speed` its ground
 * speed, `dt` the frame delta (seconds). Mutates and returns `s`.
 */
export function stepKneel(s: KneelState, fire: number, speed: number, dt: number): KneelState {
  if (fire > 0) s.hold = KNEEL_HOLD
  else s.hold = Math.max(0, s.hold - dt)
  const standF = 1 - Math.min(1, speed / KNEEL_WALK_SPEED)
  const target = (s.hold > 0 ? 1 : 0) * standF
  s.k += (target - s.k) * Math.min(1, dt * KNEEL_EASE)
  return s
}
