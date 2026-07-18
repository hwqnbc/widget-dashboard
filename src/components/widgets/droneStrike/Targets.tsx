import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4 } from 'three'
import type { InstancedMesh } from 'three'
import type { TargetState } from './waveLayout'
import { MAX_TARGETS } from './waveLayout'

const KIND_COLORS = {
  balloon: new Color('#ef5350'),
  ringDrone: new Color('#4dd0e1'),
  enemy: new Color('#455a64'),
} as const
const FLASH_COLOR = new Color('#ffffff')

/**
 * All wave targets as one InstancedMesh of spheres — a single draw call for
 * the whole gallery. Positions/colours are written imperatively each frame
 * from the shared target pool (dead slots scale to 0). A fresh hit tints the
 * sphere white for the length of its hitFlash timer.
 */
export default function Targets({ targets }: { targets: TargetState[] }) {
  const meshRef = useRef<InstancedMesh>(null)
  const temps = useMemo(() => ({ matrix: new Matrix4(), color: new Color() }), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { matrix, color } = temps
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      // Enemies render as real drone models (see EnemyDrones), not spheres.
      if (t.alive && t.kind !== 'enemy') {
        matrix.makeScale(t.radius, t.radius, t.radius)
        matrix.setPosition(t.pos.x, t.pos.y, t.pos.z)
        color.copy(KIND_COLORS[t.kind])
        if (t.hitFlash > 0) color.lerp(FLASH_COLOR, Math.min(1, t.hitFlash * 6))
      } else {
        matrix.makeScale(0, 0, 0)
      }
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_TARGETS]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 20, 14]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}
