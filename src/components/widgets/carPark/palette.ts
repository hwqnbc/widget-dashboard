import type { Vehicle } from './carParkModel'

/** Shared by the 2D board and the lazy 3D view so a vehicle keeps its
 * colour across the toggle. */
/** The red target car. Brighter/purer than a typical "red car" so it pops. */
export const TARGET_COLOR = '#ff1f1f'
/**
 * Everyone else. RULE: no hue within 50° of the target's red (no orange,
 * pink, magenta or reddish brown) — the target must never blend in at a
 * glance. Pinned by the e2e suite (152-carpark). Cars and trucks cycle
 * separate palettes so a truck reads as heavier.
 */
export const CAR_COLORS = ['#1e88e5', '#43a047', '#00acc1', '#ffeb3b', '#5c6bc0', '#9ccc65', '#4fc3f7', '#78909c']
export const TRUCK_COLORS = ['#3949ab', '#00897b', '#546e7a', '#9e9d24']
/** The target's livery accents (both views). */
export const TARGET_TRIM = '#ffd600'
export const TARGET_STRIPE = '#ffffff'

export function vehicleColor(v: Vehicle, vi: number): string {
  if (vi === 0) return TARGET_COLOR
  return v.len === 3 ? TRUCK_COLORS[vi % TRUCK_COLORS.length] : CAR_COLORS[vi % CAR_COLORS.length]
}
