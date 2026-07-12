import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial } from 'three'
import type { WorldPalette } from './palettes'
import { RINGS, RING_RADIUS } from './worldLayout'
import { SPAWN } from './flightModel'

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
  /** GATES.length means all gates passed — the "return to pad" phase. */
  activeGate: number
  flashRef: { current: GateFlash }
}) {
  const materialsRef = useRef<(MeshStandardMaterial | null)[]>([])
  const padMatRef = useRef<MeshStandardMaterial>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pad = padMatRef.current
    if (pad) {
      pad.color.set(palette.ring)
      if (activeGate === RINGS.length) {
        // finish line is live — pulse the pad ring
        pad.emissive.set(palette.ring)
        pad.emissiveIntensity = 0.45 + 0.35 * Math.sin(t * 4)
      } else {
        pad.emissive.set('#000000')
        pad.emissiveIntensity = 0
      }
    }
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
      <mesh rotation-x={-Math.PI / 2} position={[SPAWN.x, 0.12, SPAWN.z]}>
        <torusGeometry args={[1.5, 0.08, 8, 40]} />
        <meshStandardMaterial ref={padMatRef} />
      </mesh>
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
