import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshBasicMaterial } from 'three'
import { createControlInput } from '../droneSim/flightModel'
import DroneModel from '../droneSim/DroneModel'

/** Waves field at most this many enemies at once (see waveLayout). */
const MAX_ENEMY_RENDER = 4
/** Beacon tint per enemy variant: orbiter red, kamikaze chaser orange (the
 * "get away from me" colour — mirrors nothing else in the palette). */
const BEACON_ORBITER = '#ff1744'
const BEACON_CHASER = '#ff9100'

/**
 * Enemy drones as real quadcopter models (≤4 per wave). A fixed set of
 * groups is allocated once; each frame the alive enemies are assigned to
 * slots — position + heading written imperatively, spare slots hidden. The
 * beacon on top separates them from the player's craft at a glance, and its
 * colour marks the variant (a chaser also pitches nose-down while it
 * pursues — speed-proportional, so the dive reads as intent).
 */
export default function EnemyDrones({
  targets,
}: {
  targets: readonly {
    alive: boolean
    kind: string
    variant: 0 | 1
    pos: { x: number; y: number; z: number }
    vel: { x: number; y: number; z: number }
  }[]
}) {
  const groupRefs = useRef<(Group | null)[]>([])
  const beaconRefs = useRef<(MeshBasicMaterial | null)[]>([])
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
        // A pursuing chaser tips forward with speed (orbiters stay level).
        const speed = Math.hypot(t.vel.x, t.vel.z)
        g.rotation.x = t.variant === 1 ? Math.min(0.35, speed * 0.06) : 0
        const beacon = beaconRefs.current[slot]
        if (beacon) beacon.color.set(t.variant === 1 ? BEACON_CHASER : BEACON_ORBITER)
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
            <meshBasicMaterial
              ref={(el) => {
                beaconRefs.current[i] = el
              }}
              color="#ff1744"
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
