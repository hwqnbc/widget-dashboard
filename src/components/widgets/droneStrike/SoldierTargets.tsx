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

/** Waves field at most this many soldiers at once (see waveLayout's cap:
 * `min(1 + ⌊wave/3⌋, 3, enemyCap)` — rooftop + ground combined). */
const MAX_SOLDIER_RENDER = 3
/** Avatar models stand ~1.85u; a slight upscale reads as a full-size figure
 * without dwarfing the AA turret beside it. */
const SCALE = 1.2
/** The hit sphere is seated at feet + 0.9 (torso) — `b.h + 0.9` on a roof,
 * `0.9` on the ground; drop the group by that offset to plant the boots on
 * the surface (roof or y = 0). */
const TORSO_LIFT = 0.9
/** Speed (u/s) above which a soldier is "walking" (drives facing + bob). */
const WALK_EPS = 0.05

/**
 * Patrolling avatar soldiers — a distinctive threat that rewards looking
 * around (and up over) the city. Each is one of two **variants** (from the
 * wave spec, so weapon + model always agree): variant 0 = **Bazooka Joe**
 * (rocket) or variant 1 = **Scar** (SMG); and it patrols either a **rooftop**
 * (paces its building) or the **open ground** (a free-roam beat). Movement is
 * the seeded sinusoidal `stepDrift` (no bespoke step) — SoldierTargets only
 * renders. Rendered via the shared `ModelTargets` pool with soldier-specific
 * behaviours driven through its `onFrame` hook (no `ModelTargets` change):
 *  - **feet on the surface** — `ModelTargets` seats every slot on the deck (y
 *    ignores `t.pos.y`); we override it to `t.pos.y - TORSO_LIFT`, which plants
 *    the boots on the roof (`b.h`) or the ground (`0`) alike, plus a small
 *    **walk bob** while moving (no leg gait — the operator-figure trick).
 *  - **face + aim** — the body yaws into its **travel** direction while
 *    walking and snaps to the **player** while firing (a single body yaw,
 *    arbitrated by `fireTimer`, slewed shortest-arc); a per-slot aim ref
 *    (`{ pitch, fire }`, the `TurretTargets` pattern) elevates the weapon
 *    toward the drone and plays the model's one-shot fire pose. The model
 *    reads the ref in its own `useFrame` (zero renders).
 *  - **variant model** — both models are mounted per slot; `onFrame` toggles
 *    which is visible by the assigned target's `variant` (robust to pool
 *    compaction when a sibling soldier dies).
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
  // Per-slot body yaw we own — `ModelTargets` resets `g.rotation.y` before
  // `onFrame`, so we can't slew off the group; keep our own and set it
  // absolutely each frame (undefined = snap on first sight).
  const yawState = useRef<number[]>([]).current

  return (
    <ModelTargets
      targets={targets}
      kind="soldier"
      max={MAX_SOLDIER_RENDER}
      scale={SCALE}
      onFrame={(t, slot, g) => {
        const dx = playerPos.x - t.pos.x
        const dy = playerPos.y - t.pos.y
        const dz = playerPos.z - t.pos.z
        const speed = Math.hypot(t.vel.x, t.vel.z)
        const walking = speed > WALK_EPS
        // Body yaw: face travel while walking, face the player while firing (or
        // standing). One yaw, slewed shortest-arc from our own accumulator.
        const targetYaw =
          t.fireTimer > 0 || !walking ? Math.atan2(dx, dz) : Math.atan2(t.vel.x, t.vel.z)
        let cur = yawState[slot]
        if (cur === undefined) cur = targetYaw
        let d = targetYaw - cur
        d = Math.atan2(Math.sin(d), Math.cos(d))
        cur += d * 0.2
        yawState[slot] = cur
        g.rotation.y = cur
        // Feet on the surface + a subtle walk bob (position-derived, fades at
        // the beat's turnarounds where speed → 0; no leg animation).
        const along = t.driftAxis === 0 ? t.pos.x : t.pos.z
        const bob = walking ? Math.abs(Math.sin(along * 6)) * 0.05 * Math.min(1, speed / 0.8) : 0
        g.position.y = t.pos.y - TORSO_LIFT + bob
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
