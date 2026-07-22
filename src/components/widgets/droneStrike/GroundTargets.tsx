import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { TargetState } from './waveLayout'
import { MAX_TARGETS } from './waveLayout'

const TRUCK_COLOR = new Color('#6b8e23') // olive supply truck
const TURRET_COLOR = new Color('#8b1a1a') // dark-red AA emplacement
const FLASH_COLOR = new Color('#ffffff')
const NO_ROT = new Quaternion()

/**
 * Ground targets — supply trucks and AA turrets — as one InstancedMesh of
 * boxes (a single draw call), sitting on the deck. Positions/colours/scale
 * are written imperatively each frame from the shared target pool (dead
 * slots and airborne kinds scale to 0). Trucks are wide and flat; turrets
 * are taller and narrower. A fresh hit tints the box white for its hitFlash.
 */
export default function GroundTargets({ targets }: { targets: TargetState[] }) {
  const meshRef = useRef<InstancedMesh>(null)
  const temps = useMemo(
    () => ({
      matrix: new Matrix4(),
      color: new Color(),
      pos: new Vector3(),
      scale: new Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { matrix, color, pos, scale } = temps
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      if (t.alive && (t.kind === 'ground' || t.kind === 'turret')) {
        if (t.kind === 'ground') {
          scale.set(t.radius * 1.6, t.radius * 0.9, t.radius * 2.2)
          color.copy(TRUCK_COLOR)
        } else {
          scale.set(t.radius * 1.2, t.radius * 1.9, t.radius * 1.2)
          color.copy(TURRET_COLOR)
        }
        // Seat the box on the deck (hit-sphere centre is at pos.y).
        pos.set(t.pos.x, t.pos.y, t.pos.z)
        matrix.compose(pos, NO_ROT, scale)
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
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  )
}
