import type { Vehicle } from './carParkModel'

/** Shared by the 2D board and the lazy 3D view so a vehicle keeps its
 * colour across the toggle. */
export const TARGET_COLOR = '#e53935'
/** Cars and trucks cycle separate palettes so a truck reads as heavier. */
export const CAR_COLORS = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#fdd835', '#6d4c41', '#d81b60']
export const TRUCK_COLORS = ['#3949ab', '#00897b', '#546e7a', '#9e9d24']

export function vehicleColor(v: Vehicle, vi: number): string {
  if (vi === 0) return TARGET_COLOR
  return v.len === 3 ? TRUCK_COLORS[vi % TRUCK_COLORS.length] : CAR_COLORS[vi % CAR_COLORS.length]
}
