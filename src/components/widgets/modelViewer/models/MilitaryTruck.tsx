import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { RefObject } from 'react'

/**
 * LEGO-style military cargo truck built entirely from primitives: black
 * chassis, army-green cabin (windshield, side windows, mirrors, bull bar,
 * head/roof lights), tan cargo canopy with filleted top corners, studs and
 * four spinning wheels. User-provided model, adapted for the Model Viewer
 * catalog: no Canvas/lights and no shadow props (the stage owns lighting and
 * doesn't enable shadows); wheel spin gated on `animate`; and the RoundPlate
 * light rotations moved from <cylinderGeometry> (where R3F ignores
 * transforms — lesson #76) onto the parent <mesh>. The cabin group's
 * half-turn puts the windshield toward +Z, matching the catalog convention.
 */

const GLOSSY = { roughness: 0.2, metalness: 0.1 }

const ARMY_GREEN = '#3f6212'
const CANOPY_TAN = '#a39480'
const BLACK_HARDWARE = '#262626'

const GLASS = {
  color: '#d1d5db',
  transparent: true,
  opacity: 0.6,
  roughness: 0.1,
  transmission: 0.9,
  ior: 1.5,
}

/**
 * The cab glass. Physical transmission looks great for the single-model Model
 * Viewer, but three.js runs a full-scene transmission pass **per transmissive
 * object** every frame — with several trucks on screen (Drone Strike targets)
 * that tanks the framerate on software GL / low-end mobile. `simple` swaps in
 * a cheap tinted-transparent standard material (no transmission pass) for
 * those multi-instance venues; the Model Viewer keeps the default glass.
 */
function Glass({ simple }: { simple?: boolean }) {
  return simple ? (
    <meshStandardMaterial color="#aec6d8" transparent opacity={0.55} roughness={0.1} metalness={0} />
  ) : (
    <meshPhysicalMaterial {...GLASS} />
  )
}

function Stud({ position, color = ARMY_GREEN }: { position: [number, number, number]; color?: string }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
      <meshStandardMaterial color={color} {...GLOSSY} />
    </mesh>
  )
}

/** Round 1x1 plate on a vertical face (lights) — the cylinder is minted
 * along Y, so the mesh (not the geometry) rotates it to point along Z. */
function RoundPlate({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.1, 0.1, 0.08, 12]} />
      <meshStandardMaterial color={color} {...GLOSSY} />
    </mesh>
  )
}

/** Two-part wheel: rubber tire + green hubcap. */
function Wheel({
  position,
  wheelRef,
}: {
  position: [number, number, number]
  wheelRef: RefObject<Group | null>
}) {
  return (
    <group position={position} ref={wheelRef}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, 0.22, 24]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.24, 16]} />
        <meshStandardMaterial color={ARMY_GREEN} {...GLOSSY} />
      </mesh>
    </group>
  )
}

