import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { RefObject } from 'react'

/**
 * LEGO SWAT truck built entirely from primitives (no assets): dark chassis,
 * blue brick body, translucent windshield, head/tail lights, roof lightbar,
 * studs and four independently spinning wheels. User-provided model, adapted
 * for the Model Viewer catalog: no Canvas/lights here (the stage owns those),
 * wheel spin gated on the `animate` prop, and the head/tail light rotations
 * moved from <cylinderGeometry> (where R3F ignores transforms) onto the
 * parent <mesh>.
 */

const LEGO_BLUE = '#1e40af'
const DARK_CHASSIS = '#09090b'

function Stud({ position, color = LEGO_BLUE }: { position: [number, number, number]; color?: string }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
      <meshStandardMaterial color={color} roughness={0.2} metalness={0.1} />
    </mesh>
  )
}

function Wheel({
  position,
  wheelRef,
}: {
  position: [number, number, number]
  wheelRef: RefObject<Group | null>
}) {
  return (
    <group position={position} ref={wheelRef}>
      {/* Outer rubber tire */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, 0.25, 24]} />
        <meshStandardMaterial color="#18181b" roughness={0.8} />
      </mesh>
      {/* White LEGO rim */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.26, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
    </group>
  )
}

/** A round light on a vertical face — the cylinder is minted along Y, so the
 * mesh (not the geometry) rotates it to point along Z. */
function FaceLight({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.12, 0.12, 0.05, 16]} />
      <meshStandardMaterial color={color} roughness={0.1} />
    </mesh>
  )
}

export default function LegoSwatTruck({ animate }: { animate: boolean }) {
  const frontWheelLeft = useRef<Group>(null)
  const frontWheelRight = useRef<Group>(null)
  const backWheelLeft = useRef<Group>(null)
  const backWheelRight = useRef<Group>(null)

  // Wheel rotation — refs mutated in the frame loop, never React state.
  useFrame((_, delta) => {
    if (!animate) return
    const speed = delta * 2
    if (frontWheelLeft.current) frontWheelLeft.current.rotation.x += speed
    if (frontWheelRight.current) frontWheelRight.current.rotation.x += speed
    if (backWheelLeft.current) backWheelLeft.current.rotation.x += speed
    if (backWheelRight.current) backWheelRight.current.rotation.x += speed
  })

  return (
    <group position={[0, -0.3, 0]}>
      {/* 1. Chassis base */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.5, 0.2, 2.6]} />
        <meshStandardMaterial color={DARK_CHASSIS} roughness={0.4} />
      </mesh>

      {/* 2. Lower body (dark blue block) */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.4, 0.6, 2.4]} />
        <meshStandardMaterial color={LEGO_BLUE} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* 3. Rear container body (SWAT van rear) */}
      <mesh position={[0, 1.35, -0.3]}>
        <boxGeometry args={[1.4, 0.6, 1.8]} />
        <meshStandardMaterial color={LEGO_BLUE} roughness={0.2} metalness={0.1} />
      </mesh>

      {/* 4. Transparent windshield brick */}
      <mesh position={[0, 1.25, 0.8]}>
        <boxGeometry args={[1.38, 0.45, 0.6]} />
        <meshPhysicalMaterial
          color="#a5f3fc"
          transparent
          opacity={0.65}
          roughness={0.1}
          transmission={0.8}
          ior={1.5}
        />
      </mesh>

      {/* 5. Front headlights */}
      <group position={[0, 0.65, 1.21]}>
        <FaceLight position={[-0.45, 0, 0]} color="#f59e0b" />
        <FaceLight position={[0.45, 0, 0]} color="#f59e0b" />
      </group>

      {/* 6. Rear red tail lights */}
      <group position={[0, 0.75, -1.21]}>
        <FaceLight position={[-0.45, 0, 0]} color="#dc2626" />
        <FaceLight position={[0.45, 0, 0]} color="#dc2626" />
      </group>

      {/* 7. Roof police lightbar */}
      <group position={[0, 1.7, 0.3]}>
        <mesh position={[-0.4, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          <meshStandardMaterial color="#dc2626" roughness={0.1} />
        </mesh>
        <mesh position={[0.4, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.1} />
        </mesh>
      </group>

      {/* 8. LEGO studs on the roof */}
      <Stud position={[-0.4, 1.7, -0.6]} />
      <Stud position={[0.4, 1.7, -0.6]} />
      <Stud position={[-0.4, 1.7, -1.0]} />
      <Stud position={[0.4, 1.7, -1.0]} />

      {/* 9. Four independent wheels */}
      <Wheel position={[-0.8, 0.35, 0.7]} wheelRef={frontWheelLeft} />
      <Wheel position={[0.8, 0.35, 0.7]} wheelRef={frontWheelRight} />
      <Wheel position={[-0.8, 0.35, -0.7]} wheelRef={backWheelLeft} />
      <Wheel position={[0.8, 0.35, -0.7]} wheelRef={backWheelRight} />
    </group>
  )
}
