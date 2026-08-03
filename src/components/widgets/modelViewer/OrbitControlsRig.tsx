import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * three's built-in OrbitControls (no drei dependency) wired to the R3F
 * camera/canvas: drag to orbit, wheel/pinch to zoom, two-finger/right-drag
 * to pan. Lives inside the Canvas; the controls instance stays in a ref and
 * `autoRotate` is forwarded through a ref each frame (the canvas root's prop
 * schedule lags the DOM one — lesson #48 — and damping needs a per-frame
 * update() anyway).
 */
export default function OrbitControlsRig({ autoRotate }: { autoRotate: boolean }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controlsRef = useRef<OrbitControls | null>(null)
  const autoRotateRef = useRef(autoRotate)
  autoRotateRef.current = autoRotate

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0.6, 0)
    controls.minDistance = 1.5
    controls.maxDistance = 15
    controls.autoRotateSpeed = 1.5
    controls.update()
    controlsRef.current = controls
    return () => {
      controlsRef.current = null
      controls.dispose()
    }
  }, [camera, gl])

  useFrame(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = autoRotateRef.current
    controls.update()
  })

  return null
}
