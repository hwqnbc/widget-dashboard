import LegoSwatTruck from '../modelViewer/models/LegoSwatTruck'
import ModelTargets from './ModelTargets'
import type { TargetState } from './waveLayout'

/** Waves field at most this many cars at once (see waveLayout's cap). */
const MAX_CAR_RENDER = 3
/** Scale the ~2.6-unit-long truck down so its footprint matches the ~1-unit
 * car hit sphere. */
const SCALE = 0.7
/** The model's wheels sit ~0.3 below its own origin; lift the group so they
 * rest on the deck. */
const GROUND_LIFT = 0.3 * SCALE

/**
 * Moving car targets rendered as the LEGO SWAT truck model (reused from the
 * Model Viewer widget) — far more legible than the old instanced box. A model
 * pool via the shared `ModelTargets`: alive `car` targets are seated on the
 * deck and yawed into their travel direction (the truck's front is +Z, so no
 * negation — unlike the drone's −Z nose). The truck spins its own wheels.
 */
export default function CarTargets({ targets }: { targets: readonly TargetState[] }) {
  return (
    <ModelTargets
      targets={targets}
      kind="car"
      max={MAX_CAR_RENDER}
      scale={SCALE}
      groundLift={GROUND_LIFT}
      faceVelocity
      renderModel={() => <LegoSwatTruck animate />}
    />
  )
}
