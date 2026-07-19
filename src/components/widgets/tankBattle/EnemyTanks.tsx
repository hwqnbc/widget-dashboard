import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { TankTargetState } from './battleLayout'
import { MAX_TANK_TARGETS } from './battleLayout'
import TankModel3D from './TankModel3D'
import { ENEMY_TANK_COLORS, HEAVY_TANK_COLORS } from './tankColors'

/**
 * One posed TankModel3D per enemy-pool slot (dead slots scale to 0 —
 * cheaper and simpler than mount/unmount churn). Poses are written
 * imperatively from the shared pool each frame: position + hull yaw +
 * terrain pitch/roll on the outer group, traverse on the turret group,
 * elevation on the barrel group. A red beacon marks hostiles; it flashes
 * white with the pool's hitFlash timer.
 */
export default function EnemyTanks({ targets }: { targets: TankTargetState[] }) {
  const outerRefs = useRef<(Group | null)[]>([])
  const turretRefs = useRef<(Group | null)[]>([])
  const barrelRefs = useRef<(Group | null)[]>([])
  const beaconRefs = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      const outer = outerRefs.current[i]
      if (!outer) continue
      if (!t.alive) {
        outer.visible = false
        continue
      }
      outer.visible = true
      outer.position.set(t.pos.x, t.pos.y, t.pos.z)
      outer.rotation.order = 'YXZ'
      outer.rotation.y = t.hullYaw
      outer.rotation.x = t.pitch
      outer.rotation.z = t.roll
      const turret = turretRefs.current[i]
      if (turret) turret.rotation.y = t.turretYaw - t.hullYaw
      const barrel = barrelRefs.current[i]
      if (barrel) barrel.rotation.x = -t.barrelPitch
      const beacon = beaconRefs.current[i]
      if (beacon) {
        const mat = beacon.material as MeshStandardMaterial
        const flash = Math.min(1, t.hitFlash * 5)
        mat.emissive.setRGB(1, flash, flash)
      }
    }
  })

  return (
    <>
      {Array.from({ length: MAX_TANK_TARGETS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            outerRefs.current[i] = el
          }}
          visible={false}
        >
          <TankModel3D
            colors={targets[i]?.heavy ? HEAVY_TANK_COLORS : ENEMY_TANK_COLORS}
            scale={targets[i]?.heavy ? 1.18 : 1}
            turretRef={(el) => {
              turretRefs.current[i] = el
            }}
            barrelRef={(el) => {
              barrelRefs.current[i] = el
            }}
          />
          <mesh
            position={[0, 2.4, 0]}
            ref={(el) => {
              beaconRefs.current[i] = el
            }}
          >
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial emissive="#ff1744" color="#661111" />
          </mesh>
          {/* blob shadow */}
          <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[2.1, 20]} />
            <meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
