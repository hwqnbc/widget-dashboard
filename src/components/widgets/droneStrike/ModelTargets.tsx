import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { TargetKind, TargetState } from './waveLayout'

/**
 * Generic model-target pool — the shared shape behind every model-rendered
 * target kind (supply trucks, cars; and the seam for future ground enemies).
 * A fixed pool of `max` outer `<group>`s is allocated once; each frame the
 * alive targets of `kind` are assigned to slots, positioned on the deck and
 * (optionally) yawed into their travel direction, and spare slots are hidden.
 *
 * Kinds differ only in a few knobs, so they're props rather than bespoke
 * components:
 *  - `faceVelocity` — movers (cars) yaw into `vel`; models face +Z, so no
 *    negation (unlike the drone's −Z nose). Static kinds instead get a
 *    deterministic per-slot yaw so identical models don't all align.
 *  - `groundLift` — y seat for models whose origin isn't at their feet.
 *  - `onFrame(t, slot, group)` — per-slot hook run after placement. This is
 *    the aim seam: a stationed shooter (AA turret today, a future
 *    rooftop/patrolling avatar-soldier) computes a bearing to the player here
 *    and feeds it to the model (see `TurretTargets`' `aimRef`).
 *  - `renderModel(slot)` — the model element for each slot (a caller that
 *    needs per-slot state, e.g. an aim ref, binds it here).
 */
export default function ModelTargets({
  targets,
  kind,
  max,
  scale,
  groundLift = 0,
  faceVelocity = false,
  onFrame,
  renderModel,
}: {
  targets: readonly TargetState[]
  kind: TargetKind
  max: number
  scale: number
  groundLift?: number
  faceVelocity?: boolean
  onFrame?: (t: TargetState, slot: number, group: Group) => void
  renderModel: (slot: number) => ReactNode
}) {
  const groupRefs = useRef<(Group | null)[]>([])

  useFrame(() => {
    let slot = 0
    for (const t of targets) {
      if (!t.alive || t.kind !== kind || slot >= max) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(t.pos.x, groundLift, t.pos.z)
        if (faceVelocity) {
          if (t.vel.x !== 0 || t.vel.z !== 0) {
            g.rotation.y = Math.atan2(t.vel.x, t.vel.z)
          }
        } else {
          // Deterministic spread so a row of identical static models (e.g.
          // parked trucks) don't all face the same way.
          g.rotation.y = slot * 1.7
        }
        onFrame?.(t, slot, g)
      }
      slot++
    }
    for (; slot < max; slot++) {
      const g = groupRefs.current[slot]
      if (g) g.visible = false
    }
  })

  return (
    <>
      {Array.from({ length: max }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
          scale={scale}
        >
          {renderModel(i)}
        </group>
      ))}
    </>
  )
}