export default function MilitaryTruck({
  animate,
  simpleGlass,
}: {
  animate: boolean
  /** Use cheap (non-transmissive) glass — for multi-instance venues like the
   * Drone Strike targets where the per-object transmission pass is too costly
   * on software GL / mobile. The Model Viewer omits it for the fancy glass. */
  simpleGlass?: boolean
}) {
  const frontWheelLeft = useRef<Group>(null)
  const frontWheelRight = useRef<Group>(null)
  const backWheelLeft = useRef<Group>(null)
  const backWheelRight = useRef<Group>(null)

  // Wheel rotation — refs mutated in the frame loop, never React state.
  useFrame((_, delta) => {
    if (!animate) return
    const speed = delta * 3
    if (frontWheelLeft.current) frontWheelLeft.current.rotation.x += speed
    if (frontWheelRight.current) frontWheelRight.current.rotation.x += speed
    if (backWheelLeft.current) backWheelLeft.current.rotation.x += speed
    if (backWheelRight.current) backWheelRight.current.rotation.x += speed
  })

  return (
    <group>
      {/* 1. Chassis base */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.5, 0.2, 3.8]} />
        <meshStandardMaterial color="#0c0a09" {...GLOSSY} />
      </mesh>

      {/* 2. Cabin assembly (green front section; the half-turn faces it +Z) */}
      <group position={[0, 0.95, 1.2]} rotation={[0, Math.PI, 0]}>
        {/* Main cabin body block */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.6, 1.0, 1.2]} />
          <meshStandardMaterial color={ARMY_GREEN} {...GLOSSY} />
        </mesh>

        {/* Front windshield */}
        <mesh position={[0, 0.3, -0.61]}>
          <boxGeometry args={[1.58, 0.4, 0.05]} />
          <Glass simple={simpleGlass} />
        </mesh>

        {/* Top sun visor */}
        <mesh position={[0, 0.55, -0.6]}>
          <boxGeometry args={[1.6, 0.1, 0.15]} />
          <meshStandardMaterial color={BLACK_HARDWARE} {...GLOSSY} />
        </mesh>

        {/* Side windows */}
        <mesh position={[0.81, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.5, 0.9]} />
          <Glass simple={simpleGlass} />
        </mesh>
        <mesh position={[-0.81, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.5, 0.9]} />
          <Glass simple={simpleGlass} />
        </mesh>

        {/* Side mirrors */}
        <group position={[0.9, 0.2, -0.55]}>
          <mesh>
            <boxGeometry args={[0.1, 0.5, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          <mesh position={[0.1, 0.15, -0.1]}>
            <boxGeometry args={[0.05, 0.2, 0.15]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
        </group>
        <group position={[-0.9, 0.2, -0.55]}>
          <mesh>
            <boxGeometry args={[0.1, 0.5, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          <mesh position={[-0.1, 0.15, -0.1]}>
            <boxGeometry args={[0.05, 0.2, 0.15]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
        </group>

        {/* Bull bar / grille guard */}
        <group position={[0, -0.2, -0.65]}>
          {/* Vertical bars */}
          <mesh position={[0.4, 0, 0]}>
            <boxGeometry args={[0.05, 0.6, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          <mesh position={[-0.4, 0, 0]}>
            <boxGeometry args={[0.05, 0.6, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          {/* Horizontal bars */}
          <mesh position={[0, -0.15, 0]}>
            <boxGeometry args={[0.85, 0.05, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[0.85, 0.05, 0.05]} />
            <meshStandardMaterial color={BLACK_HARDWARE} />
          </mesh>
          {/* Main central bumper */}
          <mesh position={[0, -0.35, 0.02]}>
            <boxGeometry args={[1.5, 0.15, 0.1]} />
            <meshStandardMaterial color={BLACK_HARDWARE} {...GLOSSY} />
          </mesh>
        </group>

        {/* Lights */}
        <RoundPlate position={[0.5, -0.15, -0.67]} color="#f59e0b" />
        <RoundPlate position={[-0.5, -0.15, -0.67]} color="#f59e0b" />
        <RoundPlate position={[0.3, 0.73, -0.4]} color="#f97316" />
      </group>

      {/* 3. Cargo bay assembly (rear green bed + tan canopy) */}
      <group position={[0, 0.9, -0.7]}>
        {/* Lower green bed */}
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[1.6, 0.7, 2.4]} />
          <meshStandardMaterial color={ARMY_GREEN} {...GLOSSY} />
        </mesh>

        {/* Studs on the bottom rail corners */}
        <Stud position={[0.7, -0.4, 1.1]} />
        <Stud position={[-0.7, -0.4, 1.1]} />
        <Stud position={[0.7, -0.4, -1.1]} />
        <Stud position={[-0.7, -0.4, -1.1]} />

        {/* Tan cargo canopy */}
        <group position={[0, 0.55, 0]}>
          {/* Main top section */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1.6, 0.7, 2.4]} />
            <meshStandardMaterial color={CANOPY_TAN} {...GLOSSY} />
          </mesh>
          {/* Crosswise roof-bow fillet */}
          <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 1.6, 16]} />
            <meshStandardMaterial color={CANOPY_TAN} {...GLOSSY} />
          </mesh>
          {/* Front/back end caps */}
          <mesh position={[0, 0, 1.21]}>
            <boxGeometry args={[1.6, 0.7, 0.02]} />
            <meshStandardMaterial color={CANOPY_TAN} {...GLOSSY} />
          </mesh>
          <mesh position={[0, 0, -1.21]}>
            <boxGeometry args={[1.6, 0.7, 0.02]} />
            <meshStandardMaterial color={CANOPY_TAN} {...GLOSSY} />
          </mesh>
        </group>
      </group>

      {/* 4. Four wheels */}
      <Wheel position={[-0.8, 0.35, 1.2]} wheelRef={frontWheelLeft} />
      <Wheel position={[0.8, 0.35, 1.2]} wheelRef={frontWheelRight} />
      <Wheel position={[-0.8, 0.35, -0.7]} wheelRef={backWheelLeft} />
      <Wheel position={[0.8, 0.35, -0.7]} wheelRef={backWheelRight} />
    </group>
  )
}
