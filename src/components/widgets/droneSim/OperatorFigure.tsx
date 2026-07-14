import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { OPERATOR } from './flightModel'
import type { OperatorState } from './operatorWalk'

/**
 * The RC operator standing in the world — simple primitives holding a
 * transmitter. Position/heading are copied from the shared OperatorState ref
 * every frame (zero-render, the DroneRig pattern) with a small step-bob while
 * walking. Hidden in the los/walk views: the camera stands at its eyes.
 */
export default function OperatorFigure({
  operator,
  visible,
}: {
  operator: { current: OperatorState }
  visible: boolean
}) {
  const groupRef = useRef<Group>(null)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const op = operator.current
    g.position.set(op.x, Math.abs(Math.sin(op.walkPhase * 4.4)) * 0.05, op.z)
    g.rotation.y = op.heading
  })

  if (!visible) return null
  return (
    <group ref={groupRef} position={[OPERATOR.x, 0, OPERATOR.z]}>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.2, 0.26, 1.3, 10]} />
        <meshStandardMaterial color="#37474f" />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color="#e0ac69" />
      </mesh>
      <mesh position={[0, 1.56, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.07, 12]} />
        <meshStandardMaterial color="#e53935" />
      </mesh>
      {/* RC transmitter held out in front */}
      <mesh position={[0, 1.0, -0.32]} rotation-x={-0.5}>
        <boxGeometry args={[0.34, 0.08, 0.2]} />
        <meshStandardMaterial color="#263238" />
      </mesh>
    </group>
  )
}
