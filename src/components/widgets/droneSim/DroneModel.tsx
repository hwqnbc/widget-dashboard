import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { ControlInput } from './flightModel'

const BODY_COLOR = '#263238'
const ACCENT_COLOR = '#ff9800'
const ROTOR_COLOR = '#90a4ae'

const ARM_REACH = 0.42
const ARM_ANGLES = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  -Math.PI / 4,
]

/**
 * Primitive-built quadcopter. The nose (orange camera block) faces -Z to
 * match the flight model's heading convention. Rotor groups spin every frame,
 * faster under throttle; diagonal pairs counter-rotate.
 */
export default function DroneModel({ controls }: { controls: ControlInput }) {
  const rotorsRef = useRef<(Group | null)[]>([])

  useFrame((_, dt) => {
    const throttle = Math.min(
      1,
      Math.hypot(controls.left.y, controls.right.x, controls.right.y),
    )
    const speed = 25 + 20 * throttle
    rotorsRef.current.forEach((rotor, i) => {
      if (rotor) rotor.rotation.y += (i % 2 === 0 ? 1 : -1) * speed * dt
    })
  })

  return (
    <group>
      <mesh>
        <boxGeometry args={[0.5, 0.14, 0.5]} />
        <meshStandardMaterial color={BODY_COLOR} />
      </mesh>
      <mesh position={[0, 0.02, -0.28]}>
        <boxGeometry args={[0.14, 0.1, 0.08]} />
        <meshStandardMaterial color={ACCENT_COLOR} />
      </mesh>
      {ARM_ANGLES.map((angle, i) => {
        const ax = Math.sin(angle) * ARM_REACH
        const az = Math.cos(angle) * ARM_REACH
        return (
          <group key={i}>
            <mesh position={[ax / 2, 0, az / 2]} rotation-y={angle}>
              <boxGeometry args={[0.05, 0.04, ARM_REACH]} />
              <meshStandardMaterial color={BODY_COLOR} />
            </mesh>
            <group
              ref={(el) => {
                rotorsRef.current[i] = el
              }}
              position={[ax, 0.08, az]}
            >
              <mesh>
                <cylinderGeometry args={[0.22, 0.22, 0.015, 20]} />
                <meshStandardMaterial color={ROTOR_COLOR} transparent opacity={0.45} />
              </mesh>
              <mesh>
                <boxGeometry args={[0.44, 0.02, 0.05]} />
                <meshStandardMaterial color={BODY_COLOR} />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}
