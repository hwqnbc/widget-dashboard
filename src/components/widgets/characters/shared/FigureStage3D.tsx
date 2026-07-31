// The shared stage every avatar 3D figure stands on: a transparent R3F
// <Canvas> (the card background shows through) with lights, a figurine base
// disc, and an optional turntable, framing a ~1.9-unit-tall character centred
// on the origin. The turntable spin lives HERE, not in the character models —
// spinning is how the viewer presents a figure, while the venue-neutral
// models (ToyModel3D, …) must also stand in game worlds (the Drone Sim's
// operator) where the game drives their heading.
//
// three.js/@react-three/fiber reach the bundle ONLY through this module and
// the per-avatar *Figure3D/*Model3D files — the avatar registry mounts them
// with lazy(), so the 3D chunk loads on first render of a 3D view. Keep them
// OUT of the character index barrels, or the static re-export would pull
// three.js into the main chunk.
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Group } from 'three'

/** Rotates its children about Y at `speed` rad/s. At speed 0 it eases back
 * to face the camera instead of freezing mid-turn — directional actions
 * (e.g. the ninja sword draw) set spin 0 so their choreography always plays
 * facing the viewer. */
function Turntable({ speed, children }: { speed: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    if (speed > 0) {
      g.rotation.y += dt * speed
    } else {
      const target = Math.round(g.rotation.y / (Math.PI * 2)) * Math.PI * 2
      g.rotation.y += (target - g.rotation.y) * Math.min(1, dt * 4)
    }
  })
  return <group ref={ref}>{children}</group>
}

export default function FigureStage3D({
  spin = 0,
  children,
}: {
  /** Turntable speed in rad/s; 0 keeps the figure static. */
  spin?: number
  children: ReactNode
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 3.3], fov: 40 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
      <directionalLight position={[-2, 2.5, -3]} intensity={0.5} />
      {/* figurine display base */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.1, 36]} />
        <meshStandardMaterial color="#8fb8b2" roughness={0.7} />
      </mesh>
      <Turntable speed={spin}>{children}</Turntable>
    </Canvas>
  )
}
