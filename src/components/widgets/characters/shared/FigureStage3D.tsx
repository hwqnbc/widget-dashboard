// The shared stage every avatar 3D figure stands on: a transparent R3F
// <Canvas> (the card background shows through) with lights and a figurine
// base disc, framing a ~1.9-unit-tall character centred on the origin.
//
// three.js/@react-three/fiber reach the bundle ONLY through this module and
// the per-avatar *Figure3D files that import it — the avatar registry mounts
// them with lazy(), so the 3D chunk loads on first render of a 3D view.
// Keep this and the *Figure3D components OUT of the character index barrels,
// or the static re-export would pull three.js into the main chunk.
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'

export default function FigureStage3D({ children }: { children: ReactNode }) {
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
      {children}
    </Canvas>
  )
}
