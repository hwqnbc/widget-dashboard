/**
 * A toy car / truck for the Car Park 3D view. Built nose along +X, spanning
 * x ∈ [0, len] and z ∈ [-0.5, 0.5] (1 unit = 1 bay), wheels on y = 0.
 *
 * Low-spec by design (CLAUDE.md "Low-spec game-target models"): up to 13 of
 * these share a frame, so matte `meshStandardMaterial` only — no
 * transmission, no emissive — boxes and low-segment wheels.
 */

const GLASS = '#1e293b'
const TYRE = '#212121'
const LAMP = '#fff59d'
const WHEEL_R = 0.14

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
}: {
  len: number
  color: string
  selected: boolean
}) {
  const truck = len === 3
  const bodyLen = len - 0.16
  return (
    <group>
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
      <mesh position={[len - 0.075, 0.33, 0.26]}>
        <boxGeometry args={[0.02, 0.08, 0.14]} />
        <meshStandardMaterial color={LAMP} roughness={0.4} />
      </mesh>
      <mesh position={[len - 0.075, 0.33, -0.26]}>
        <boxGeometry args={[0.02, 0.08, 0.14]} />
        <meshStandardMaterial color={LAMP} roughness={0.4} />
      </mesh>
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
