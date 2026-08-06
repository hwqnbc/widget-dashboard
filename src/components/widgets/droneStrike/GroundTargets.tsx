import MilitaryTruck from '../modelViewer/models/MilitaryTruck'
import ModelTargets from './ModelTargets'
import type { TargetState } from './waveLayout'

/** Waves field at most this many supply trucks at once (see waveLayout's cap:
 * `min(2 + ⌊wave/3⌋, 4)`). */
const MAX_GROUND_RENDER = 4
/** The ~3.8-unit-long MilitaryTruck trimmed so its footprint matches the old
 * box (radius 1.1 → ~2.4 long) / the ~1-radius hit sphere. */
const SCALE = 0.6

/**
 * Static ground supply trucks rendered as the MilitaryTruck model (reused
 * from the Model Viewer widget) — far more legible than the old olive box.
 * A model pool via the shared `ModelTargets`: parked (wheels still, so
 * `animate={false}`), seated on the deck (the model's base sits at its own
 * origin, so no lift), each slot given a deterministic yaw for variety. Hit
 * detection is unchanged (keyed on the target's `pos`/`radius`); hp 1 =
 * instant kill, so no hit-flash tint. (Cars → `CarTargets`, AA turrets →
 * `TurretTargets`.)
 */
export default function GroundTargets({ targets }: { targets: readonly TargetState[] }) {
  return (
    <ModelTargets
      targets={targets}
      kind="ground"
      max={MAX_GROUND_RENDER}
      scale={SCALE}
      renderModel={() => <MilitaryTruck animate={false} />}
    />
  )
}
