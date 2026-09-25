/**
 * A toy car / truck for the Car Park 3D view. Built nose along +X, spanning
 * x ∈ [0, len] and z ∈ [-0.5, 0.5] (1 unit = 1 bay), wheels on y = 0.
 *
 * Low-spec by design (CLAUDE.md "Low-spec game-target models"): up to 13 of
 * these share a frame, so matte `meshStandardMaterial` only — no
 * transmission, no emissive — boxes and low-segment wheels. The win glow
 * uses UNLIT `meshBasicMaterial` (bright regardless of lighting) instead of
 * emissive, and the shadow is a transparent blob, not a shadow map.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Shape } from 'three'
import type { MeshBasicMaterial } from 'three'

const GLASS = '#1e293b'
const TYRE = '#212121'
const LAMP = '#fff59d'
const LAMP_ON = '#fffde7'
const BEAM = '#fff59d'
const BEAM_OPACITY = 0.35
const BEAM_FADE = 6
const WHEEL_R = 0.14

/** A headlight beam: a flat trapezoid on the ground, widening ahead of the
 * lamp (+X). */
function beamShape(): Shape {
  const s = new Shape()
  s.moveTo(0, -0.07)
  s.lineTo(1.1, -0.28)
  s.lineTo(1.1, 0.28)
  s.lineTo(0, 0.07)
  s.closePath()
  return s
}

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, WHEEL_R, z]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.1, 12]} />
      <meshStandardMaterial color={TYRE} roughness={0.9} />
    </mesh>
  )
}

export default function Vehicle3D({
  len,
  color,
  selected,
  lightsOn = false,
}: {
  len: number
  color: string
  selected: boolean
  /** Headlights on — the won car's drive-off. */
  lightsOn?: boolean
}) {
  const truck = len === 3
  const bodyLen = len - 0.16
  const shape = useMemo(beamShape, [])
  const beamMats = useRef<(MeshBasicMaterial | null)[]>([])
  const want = useRef(lightsOn)
  want.current = lightsOn
  useFrame((_, dt) => {
    const goal = want.current ? BEAM_OPACITY : 0
    for (const m of beamMats.current) {
      if (!m) continue
      m.opacity += (goal - m.opacity) * (1 - Math.exp(-BEAM_FADE * Math.min(dt, 0.1)))
      m.visible = m.opacity > 0.01
    }
  })
  const lamp = (z: number) => (
    <mesh position={[len - 0.075, 0.33, z]}>
      <boxGeometry args={[0.02, 0.08, 0.14]} />
      {lightsOn ? (
        <meshBasicMaterial color={LAMP_ON} />
      ) : (
        <meshStandardMaterial color={LAMP} roughness={0.4} />
      )}
    </mesh>
  )
  return (
    <group>
      {/* blob shadow — slightly larger than the footprint */}
      <mesh position={[len / 2, 0.007, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len + 0.08, 1.02]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {/* headlight beams on the ground ahead of the nose (faded in/out) */}
      {[0.26, -0.26].map((z, k) => (
        <mesh key={k} position={[len - 0.06, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial
            ref={(m) => {
              beamMats.current[k] = m
            }}
            color={BEAM}
            transparent
            opacity={0}
            visible={false}
            depthWrite={false}
          />
        </mesh>
      ))}
      {selected && (
        <mesh position={[len / 2, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[len - 0.02, 0.98]} />
          <meshStandardMaterial color="#ffffff" roughness={1} />
        </mesh>
      )}
      {/* chassis */}
      <mesh position={[len / 2, 0.29, 0]}>
        <boxGeometry args={[bodyLen, 0.32, 0.8]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      {truck ? (
        <>
          {/* cab (front) + cargo box (rear, taller, in the truck's colour so
              it reads the same as its 2D tile) */}
          <mesh position={[len - 0.5, 0.58, 0]}>
            <boxGeometry args={[0.6, 0.26, 0.72]} />
            <meshStandardMaterial color={GLASS} roughness={0.35} />
          </mesh>
          <mesh position={[len - 0.5, 0.72, 0]}>
            <boxGeometry args={[0.62, 0.04, 0.74]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh position={[(len - 0.9) / 2 + 0.06, 0.66, 0]}>
            <boxGeometry args={[len - 1.02, 0.42, 0.8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </>
      ) : (
        <>
          {/* glasshouse + roof */}
          <mesh position={[len / 2 - 0.08, 0.57, 0]}>
            <boxGeometry args={[0.95, 0.24, 0.68]} />
            <meshStandardMaterial color={GLASS} roughness={0.35} />
          </mesh>
          <mesh position={[len / 2 - 0.08, 0.7, 0]}>
            <boxGeometry args={[0.85, 0.04, 0.7]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
        </>
      )}
      {/* headlights */}
      {lamp(0.26)}
      {lamp(-0.26)}
      <Wheel x={0.38} z={0.4} />
      <Wheel x={0.38} z={-0.4} />
      <Wheel x={len - 0.38} z={0.4} />
      <Wheel x={len - 0.38} z={-0.4} />
      {truck && (
        <>
          <Wheel x={0.8} z={0.4} />
          <Wheel x={0.8} z={-0.4} />
        </>
      )}
    </group>
  )
}
