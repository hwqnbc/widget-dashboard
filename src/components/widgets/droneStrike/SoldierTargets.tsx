import { Suspense, lazy } from 'react'
import ModelTargets from './ModelTargets'
import type { Vec3 } from '../droneSim/flightModel'
import type { TargetState } from './waveLayout'

// Rooftop soldiers reuse the weaponized avatar 3D models as in-game enemies.
// Resolve the `Model3D`s **directly** (not through `avatarRegistry`) so
// three.js stays out of the main chunk — the same lazy-chunk discipline the
// registry itself uses. Both are low-spec by construction (only
// meshStandardMaterial, no transmission/physical/persistent emissive), but
// they're ~45–60 meshes each, so the pool is capped small (draw-call cost,
// not material cost — see docs/lessons.md).
const ScarModel3D = lazy(() => import('../characters/scar/ScarModel3D'))
const BazookaJoeModel3D = lazy(() => import('../characters/bazookajoe/BazookaJoeModel3D'))

/** Waves field at most this many rooftop soldiers at once (see waveLayout's
 * cap: `min(1 + ⌊wave/3⌋, 2, enemyCap)`). */
const MAX_SOLDIER_RENDER = 2
/** Avatar models stand ~1.85u; a slight upscale reads as a full-size figure
 * on the roof without dwarfing the AA turret beside it. */
const SCALE = 1.2
/** The hit sphere is seated at `b.h + 0.9` (torso); the model's feet are at
 * its own origin, so drop the group by that torso offset to plant the boots
 * on the roof surface (`b.h`). */
const TORSO_LIFT = 0.9

/**
 * Rooftop-stationed avatar soldiers — a new distinctive threat that rewards
 * looking around the city (the deck already has trucks/cars/turrets; rooftops
 * were unused). Rendered from the Scar / Bazooka Joe avatar `Model3D`s via the
 * shared `ModelTargets` pool. Two knobs it doesn't share with the road pools,
 * both driven through the pool's `onFrame` hook (no `ModelTargets` change):
 *  - **rooftop Y** — `ModelTargets` seats every slot on the deck (y ignores
 *    `t.pos.y`); we override it to plant the soldier on its building roof.
 *  - **face the player** — a stationed sniper turns to track the drone
 *    (models face +Z, so a plain `atan2(dx, dz)` with no negation).
 * Fire is the AA turret's exact behaviour (`stepTurret` in StrikeRig): holds
 * fire until the difficulty's fireWave, then slow LOS-checked bolts.
 */
export default function SoldierTargets({
  targets,
  playerPos,
}: {
  targets: readonly TargetState[]
  playerPos: Vec3
}) {
  return (
    <ModelTargets
      targets={targets}
      kind="soldier"
      max={MAX_SOLDIER_RENDER}
      scale={SCALE}
      onFrame={(t, _slot, g) => {
        g.position.y = t.pos.y - TORSO_LIFT
        const dx = playerPos.x - t.pos.x
        const dz = playerPos.z - t.pos.z
        if (dx !== 0 || dz !== 0) g.rotation.y = Math.atan2(dx, dz)
      }}
      renderModel={(slot) => (
        <Suspense fallback={null}>
          {slot % 2 ? <BazookaJoeModel3D /> : <ScarModel3D />}
        </Suspense>
      )}
    />
  )
}
