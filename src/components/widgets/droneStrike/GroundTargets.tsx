import MilitaryTruck from '../modelViewer/models/MilitaryTruck'
import ModelTargets from './ModelTargets'
import type { TargetState } from './waveLayout'

/** Waves field at most this many supply trucks at once (see waveLayout's cap:
 * `min(1 + ⌊wave/3⌋, 4)`). */
const MAX_GROUND_RENDER = 4
/** The ~3.8-unit-long MilitaryTruck trimmed so its footprint matches the
 * ~1-radius hit sphere / the deck. */
const SCALE = 0.6

/**
 * Ground military supply trucks rendered as the MilitaryTruck model (reused
 * from the Model Viewer widget). Like the SWAT cars, they are **moving road
 * vehicles** from wave 1 — a model pool via the shared `ModelTargets`, seated
 * on the deck (the model's base sits at its own origin, so no lift), animated
 * (wheels spin) and yawed into their travel direction (the truck's front is
 * +Z, no negation). Hit detection is unchanged (keyed on the target's
 * `pos`/`radius`); hp 1 = instant kill, so no hit-flash tint. (SWAT cars →
 * `CarTargets`, AA turrets → `TurretTargets`.)
 */
export default function GroundTargets({ targets }: { targets: readonly TargetState[] }) {
  return (
    <ModelTargets
      targets={targets}
      kind="ground"
      max={MAX_GROUND_RENDER}
      scale={SCALE}
      faceVelocity
      renderModel={() => <MilitaryTruck animate lowSpec />}
    />
  )
}
