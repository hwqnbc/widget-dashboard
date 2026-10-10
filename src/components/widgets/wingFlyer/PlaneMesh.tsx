import { useMemo } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape } from 'three'
import type { AirframeId } from './airframes'
import type { PlaneParts } from './planeParts'

const ACCENT = '#f4f4f4'
const DARK = '#37474f'

/**
 * Low-poly procedural airframes in metres, nose toward −Z (the flight
 * model's convention). Matte materials, no transmission/emissive — a single
 * instance, but kept cheap for phones.
 */
export default function PlaneMesh({
  airframe,
  color,
  parts,
}: {
  airframe: AirframeId
  color: string
  parts: PlaneParts
}) {
  return airframe === 'wing' ? <WingMesh color={color} parts={parts} /> : <TrainerMesh color={color} parts={parts} />
}

function Prop({ parts, z, color }: { parts: PlaneParts; z: number; color: string }) {
  return (
    <group position={[0, 0, z]} ref={(g) => void (parts.prop = g)}>
      <mesh>
        <boxGeometry args={[0.34, 0.03, 0.012]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.035, 0.07, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

/** High-wing trainer: ~1.5 m span, tricycle gear (it can use the runway). */
function TrainerMesh({ color, parts }: { color: string; parts: PlaneParts }) {
  return (
    <group>
      {/* Fuselage + cowl */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.14, 0.16, 1.0]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, -0.5]}>
        <boxGeometry args={[0.13, 0.14, 0.12]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      {/* Canopy */}
      <mesh position={[0, 0.1, -0.2]}>
        <boxGeometry args={[0.1, 0.06, 0.22]} />
        <meshStandardMaterial color="#5c8fb8" />
      </mesh>
      {/* High wing */}
      <mesh position={[0, 0.12, -0.12]}>
        <boxGeometry args={[1.5, 0.03, 0.24]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.62, 0.122, -0.12]}>
          <boxGeometry args={[0.24, 0.031, 0.241]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {/* Ailerons (hinged at the trailing edge) */}
      <group position={[-0.5, 0.12, 0]} ref={(g) => void (parts.surfL = g)}>
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[0.44, 0.016, 0.07]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      <group position={[0.5, 0.12, 0]} ref={(g) => void (parts.surfR = g)}>
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[0.44, 0.016, 0.07]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      {/* Tail: stabiliser + elevator, fin + rudder */}
      <mesh position={[0, 0.03, 0.46]}>
        <boxGeometry args={[0.52, 0.02, 0.13]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <group position={[0, 0.03, 0.525]} ref={(g) => void (parts.elevator = g)}>
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[0.5, 0.014, 0.07]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      <mesh position={[0, 0.13, 0.46]}>
        <boxGeometry args={[0.02, 0.2, 0.14]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
      <group position={[0, 0.13, 0.53]} ref={(g) => void (parts.rudder = g)}>
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[0.014, 0.19, 0.07]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      {/* Tricycle gear */}
      {(
        [
          [0, -0.17, -0.42],
          [-0.17, -0.17, 0],
          [0.17, -0.17, 0],
        ] as const
      ).map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.015, 0.12, 0.015]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.045, 0.045, 0.03, 12]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
      <Prop parts={parts} z={-0.58} color={color} />
    </group>
  )
}

/** FPV flying wing: ~1.0 m span delta, pusher prop, belly-lands. */
function WingMesh({ color, parts }: { color: string; parts: PlaneParts }) {
  const panel = useMemo(() => {
    // Right wing panel outline in (x, z), nose toward −z.
    const s = new Shape()
    s.moveTo(0.04, -0.26)
    s.lineTo(0.5, 0.06)
    s.lineTo(0.5, 0.15)
    s.lineTo(0.04, 0.22)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false })
    // Shape lives in XY; lay it flat so shape-y becomes world z.
    g.rotateX(Math.PI / 2)
    g.translate(0, 0.011, 0)
    return g
  }, [])

  return (
    <group>
      {/* Centre pod (FPV camera + battery) */}
      <mesh position={[0, 0.01, -0.02]}>
        <boxGeometry args={[0.11, 0.08, 0.5]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.02, -0.28]}>
        <boxGeometry args={[0.05, 0.04, 0.04]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* Wing panels (mirrored) */}
      <mesh geometry={panel}>
        <meshStandardMaterial color={color} side={DoubleSide} />
      </mesh>
      <mesh geometry={panel} scale-x={-1}>
        <meshStandardMaterial color={color} side={DoubleSide} />
      </mesh>
      {/* Winglets */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.5, 0.06, 0.1]}>
          <boxGeometry args={[0.012, 0.12, 0.13]} />
          <meshStandardMaterial color={ACCENT} />
        </mesh>
      ))}
      {/* Elevons along the trailing edge */}
      <group position={[-0.27, 0.01, 0.18]} ref={(g) => void (parts.surfL = g)}>
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[0.4, 0.014, 0.06]} />
          <meshStandardMaterial color={ACCENT} />
        </mesh>
      </group>
      <group position={[0.27, 0.01, 0.18]} ref={(g) => void (parts.surfR = g)}>
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[0.4, 0.014, 0.06]} />
          <meshStandardMaterial color={ACCENT} />
        </mesh>
      </group>
      <Prop parts={parts} z={0.26} color={color} />
    </group>
  )
}
