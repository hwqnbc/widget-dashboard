import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { createControlInput } from '../droneSim/flightModel'
import DroneModel from '../droneSim/DroneModel'

/** Waves field at most this many enemies at once (see waveLayout). */
const MAX_ENEMY_RENDER = 4

/**
 * Enemy drones as real quadcopter models (≤4 per wave). A fixed set of
 * groups is allocated once; each frame the alive enemies are assigned to
 * slots — position + heading written imperatively, spare slots hidden. The
 * red beacon on top separates them from the player's craft at a glance.
 */
export default function EnemyDrones({
  targets,
}: {
  targets: readonly {
    alive: boolean
    kind: string
    pos: { x: number; y: number; z: number }
    vel: { x: number; y: number; z: number }
  }[]
}) {
  const groupRefs = useRef<(Group | null)[]>([])
  // Rotors idle at hover speed — the model reads throttle from controls.
  const neutral = useRef(createControlInput()).current

  useFrame(() => {
    let slot = 0
    for (const t of targets) {
      if (!t.alive || t.kind !== 'enemy' || slot >= MAX_ENEMY_RENDER) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(t.pos.x, t.pos.y, t.pos.z)
        // Nose (-Z at yaw 0) into the direction of travel.
        if (t.vel.x !== 0 || t.vel.z !== 0) {
          g.rotation.y = Math.atan2(-t.vel.x, -t.vel.z)
        }
      }
      slot++
    }
    for (; slot < MAX_ENEMY_RENDER; slot++) {
      const g = groupRefs.current[slot]
      if (g) g.visible = false
    }
  })

  return (
    <>
      {Array.from({ length: MAX_ENEMY_RENDER }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
        >
          <DroneModel controls={neutral} />
          <mesh position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.09, 12, 8]} />
            <meshBasicMaterial color="#ff1744" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
