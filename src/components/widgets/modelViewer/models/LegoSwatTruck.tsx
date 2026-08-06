import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture } from 'three'
import type { Group, MeshStandardMaterial } from 'three'
import type { RefObject } from 'react'

/**
 * LEGO SWAT truck built entirely from primitives (no assets): dark chassis,
 * blue brick body, translucent windshield, head/tail lights, roof lightbar,
 * studs and four independently spinning wheels. User-provided model, adapted
 * for the Model Viewer catalog: no Canvas/lights here (the stage owns those),
 * wheel spin gated on the `animate` prop, and the head/tail light rotations
 * moved from <cylinderGeometry> (where R3F ignores transforms) onto the
 * parent <mesh>.
 *
 * `lowSpec` is a lightweight render for multi-instance venues (the Drone
 * Strike car targets): cheap opaque windshield (no per-object transmission
 * pass), matte finish, no decorative head/tail lights, and a static
 * (non-emissive, non-strobing) roof lightbar — a representative SWAT truck
 * that stays light on software GL / mobile. The Model Viewer omits it for the
 * full-quality look (transmission + strobe + gloss).
 */

const LEGO_BLUE = '#1e40af'
const DARK_CHASSIS = '#09090b'

/** Full-quality finish (subtle specular) vs the low-spec matte finish. */
const GLOSSY = { roughness: 0.2, metalness: 0.1 }
const MATTE = { roughness: 1, metalness: 0 }

/** How long each side of the red/blue strobe stays lit (seconds). */
const STROBE_PERIOD = 0.4

/**
 * "S.W.A.T." lettering drawn once on an offscreen canvas and shared as a
 * texture by every truck instance (the Drone Strike mounts a pool of them),
 * so it is a lazy module singleton and never disposed — no font assets, no
 * drei, just canvas 2D.
 */
let swatTexture: CanvasTexture | null = null
function getSwatTexture(): CanvasTexture {
  if (swatTexture) return swatTexture
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '900 88px system-ui, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 12
    ctx.strokeStyle = '#0b1220'
    ctx.strokeText('S.W.A.T.', canvas.width / 2, canvas.height / 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('S.W.A.T.', canvas.width / 2, canvas.height / 2)
  }
  swatTexture = new CanvasTexture(canvas)
  return swatTexture
}

/** One side's lettering: an unlit transparent plane a hair off the body
 * face (offset instead of polygonOffset — no z-fighting to tune). */
function SwatDecal({ side }: { side: 1 | -1 }) {
  return (
    <mesh position={[side * 0.705, 1.35, -0.3]} rotation={[0, (side * Math.PI) / 2, 0]}>
      <planeGeometry args={[1.5, 0.38]} />
      <meshBasicMaterial map={getSwatTexture()} transparent toneMapped={false} />
    </mesh>
  )
}

function Stud({
  position,
  color = LEGO_BLUE,
  finish = GLOSSY,
}: {
  position: [number, number, number]
  color?: string
  finish?: { roughness: number; metalness: number }
}) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
      <meshStandardMaterial color={color} {...finish} />
    </mesh>
  )
}

function Wheel({
  position,
  wheelRef,
}: {
  position: [number, number, number]
  wheelRef: RefObject<Group | null>
}) {
  return (
    <group position={position} ref={wheelRef}>
      {/* Outer rubber tire */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, 0.25, 24]} />
        <meshStandardMaterial color="#18181b" roughness={0.8} />
      </mesh>
      {/* White LEGO rim */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.26, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
    </group>
  )
}

/** A round light on a vertical face — the cylinder is minted along Y, so the
 * mesh (not the geometry) rotates it to point along Z. Full-quality only; the
 * low-spec target drops these decorative lights. */
function FaceLight({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.12, 0.12, 0.05, 16]} />
      <meshStandardMaterial color={color} roughness={0.1} />
    </mesh>
  )
}

