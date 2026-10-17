/**
 * Puppy Rescue — the shelter room (lazy three.js chunk, like PuppyRescue3D).
 * A cosy room in the theme's colours — rug, beds, a food bowl — holding one
 * low-poly dog per adopted puppy, in the coat it wore in its level. Some sit,
 * some trot slow circles round their spot; new arrivals wear a ✨. A pure
 * view of the list it's given: nothing here touches records.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import { Blob, Dog } from './puppyModels'
import { newAnim, type Coat } from './puppyLook'
import { themeById, type ThemeId } from './puppyThemes'

export interface ShelterPup {
  coat: Coat
  /** Adopted since the shelter was last opened. */
  fresh: boolean
}

export interface PuppyShelter3DProps {
  pups: ShelterPup[]
  theme: ThemeId
}

/** Room half-size for n puppies (cells), and each puppy's home spot. The
 * grid follows the card's shape (`aspect` = width / height; measured on
 * screen, a row of the tilted room shows ~0.8 the depth of a column's
 * width), so a tall card gets a tall room and the puppies fill it. */
function layout(n: number, aspect: number) {
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * aspect * 0.8)))
  const rows = Math.max(3, Math.ceil(n / cols))
  const homes: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    // A little seeded jitter so the room doesn't look like a parade.
    const jx = Math.sin(i * 12.9898) * 0.18
    const jz = Math.cos(i * 78.233) * 0.18
    homes.push([(c - (cols - 1) / 2) * 0.9 + jx, (r - (rows - 1) / 2) * 0.9 + jz + 0.3])
  }
  return { hx: (cols * 0.9) / 2 + 0.6, hz: (rows * 0.9) / 2 + 0.9, homes }
}

function Fit({ hx, hz }: { hx: number; hz: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
    const dir = new Vector3(0, Math.sin(1.0), Math.cos(1.0))
    const corners = [-hx, hx].flatMap((x) => [-hz, hz].map((z) => new Vector3(x, 0, z)))
    corners.push(new Vector3(0, 0.9, -hz))
    const p = new Vector3()
    let d = 12
    for (let k = 0; k < 8; k++) {
      camera.position.copy(dir).multiplyScalar(d)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      let m = 0
      for (const q of corners) {
        p.copy(q).project(camera)
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
      }
      d *= m / 0.95
    }
    camera.position.copy(dir).multiplyScalar(d)
    camera.lookAt(0, 0, 0)
  }, [camera, size.width, size.height, hx, hz])
  return null
}

function Pup({ pup, home, i }: { pup: ShelterPup; home: [number, number]; i: number }) {
  const ref = useRef<Group>(null)
  const spark = useRef<Group>(null)
  const anim = useMemo(newAnim, [])
  // Every third puppy sits; the rest trot slow little circles.
  const sits = i % 3 === 0
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      if (sits) {
        ref.current.position.set(home[0], 0, home[1])
        ref.current.rotation.y = Math.sin(i * 1.7) * 0.6
      } else {
        const a = t * 0.45 + i * 2.1
        ref.current.position.set(home[0] + Math.cos(a) * 0.22, 0, home[1] + Math.sin(a) * 0.22)
        ref.current.rotation.y = -a // face along the circle
        anim.v = 0.35
      }
    }
    if (spark.current) {
      spark.current.position.y = 0.75 + Math.sin(t * 3 + i) * 0.06
      spark.current.rotation.y = t * 2
    }
  })
  return (
    <group ref={ref}>
      <Blob r={0.2} />
      <group scale={0.8}>
        <Dog coat={pup.coat} anim={anim} sitting={sits} seed={i * 1.3} />
      </group>
      {pup.fresh && (
        <group ref={spark}>
          <mesh>
            <octahedronGeometry args={[0.08]} />
            <meshBasicMaterial color="#ffd60a" />
          </mesh>
        </group>
      )}
    </group>
  )
}

export default function PuppyShelter3D({ pups, theme: themeId }: PuppyShelter3DProps) {
  const theme = themeById[themeId]
  return (
    <Canvas frameloop="always" dpr={[1, 1.75]} camera={{ fov: 36, position: [0, 9, 6] }} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={[theme.surround]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[3, 10, 6]} intensity={1.3} />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} color={theme.rim} />
      <Room pups={pups} theme={theme} />
    </Canvas>
  )
}

function Room({ pups, theme }: { pups: ShelterPup[]; theme: (typeof themeById)[ThemeId] }) {
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  // Re-lay out only when the card's shape changes noticeably.
  const shape = Math.round(aspect * 10) / 10
  const { hx, hz, homes } = useMemo(() => layout(pups.length, shape), [pups.length, shape])
  return (
    <>
      <Fit hx={hx} hz={hz} />
      {/* floor, back + side walls */}
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[hx * 2, 0.06, hz * 2]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      {[
        [0, -hz, hx * 2 + 0.14, 0.14],
        [-hx, 0, 0.14, hz * 2],
        [hx, 0, 0.14, hz * 2],
      ].map(([x, z, w, d], k) => (
        <mesh key={k} position={[x, 0.3, z]}>
          <boxGeometry args={[w, 0.6, d]} />
          <meshStandardMaterial color="#f5f5fa" roughness={0.8} />
        </mesh>
      ))}
      {/* rug */}
      <mesh position={[0, 0.004, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.min(hx, hz) * 0.75, 40]} />
        <meshStandardMaterial color={theme.pen} roughness={1} />
      </mesh>
      {/* beds along the back wall, a bowl in the corner */}
      {[-0.6, 0, 0.6].map((f, k) => (
        <group key={k} position={[f * hx, 0, -hz + 0.45]}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.32, 0.34, 0.12, 20]} />
            <meshStandardMaterial color="#b5763f" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.04, 20]} />
            <meshStandardMaterial color="#ffe2b8" roughness={1} />
          </mesh>
        </group>
      ))}
      <group position={[hx - 0.45, 0, hz - 0.45]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.16, 0.12, 0.1, 18]} />
          <meshStandardMaterial color="#e53935" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.02, 18]} />
          <meshStandardMaterial color="#8a5638" roughness={1} />
        </mesh>
      </group>
      {pups.map((p, i) => (
        <Pup key={i} pup={p} home={homes[i]} i={i} />
      ))}
    </>
  )
}
