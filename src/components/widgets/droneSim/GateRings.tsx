import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial } from 'three'
import type { WorldPalette } from './palettes'
import { RINGS, RING_RADIUS } from './worldLayout'

const DONE_COLOR = '#4caf50'
const UPCOMING_COLOR = '#8a93a6'
const FLASH_COLOR = '#ffffff'

/** Transient "gate just passed" marker, written by DroneRig on a pass. */
export interface GateFlash {
  gate: number
  /** Canvas clock time (s) until which the flash stays lit. */
  until: number
}

/**
 * The score gates. The active gate pulses in the palette accent, completed
 * gates turn green, upcoming gates sit dimmed, and a just-passed gate flashes
 * white briefly. All colour work happens in useFrame on the materials —
 * a gate pass re-renders React once (the HUD chip), the pulse never does.
 */
export default function GateRings({
  palette,
  activeGate,
  flashRef,
}: {
  palette: WorldPalette
  activeGate: number
  flashRef: { current: GateFlash }
}) {
  const materialsRef = useRef<(MeshStandardMaterial | null)[]>([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    materialsRef.current.forEach((mat, i) => {
      if (!mat) return
      const flash = flashRef.current
      if (flash.gate === i && t < flash.until) {
        mat.color.set(FLASH_COLOR)
        mat.emissive.set(FLASH_COLOR)
        mat.emissiveIntensity = 1.2
      } else if (i < activeGate) {
        mat.color.set(DONE_COLOR)
        mat.emissive.set(DONE_COLOR)
        mat.emissiveIntensity = 0.25
      } else if (i === activeGate) {
        mat.color.set(palette.ring)
        mat.emissive.set(palette.ring)
        mat.emissiveIntensity = 0.45 + 0.35 * Math.sin(t * 4)
      } else {
        mat.color.set(UPCOMING_COLOR)
        mat.emissive.set('#000000')
        mat.emissiveIntensity = 0
      }
    })
  })

  return (
    <>
      {RINGS.map((r, i) => (
        <mesh key={i} position={[r.x, r.y, r.z]} rotation-y={r.yaw}>
          <torusGeometry args={[RING_RADIUS, 0.12, 10, 40]} />
          <meshStandardMaterial
            ref={(m) => {
              materialsRef.current[i] = m
            }}
          />
        </mesh>
      ))}
    </>
  )
}