export default function LegoSwatTruck({
  animate,
  lowSpec,
}: {
  animate: boolean
  /** Low-spec render for multi-instance venues (Drone Strike car targets):
   * cheap opaque windshield (no per-object transmission pass), matte finish,
   * no decorative head/tail lights and a static non-emissive lightbar. The
   * Model Viewer omits it for the full-quality look. */
  lowSpec?: boolean
}) {
  const frontWheelLeft = useRef<Group>(null)
  const frontWheelRight = useRef<Group>(null)
  const backWheelLeft = useRef<Group>(null)
  const backWheelRight = useRef<Group>(null)
  const blueSirenMat = useRef<MeshStandardMaterial>(null)
  const redSirenMat = useRef<MeshStandardMaterial>(null)
  const amberSirenMat = useRef<MeshStandardMaterial>(null)

  // Full-quality vs low-spec surface finish (see the consts above).
  const finish = lowSpec ? MATTE : GLOSSY

  // Wheel rotation + siren strobe — refs mutated in the frame loop, never
  // React state. In low-spec the siren refs are absent (static lightbar), so
  // the emissive mutations below are guarded no-ops; the wheels still spin.
  useFrame(({ clock }, delta) => {
    const blue = blueSirenMat.current
    const red = redSirenMat.current
    const amber = amberSirenMat.current
    if (!animate) {
      // Parked: steady dim glow, wheels still.
      if (blue) blue.emissiveIntensity = 0.15
      if (red) red.emissiveIntensity = 0.15
      if (amber) amber.emissiveIntensity = 0.15
      return
    }
    const t = clock.elapsedTime
    // Police strobe: red and blue alternate; the amber cap double-times.
    const bluePhase = Math.floor(t / STROBE_PERIOD) % 2 === 0
    if (blue) blue.emissiveIntensity = bluePhase ? 2 : 0
    if (red) red.emissiveIntensity = bluePhase ? 0 : 2
    if (amber) amber.emissiveIntensity = Math.floor(t / (STROBE_PERIOD / 2)) % 2 === 0 ? 1.5 : 0
    const speed = delta * 2
    if (frontWheelLeft.current) frontWheelLeft.current.rotation.x += speed
    if (frontWheelRight.current) frontWheelRight.current.rotation.x += speed
    if (backWheelLeft.current) backWheelLeft.current.rotation.x += speed
    if (backWheelRight.current) backWheelRight.current.rotation.x += speed
  })

  return (
    <group position={[0, -0.3, 0]}>
      {/* 1. Chassis base */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.5, 0.2, 2.6]} />
        <meshStandardMaterial color={DARK_CHASSIS} roughness={0.4} />
      </mesh>

      {/* 2. Lower body (dark blue block) */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.4, 0.6, 2.4]} />
        <meshStandardMaterial color={LEGO_BLUE} {...finish} />
      </mesh>

      {/* 3. Rear container body (SWAT van rear) */}
      <mesh position={[0, 1.35, -0.3]}>
        <boxGeometry args={[1.4, 0.6, 1.8]} />
        <meshStandardMaterial color={LEGO_BLUE} {...finish} />
      </mesh>

      {/* 4. Windshield brick — physical transmission for the Model Viewer;
       * cheap opaque tint for the low-spec car targets. */}
      <mesh position={[0, 1.25, 0.8]}>
        <boxGeometry args={[1.38, 0.45, 0.6]} />
        {lowSpec ? (
          <meshStandardMaterial color="#7fb8c9" roughness={0.5} metalness={0} />
        ) : (
          <meshPhysicalMaterial
            color="#a5f3fc"
            transparent
            opacity={0.65}
            roughness={0.1}
            transmission={0.8}
            ior={1.5}
          />
        )}
      </mesh>

      {/* 5/6. Decorative head + tail lights — full-quality only. */}
      {!lowSpec && (
        <>
          <group position={[0, 0.65, 1.21]}>
            <FaceLight position={[-0.45, 0, 0]} color="#f59e0b" />
            <FaceLight position={[0.45, 0, 0]} color="#f59e0b" />
          </group>
          <group position={[0, 0.75, -1.21]}>
            <FaceLight position={[-0.45, 0, 0]} color="#dc2626" />
            <FaceLight position={[0.45, 0, 0]} color="#dc2626" />
          </group>
        </>
      )}

      {/* 7. Roof police lightbar. Full-quality: emissive blocks the strobe
       * animates via the material refs. Low-spec: static, non-emissive blocks
       * (keeps the SWAT silhouette without the light effect). */}
      <group position={[0, 1.7, 0.3]}>
        <mesh position={[-0.4, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          {lowSpec ? (
            <meshStandardMaterial color="#3b82f6" {...finish} />
          ) : (
            <meshStandardMaterial
              ref={blueSirenMat}
              color="#3b82f6"
              emissive="#3b82f6"
              emissiveIntensity={0.15}
              roughness={0.1}
            />
          )}
        </mesh>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          {lowSpec ? (
            <meshStandardMaterial color="#dc2626" {...finish} />
          ) : (
            <meshStandardMaterial
              ref={redSirenMat}
              color="#dc2626"
              emissive="#dc2626"
              emissiveIntensity={0.15}
              roughness={0.1}
            />
          )}
        </mesh>
        <mesh position={[0.4, 0, 0]}>
          <boxGeometry args={[0.25, 0.12, 0.25]} />
          {lowSpec ? (
            <meshStandardMaterial color="#f59e0b" {...finish} />
          ) : (
            <meshStandardMaterial
              ref={amberSirenMat}
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={0.15}
              roughness={0.1}
            />
          )}
        </mesh>
      </group>

      {/* 7b. S.W.A.T. lettering on both sides of the rear body */}
      <SwatDecal side={1} />
      <SwatDecal side={-1} />

      {/* 8. LEGO studs on the roof */}
      <Stud position={[-0.4, 1.7, -0.6]} finish={finish} />
      <Stud position={[0.4, 1.7, -0.6]} finish={finish} />
      <Stud position={[-0.4, 1.7, -1.0]} finish={finish} />
      <Stud position={[0.4, 1.7, -1.0]} finish={finish} />

      {/* 9. Four independent wheels */}
      <Wheel position={[-0.8, 0.35, 0.7]} wheelRef={frontWheelLeft} />
      <Wheel position={[0.8, 0.35, 0.7]} wheelRef={frontWheelRight} />
      <Wheel position={[-0.8, 0.35, -0.7]} wheelRef={backWheelLeft} />
      <Wheel position={[0.8, 0.35, -0.7]} wheelRef={backWheelRight} />
    </group>
  )
}
