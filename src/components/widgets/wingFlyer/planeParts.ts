import type { Group } from 'three'

/** Animated parts the rig drives each frame (filled by ref callbacks).
 * Hinge rotations: positive `rotation.x` moves a trailing edge DOWN;
 * positive `rotation.y` moves the rudder's trailing edge RIGHT. */
export interface PlaneParts {
  /** Trainer: ailerons. Wing: elevons (aileron + elevator mixed). */
  surfL: Group | null
  surfR: Group | null
  elevator: Group | null
  rudder: Group | null
  prop: Group | null
}

export const createPlaneParts = (): PlaneParts => ({
  surfL: null,
  surfR: null,
  elevator: null,
  rudder: null,
  prop: null,
})
