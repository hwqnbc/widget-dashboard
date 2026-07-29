import { Suspense, useRef } from 'react'
import type { ComponentType } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { OPERATOR } from './flightModel'
import type { OperatorState } from './operatorWalk'

/**
 * The RC operator standing in the world. When Player 1's avatar carries a 3D
 * model (`avatarRegistry` `Model3D`, resolved outside the canvas and passed
 * in as a component prop) the operator IS that avatar; otherwise it falls
 * back to the original primitive figure — which is also the Suspense
 * fallback while the lazy model chunk loads, so the operator never blinks
 * out. Position/heading are copied from the shared OperatorState ref every
 * frame (zero-render, the DroneRig pattern) with a small step-bob while
 * walking. Hidden in the los/walk views: the camera stands at its eyes.
 */
export default function OperatorFigure({
  operator,
  visible,
  model: Model,
}: {
  operator: { current: OperatorState }
  visible: boolean
  /** Player 1's avatar `Model3D` (lazy, venue-neutral), if it has one. */
  model?: ComponentType<{ playing?: boolean }>
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
      {Model ? (
        <Suspense fallback={<BasicOperator />}>
          {/* heading is drone-yaw convention (-Z forward at 0); the avatar
           * models face +Z, so turn them round. ~1.85u model vs the basic
           * figure's ~1.7u — scale to match. */}
          <group rotation-y={Math.PI} scale={0.92}>
            <Model playing={false} />
          </group>
        </Suspense>
      ) : (
        <BasicOperator />
      )}
      {/* RC transmitter held out in front (the "operator" read, either way) */}
      <mesh position={[0, 1.0, -0.32]} rotation-x={-0.5}>
        <boxGeometry args={[0.34, 0.08, 0.2]} />
        <meshStandardMaterial color="#263238" />
      </mesh>
    </group>
  )
}

/** The original primitive operator — the no-3D-avatar fallback. */
function BasicOperator() {
  return (
    <>
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
    </>
  )
}
