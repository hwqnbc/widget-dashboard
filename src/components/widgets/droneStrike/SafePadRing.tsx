import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'
import { SPAWN } from '../droneSim/flightModel'
import { PAD_START_RADIUS } from '../droneSim/lapTimer'

const IDLE_COLOR = new Color('#4dd0e1')
const ACTIVE_COLOR = new Color('#66bb6a')

/**
 * The spawn pad's "I'm alive" marker: a pulsing ring on the pad edge plus a
 * faint light column marking the safe-zone volume. Idle it breathes cyan;
 * while the player rests inside (the rig writes `stateRef`) it turns green
 * and pulses faster. Pure imperative material writes in useFrame — the
 * state ref crosses the canvas without any React involvement.
 */
export default function SafePadRing({
  stateRef,
}: {
  stateRef: { current: 'idle' | 'active' }
}) {
  const ringRef = useRef<Mesh>(null)
  const beamRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    const active = stateRef.current === 'active'
    const t = clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * (active ? 5 : 1.8))
    const ring = ringRef.current
    if (ring) {
      const mat = ring.material as MeshBasicMaterial
      mat.color.copy(active ? ACTIVE_COLOR : IDLE_COLOR)
      mat.opacity = active ? 0.55 + 0.35 * pulse : 0.28 + 0.22 * pulse
      const s = 1 + (active ? 0.06 : 0.04) * pulse
      ring.scale.set(s, s, 1)
    }
    const beam = beamRef.current
    if (beam) {
      const mat = beam.material as MeshBasicMaterial
      mat.color.copy(active ? ACTIVE_COLOR : IDLE_COLOR)
      mat.opacity = active ? 0.1 + 0.07 * pulse : 0.035 + 0.025 * pulse
    }
  })

  return (
    <>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position={[SPAWN.x, 0.08, SPAWN.z]}>
        <ringGeometry args={[PAD_START_RADIUS - 0.35, PAD_START_RADIUS, 48]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
      {/* Open-ended light column marking the safe-zone volume. */}
      <mesh ref={beamRef} position={[SPAWN.x, 3, SPAWN.z]}>
        <cylinderGeometry args={[PAD_START_RADIUS, PAD_START_RADIUS, 6, 32, 1, true]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </>
  )
}
