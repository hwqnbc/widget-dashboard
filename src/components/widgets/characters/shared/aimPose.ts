/**
 * Live aim/fire pose fed to a weaponized avatar `Model3D` when it is reused as
 * an in-game enemy (Drone Strike's rooftop soldiers). The pool writes this
 * ref every frame and the model reads it in its own `useFrame` — a zero-render
 * path (no `action` prop churn, no React state), parallel to how `AaTurret`
 * consumes its `TurretAim` ref.
 */
export interface AimPose {
  /** Weapon elevation toward the target, radians (positive = aim up). */
  pitch: number
  /** Firing-pose signal: fraction of the fire clip remaining, in (0, 1] right
   * after a shot, decaying to 0 (idle). The model plays its recoil / muzzle
   * flash / launch pose strongest near 1. */
  fire: number
}
