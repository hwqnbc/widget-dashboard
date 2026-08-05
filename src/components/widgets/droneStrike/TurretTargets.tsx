import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import AaTurret from '../modelViewer/models/AaTurret'
import type { TurretAim } from '../modelViewer/models/AaTurret'
import type { Vec3 } from '../droneSim/flightModel'
import type { TargetState } from './waveLayout'

/** Waves field at most this many AA turrets at once (see waveLayout's cap). */
const MAX_TURRET_RENDER = 2
/** The model self-scales to ~2.6 units; trim it so the emplacement roughly
 * matches the ~1-radius hit sphere / the old box footprint. */
const SCALE = 0.8

/**
 * AA turret targets rendered as the AaTurret model (reused from the Model
 * Viewer widget). A fixed pool of groups is allocated once; each frame the
 * alive `turret` targets are assigned to slots and positioned on the deck
 * (the model's base sits at its own origin, so no lift), spare slots hidden.
 * Each turret's head + barrel **track the player**: we feed the model a
 * per-slot `aimRef` (bearing + elevation from the emplacement to the drone)
 * that it slews toward, so the gun points where `stepTurret` shoots.
 */
export default function TurretTargets({
  targets,
  playerPos,
}: {
  targets: readonly TargetState[]
  playerPos: Vec3
}) {
  const groupRefs = useRef<(Group | null)[]>([])
  // One stable aim object per slot — AaTurret reads `.current` each frame.
  const aimRefs = useRef(
    Array.from(
      { length: MAX_TURRET_RENDER },
      () => ({ current: { yaw: 0, pitch: 0 } as TurretAim | null }),
    ),
  ).current

  useFrame(() => {
    let slot = 0
    for (const t of targets) {
      if (!t.alive || t.kind !== 'turret' || slot >= MAX_TURRET_RENDER) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(t.pos.x, 0, t.pos.z)
      }
      // Bearing + elevation from the emplacement to the drone (the outer
      // group has no rotation, so local axes match world).
      const dx = playerPos.x - t.pos.x
      const dz = playerPos.z - t.pos.z
      const dy = playerPos.y - t.pos.y
      const aim = aimRefs[slot].current
      if (aim) {
        aim.yaw = Math.atan2(dx, dz)
        aim.pitch = Math.atan2(dy, Math.hypot(dx, dz))
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
          <AaTurret animate={false} aimRef={aimRefs[i]} />
        </group>
      ))}
    </>
  )
}
