import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import AaTurret from '../modelViewer/models/AaTurret'
import type { TargetState } from './waveLayout'

/** Waves field at most this many AA turrets at once (see waveLayout's cap). */
const MAX_TURRET_RENDER = 2
/** The model self-scales to ~2.6 units; trim it so the emplacement roughly
 * matches the ~1-radius hit sphere / the old box footprint. */
const SCALE = 0.8

/**
 * AA turret targets rendered as the AaTurret model (reused from the Model
 * Viewer widget) — a legible emplacement in place of the old dark-red box.
 * A fixed pool of groups is allocated once; each frame the alive `turret`
 * targets are assigned to slots and positioned on the deck (the model's base
 * sits at its own origin, so no lift), spare slots hidden. Turrets are
 * static, so no rotation — the model self-traverses its head + elevates the
 * barrel via `animate`, reading as a live, scanning emplacement.
 */
export default function TurretTargets({ targets }: { targets: readonly TargetState[] }) {
  const groupRefs = useRef<(Group | null)[]>([])

  useFrame(() => {
    let slot = 0
    for (const t of targets) {
      if (!t.alive || t.kind !== 'turret' || slot >= MAX_TURRET_RENDER) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(t.pos.x, 0, t.pos.z)
      }
      slot++
    }
    for (; slot < MAX_TURRET_RENDER; slot++) {
      const g = groupRefs.current[slot]
      if (g) g.visible = false
    }
  })

  return (
    <>
      {Array.from({ length: MAX_TURRET_RENDER }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
          scale={SCALE}
        >
          <AaTurret animate />
        </group>
      ))}
    </>
  )
}
