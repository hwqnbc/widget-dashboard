/**
 * Haptic feedback for the drone simulator — thin wrapper over
 * `navigator.vibrate`, which exists on Android Chrome and friends but not on
 * iOS Safari or desktop. Everything degrades to a silent no-op when the API
 * is missing, so callers never need to check support themselves.
 */

export const hapticsSupported =
  typeof navigator !== 'undefined' && 'vibrate' in navigator

export function vibrate(pattern: number | number[]): void {
  if (!hapticsSupported) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // some browsers throw on vibrate without user activation — never fatal
  }
}

/** Crisp double-tick when threading a gate. */
export const GATE_PULSE = [25, 40, 25]
/** Heavy thud when a hard impact starts the crash tumble. */
export const CRASH_PULSE = [100, 60, 160]
/** Little celebration when a lap is banked. */
export const LAP_PULSE = [30, 50, 30, 50, 90]

/** Below this impact speed (u/s) a wall touch stays silent. */
export const CONTACT_MIN_IMPACT = 1.5
/** Minimum gap between contact pulses — wall scraping re-registers impact
 * every frame and would buzz continuously otherwise. */
export const CONTACT_COOLDOWN_MS = 250

/** Contact buzz scales with impact speed, capped at a short 60 ms. */
export const contactPulse = (impact: number) =>
  Math.min(60, Math.round(impact * 8))
