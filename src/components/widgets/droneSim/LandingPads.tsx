import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide } from 'three'
import type { MeshStandardMaterial } from 'three'
import type { LandingPadSpec } from './worldLayout'

const PAD_COLOR = '#26c6da'

/**
 * Cyan target discs on the designated rooftops, pulsing gently while the
 * landing challenge is active. Mounted only when landing mode is on.
 */
export default function LandingPads({
  pads,
}: {
  pads: readonly LandingPadSpec[]
}) {
  const materialsRef = useRef<(MeshStandardMaterial | null)[]>([])

  useFrame(({ clock }) => {
    const pulse = 0.35 + 0.3 * Math.sin(clock.elapsedTime * 3)
    materialsRef.current.forEach((mat) => {
      if (mat) mat.emissiveIntensity = pulse
    })
  })

  return (
    <>
      {pads.map((p, i) => (
        <group key={i} position={[p.x, p.top - 0.23, p.z]}>
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[p.r, 28]} />
            <meshStandardMaterial
              ref={(m) => {
                materialsRef.current[i] = m
              }}
              color={PAD_COLOR}
              emissive={PAD_COLOR}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <ringGeometry args={[p.r * 0.35, p.r * 0.45, 28]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          {/* light beacon: makes active pads findable from across the map */}
          <mesh position={[0, 13, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 26, 12, 1, true]} />
            <meshBasicMaterial
              color={PAD_COLOR}
              transparent
              opacity={0.12}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
