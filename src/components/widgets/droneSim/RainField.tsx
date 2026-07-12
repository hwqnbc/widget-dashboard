import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Points } from 'three'
import type { FlightState, Vec2 } from './flightModel'

const COUNT = 800
const VOLUME_XZ = 60
const VOLUME_Y = 30
const FALL_SPEED = 22

/**
 * Storm rain: one Points cloud (single draw call) kept centred on the drone.
 * Drops fall and drift with the wind each frame; a drop leaving the volume
 * wraps to the other side, so the cloud never needs re-seeding. Mounted only
 * while the weather is 'storm'.
 */
export default function RainField({
  flight,
  wind,
}: {
  flight: FlightState
  wind: Vec2
}) {
  const pointsRef = useRef<Points>(null)

  // Fixed random offsets around the moving centre — generated once per mount
  // (an effect-time roll, fine under the "no randomness in reducers" rule).
  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * VOLUME_XZ
      arr[i * 3 + 1] = Math.random() * VOLUME_Y
      arr[i * 3 + 2] = (Math.random() - 0.5) * VOLUME_XZ
    }
    return arr
  }, [])

  useFrame((_, dt) => {
    const points = pointsRef.current
    if (!points) return
    const attr = points.geometry.getAttribute('position')
    const arr = attr.array as Float32Array
    const step = Math.min(dt, 0.05)
    const half = VOLUME_XZ / 2
    for (let i = 0; i < COUNT; i++) {
      let x = arr[i * 3] + wind.x * step
      let y = arr[i * 3 + 1] - FALL_SPEED * step
      let z = arr[i * 3 + 2] + wind.y * step
      if (y < 0) y += VOLUME_Y
      if (x > half) x -= VOLUME_XZ
      else if (x < -half) x += VOLUME_XZ
      if (z > half) z -= VOLUME_XZ
      else if (z < -half) z += VOLUME_XZ
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z
    }
    attr.needsUpdate = true
    // Keep the whole cloud centred on the drone so it never rains "elsewhere".
    points.position.set(flight.pos.x, 0, flight.pos.z)
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#9fb6d8"
        size={0.14}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
