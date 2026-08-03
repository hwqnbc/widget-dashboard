import { useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import OrbitControlsRig from './OrbitControlsRig'

/**
 * The Model Viewer's canvas: the user's sample lighting rig (warm key, cool
 * fill), a transparent background so the card colour shows through in both
 * themes, and orbit controls targeting the model's mid-height. The stage is
 * model-agnostic — catalog models mount as children.
 */

/** Mirrors the render loop onto the DOM as a throttled `data-frames` counter
 * so e2e can prove frames are being produced without reading pixels. Writes
 * imperatively via ref — this attribute has exactly one owner (lesson #46). */
function FrameProbe({ probeRef }: { probeRef: RefObject<HTMLElement | null> }) {
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    // Every 10 frames: fresh enough for tests even at software-GL framerates.
    if (frames.current % 10 === 0)
      probeRef.current?.setAttribute('data-frames', String(frames.current))
  })
  return null
}

export default function ModelViewerStage({
  autoRotate,
  probeRef,
  children,
}: {
  autoRotate: boolean
  probeRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <Canvas
      camera={{ position: [3.5, 2.5, 4.5], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      <directionalLight position={[-5, 2, -5]} intensity={0.5} color="#93c5fd" />
      <OrbitControlsRig autoRotate={autoRotate} />
      <FrameProbe probeRef={probeRef} />
      {children}
    </Canvas>
  )
}
