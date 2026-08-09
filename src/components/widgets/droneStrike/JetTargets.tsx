import { Suspense, lazy, useRef } from 'react'
import ModelTargets from './ModelTargets'
import type { Vec3 } from '../droneSim/flightModel'
import type { TargetState } from './waveLayout'
import { SOLDIER_FIRE_CLIP } from './enemyAI'
import type { AimPose } from '../characters/shared/aimPose'

// Jet troopers reuse the Jet Trooper avatar's 3D model as an in-game flying
// enemy. Resolve the `Model3D` **directly** (not through `avatarRegistry`) so
// three.js stays out of the main chunk — the same lazy-chunk discipline
// SoldierTargets uses. Low-spec by construction (only meshStandardMaterial,
// no transmission), but it's ~130 meshes — roughly 2× a soldier figure — so
// the pool is capped at the wave's own jet cap (draw-call cost).
const JetTrooperModel3D = lazy(() => import('../characters/jettrooper/JetTrooperModel3D'))

/** Waves field at most this many jets at once (see waveLayout's cap:
 * `min(1 + ⌊(wave−2)/3⌋, 2, enemyCap)`). */
const MAX_JET_RENDER = 2
/** Same figure scale as the soldiers, so the trooper reads as the same
 * character airborne. */
const SCALE = 1.2
/** The hit sphere is the trooper's torso; drop the group by the soldier's
 * torso offset so the figure hangs centred on it in the air. */
const TORSO_LIFT = 0.9

/**
 * Jet-trooper flying gunners — the Jet Trooper avatar airborne as a second
 * flying enemy beside the drones. Movement is the seeded sinusoidal
 * `stepDrift` (a horizontal hover-strafe; no bespoke step) and fire is the
 * AA turret's behaviour (`stepTurret` in StrikeRig) with the JET_BEAM,
 * so JetTargets only renders. Rendered via the shared `ModelTargets` pool:
 *  - **airborne anchor** — `ModelTargets` seats slots on the deck; we
 *    override y to `t.pos.y - TORSO_LIFT` so the figure hangs on its air
 *    hit-sphere (the model's own aimRef branch adds the hover bob + burning
 *    jets + trailing legs).
 *  - **face + aim** — the body yaws into travel while strafing and snaps to
 *    the player while firing (the SoldierTargets arbitration, own yaw
 *    accumulator since ModelTargets resets `rotation.y`); the per-slot
 *    `AimPose` elevates the beam gun and plays the fire flash/recoil.
 */
export default function JetTargets({
  targets,
  playerPos,
}: {
  targets: readonly TargetState[]
  playerPos: Vec3
}) {
  // One stable aim object per slot — the model reads `.current` each frame;
  // its presence alone puts the figure in the airborne flying-gunner stance.
  const aimRefs = useRef(
    Array.from(
      { length: MAX_JET_RENDER },
      () => ({ current: { pitch: 0, fire: 0, speed: 0 } as AimPose | null }),
    ),
  ).current
  // Per-slot body yaw we own — `ModelTargets` resets `g.rotation.y` before
  // `onFrame` (see SoldierTargets).
  const yawState = useRef<number[]>([]).current

  return (
    <ModelTargets
      targets={targets}
      kind="jet"
      max={MAX_JET_RENDER}
      scale={SCALE}
      onFrame={(t, slot, g) => {
        const dx = playerPos.x - t.pos.x
        const dy = playerPos.y - t.pos.y
        const dz = playerPos.z - t.pos.z
        const speed = Math.hypot(t.vel.x, t.vel.z)
        // Face travel while strafing, the player while firing (or hovering
        // at a strafe turnaround) — the soldier arbitration, airborne.
        const targetYaw =
          t.fireTimer > 0 || speed < 0.05 ? Math.atan2(dx, dz) : Math.atan2(t.vel.x, t.vel.z)
        let cur = yawState[slot]
        if (cur === undefined) cur = targetYaw
        let d = targetYaw - cur
        d = Math.atan2(Math.sin(d), Math.cos(d))
        cur += d * 0.2
        yawState[slot] = cur
        g.rotation.y = cur
        // Hang the figure on its air hit-sphere (the model bobs itself).
        g.position.y = t.pos.y - TORSO_LIFT
        const aim = aimRefs[slot].current
        if (aim) {
          aim.pitch = Math.atan2(dy, Math.hypot(dx, dz))
          aim.fire = t.fireTimer > 0 ? t.fireTimer / SOLDIER_FIRE_CLIP : 0
          aim.speed = speed
        }
      }}
      renderModel={(slot) => (
        <Suspense fallback={null}>
          <JetTrooperModel3D aimRef={aimRefs[slot]} />
        </Suspense>
      )}
    />
  )
}
