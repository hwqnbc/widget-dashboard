import { Suspense, lazy, useRef } from 'react'
import type { Group } from 'three'
import ModelTargets from './ModelTargets'
import type { Vec3 } from '../droneSim/flightModel'
import type { TargetState } from './waveLayout'
import { SOLDIER_FIRE_CLIP } from './enemyAI'
import type { AimPose } from '../characters/shared/aimPose'

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
 * Rooftop-stationed avatar soldiers — a distinctive threat that rewards
 * looking around the city. Each soldier is one of two **variants** (from the
 * wave spec, so weapon + model always agree): variant 0 = **Bazooka Joe**
 * (launches a rocket) or variant 1 = **Scar** (SMG). Rendered via the shared
 * `ModelTargets` pool with three soldier-specific behaviours driven through
 * its `onFrame` hook (no `ModelTargets` change):
 *  - **rooftop Y** — `ModelTargets` seats every slot on the deck (y ignores
 *    `t.pos.y`); we override it to plant the soldier on its building roof.
 *  - **face + aim the weapon** — the body yaws to the player, and a per-slot
 *    aim ref (`{ pitch, fire }`, the `TurretTargets` pattern) is written each
 *    frame: `pitch` elevates the weapon toward the drone; `fire` (the target's
 *    `fireTimer` normalised) plays the model's one-shot recoil / muzzle-flash /
 *    launch pose. The model reads the ref in its own `useFrame` (zero renders).
 *  - **variant model** — both models are mounted per slot; `onFrame` toggles
 *    which is visible by the assigned target's `variant`, so a Bazooka target
 *    always shows the launcher and a Scar target the SMG even if a sibling
 *    soldier dies and the pool compacts slots.
 * Fire itself is the AA turret's behaviour (`stepTurret` in StrikeRig), with
 * the variant's weapon (rocket / SMG) and a muzzle-offset origin.
 */
export default function SoldierTargets({
  targets,
  playerPos,
}: {
  targets: readonly TargetState[]
  playerPos: Vec3
}) {
  // One stable aim object per slot — the models read `.current` each frame.
  const aimRefs = useRef(
    Array.from(
      { length: MAX_SOLDIER_RENDER },
      () => ({ current: { pitch: 0, fire: 0 } as AimPose | null }),
    ),
  ).current
  // Per-slot wrapper groups for the two models, so `onFrame` can show the one
  // matching the assigned target's variant and hide the other.
  const rocketRefs = useRef<(Group | null)[]>([])
  const gunRefs = useRef<(Group | null)[]>([])

  return (
    <ModelTargets
      targets={targets}
      kind="soldier"
      max={MAX_SOLDIER_RENDER}
      scale={SCALE}
      onFrame={(t, slot, g) => {
        g.position.y = t.pos.y - TORSO_LIFT
        const dx = playerPos.x - t.pos.x
        const dy = playerPos.y - t.pos.y
        const dz = playerPos.z - t.pos.z
        if (dx !== 0 || dz !== 0) g.rotation.y = Math.atan2(dx, dz)
        const aim = aimRefs[slot].current
        if (aim) {
          aim.pitch = Math.atan2(dy, Math.hypot(dx, dz))
          aim.fire = t.fireTimer > 0 ? t.fireTimer / SOLDIER_FIRE_CLIP : 0
        }
        // Variant 0 = rocket (Bazooka Joe), 1 = SMG (Scar).
        const isRocket = t.variant === 0
        const rk = rocketRefs.current[slot]
        const gn = gunRefs.current[slot]
        if (rk) rk.visible = isRocket
        if (gn) gn.visible = !isRocket
      }}
      renderModel={(slot) => (
        <>
          <group
            ref={(el) => {
              rocketRefs.current[slot] = el
            }}
          >
            <Suspense fallback={null}>
              <BazookaJoeModel3D aimRef={aimRefs[slot]} />
            </Suspense>
          </group>
          <group
            ref={(el) => {
              gunRefs.current[slot] = el
            }}
          >
            <Suspense fallback={null}>
              <ScarModel3D aimRef={aimRefs[slot]} />
            </Suspense>
          </group>
        </>
      )}
    />
  )
}
