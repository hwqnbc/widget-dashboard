// The white ice-ninja's mesh-level 3D model: the 2D SwordNinjaFigure's robe,
// ice torso panel, gold obi + medallion, shoulder armor, dark face mask and
// the two katanas crossed on the back, rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds. It owns only the
// character's animation: idle arm sway, and `playing` runs the 3D take on
// the katana-draw celebration — a bounce with the right arm pumping a drawn
// katana overhead (the matching back blade hides while "drawn"). Animation
// mutates refs in useFrame (zero React renders).
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from ninja/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { N } from './ninjaPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

/** A katana in local coords: hilt at the origin, blade up (+y), ~0.85 long. */
function Katana() {
  return (
    <group>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.045, 0.62, 0.015]} />
        <meshStandardMaterial color={N.blade} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.13, 0.03, 0.045]} />
        <meshStandardMaterial color={N.guard} {...STEEL} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.19, 8]} />
        <meshStandardMaterial color={N.hiltWrap} {...CLOTH} />
      </mesh>
    </group>
  )
}

export default function NinjaModel3D({ playing = false }: { playing?: boolean }) {
  const bodyRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const body = bodyRef.current
    if (body) body.position.y = playing ? Math.abs(Math.sin(t * 5.4)) * 0.16 : 0
    if (playing) {
      // Right arm pumps the drawn katana overhead; the left counter-swings
      // low — the 3D read of the 2D draw-to-guard celebration.
      if (armRRef.current) armRRef.current.rotation.z = 1.9 - Math.sin(t * 5.4) * 0.35
      if (armLRef.current) armLRef.current.rotation.z = -(0.5 + Math.sin(t * 5.4) * 0.2)
    } else {
      const sway = Math.sin(t * 1.7) * 0.05
      if (armLRef.current) armLRef.current.rotation.z = -(0.12 + sway)
      if (armRRef.current) armRRef.current.rotation.z = 0.12 - sway
    }
  })

  return (
    <group ref={bodyRef}>
      {/* legs + tabi feet */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      {/* gold obi belt + knot */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={N.gold} {...CLOTH} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, 0.17]}>
        <boxGeometry args={[0.12, 0.1, 0.06]} />
        <meshStandardMaterial color={N.gold} {...CLOTH} roughness={0.5} />
      </mesh>
      {/* ice torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={N.ice} {...CLOTH} flatShading />
      </mesh>
      {/* white robe V lapels */}
      <mesh position={[-0.08, 1.02, 0.24]} rotation-z={0.26}>
        <boxGeometry args={[0.09, 0.42, 0.03]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.02, 0.24]} rotation-z={-0.26}>
        <boxGeometry args={[0.09, 0.42, 0.03]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      {/* gold hex medallion (8-seg disc reads faceted at this size) */}
      <mesh position={[0, 0.88, 0.26]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.075, 0.075, 0.025, 8]} />
        <meshStandardMaterial color={N.gold} {...STEEL} flatShading />
      </mesh>
      {/* right shoulder armor slab */}
      <mesh position={[0.37, 1.23, 0]} rotation-z={-0.25}>
        <boxGeometry args={[0.28, 0.07, 0.3]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      {/* katanas crossed on the back, hilts up over the shoulders */}
      <group position={[0, 0, -0.26]}>
        <group position={[0.18, 1.32, 0]} rotation-z={2.4}>
          <Katana />
        </group>
        {/* the one that gets "drawn" for the celebration */}
        <group position={[-0.18, 1.32, 0]} rotation-z={-2.4} visible={!playing}>
          <Katana />
        </group>
      </group>
      {/* arms: groups pivoted at the shoulder so useFrame swings them */}
      <group ref={armLRef} position={[-0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={N.robe} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={N.robeShade} {...CLOTH} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={N.robe} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={N.robeShade} {...CLOTH} />
        </mesh>
        {/* the drawn katana, held as the arm's extension while celebrating */}
        <group position={[0, -0.46, 0]} rotation-z={Math.PI} visible={playing}>
          <Katana />
        </group>
      </group>
      {/* neck + faceted hood head (8-seg flat-shaded — helmet-like, short) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.34, 8]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} flatShading />
      </mesh>
      {/* hood peak */}
      <mesh position={[0, 1.74, 0]}>
        <coneGeometry args={[0.27, 0.2, 8]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} flatShading />
      </mesh>
      {/* dark mask band with ice eyes */}
      <mesh position={[0, 1.5, 0.24]}>
        <boxGeometry args={[0.36, 0.14, 0.05]} />
        <meshStandardMaterial color={N.line} {...CLOTH} />
      </mesh>
      <mesh position={[-0.09, 1.52, 0.27]}>
        <boxGeometry args={[0.07, 0.035, 0.02]} />
        <meshStandardMaterial color={N.iceMid} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.52, 0.27]}>
        <boxGeometry args={[0.07, 0.035, 0.02]} />
        <meshStandardMaterial color={N.iceMid} roughness={0.3} />
      </mesh>
    </group>
  )
}
