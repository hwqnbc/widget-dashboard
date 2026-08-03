import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import LegoSwatTruck from '../modelViewer/models/LegoSwatTruck'
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
 * Model Viewer widget) — far more legible than the old instanced box. A
 * fixed pool of groups is allocated once; each frame the alive `car` targets
 * are assigned to slots, positioned on the deck and yawed into their travel
 * direction (the truck's front is +Z, so no negation — unlike the drone's
 * −Z nose), and spare slots are hidden. The truck spins its own wheels.
 */
export default function CarTargets({ targets }: { targets: readonly TargetState[] }) {
  const groupRefs = useRef<(Group | null)[]>([])

  useFrame(() => {
    let slot = 0
    for (const t of targets) {
      if (!t.alive || t.kind !== 'car' || slot >= MAX_CAR_RENDER) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(t.pos.x, GROUND_LIFT, t.pos.z)
        if (t.vel.x !== 0 || t.vel.z !== 0) {
          g.rotation.y = Math.atan2(t.vel.x, t.vel.z)
        }
      }
      slot++
    }
    for (; slot < MAX_CAR_RENDER; slot++) {
      const g = groupRefs.current[slot]
      if (g) g.visible = false
    }
  })

  return (
    <>
      {Array.from({ length: MAX_CAR_RENDER }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
          scale={SCALE}
        >
          <LegoSwatTruck animate />
        </group>
      ))}
    </>
  )
}
