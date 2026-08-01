// The toy minifigure's mesh-level 3D model: the 2D ToyFigure's teal cap &
// torso, green legs and chest badge/shell rebuilt from three.js primitives.
// Venue-neutral — it neither spins nor assumes a stage, so it can stand
// anywhere: the Avatar Actions viewer puts it on the FigureStage3D turntable,
// the Drone Sim plants it in the world as the RC operator. Animation mutates
// refs in useFrame (zero React renders). Faces +Z; ~1.85 units tall, feet at
// y=0.
//
// `action` picks a named move from the registry's actions3d library:
// - 'dance': a generic energetic dance (not 6-7 related) — jumping with the
//   arms raised overhead, waving with BOTH joints: the shoulder swing plus a
//   smaller offset-phase elbow wave.
// - 'sixsevenshow': the 6-7 meme — the figure stands still, elbows at the
//   sides, FOREARMS hinged FORWARD at the elbow (rotation.x, hands out in
//   front of the body) bobbing up/down alternately, the "six… seven"
//   weighing — flanked by big red "6"/"7" numerals built from primitives,
//   popping in with a spring, bobbing in counter-phase with the hands and
//   billboarded at the camera.
// Both dances swap the smile for the open hyped mouth. Undefined/unknown
// ids idle with a subtle arm sway.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from toy/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion } from 'three'
import type { Group, Mesh } from 'three'
import { TOY as T } from './toyPalette'

/** Scratch quaternion for the numeral billboarding (no per-frame allocs). */
const TMP_Q = new Quaternion()

const PLASTIC = { roughness: 0.55, metalness: 0 }
/** Glossy numeral red (the 2D digits are T.badge with a white outline). */
const DIGIT = { roughness: 0.3, metalness: 0 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Digits flank at waist height (the 2D places them in the lower third) —
 * below the dancing forearms' reach. */
const DIGIT_X = 0.78
const DIGIT_Y = 0.62

export default function ToyModel3D({ action }: { action?: string }) {
  const bodyRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const smileRef = useRef<Mesh>(null)
  const mouthORef = useRef<Mesh>(null)
  const num6Ref = useRef<Group>(null)
  const num7Ref = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the numerals' pop-in springs from the action start
    }
    const dancing = action === 'dance' || action === 'sixsevenshow'
    const show = action === 'sixsevenshow'
    const s = Math.sin(t * 5.4)
    // Every joint channel written every frame (self-correcting on switches).
    let armZ = 0.12 + Math.sin(t * 1.7) * 0.05 // idle sway (mirrored below)
    let armZOpp = 0.12 - Math.sin(t * 1.7) * 0.05
    let elbowZ = 0.12
    let elbowZOpp = 0.12
    let elbowX = 0
    let elbowXOpp = 0
    let bodyY = 0
    if (action === 'dance') {
      // Energetic jump + overhead two-joint wave: shoulders swing the raised
      // arms alternately, forearms add a smaller offset-phase elbow wave.
      bodyY = Math.abs(s) * 0.16
      armZ = 1.75 + s * 0.45
      armZOpp = 1.75 - s * 0.45
      const wave = Math.sin(t * 5.4 + 1.1) * 0.3
      elbowZ = 0.2 + wave
      elbowZOpp = 0.2 - wave
    } else if (show) {
      // The 6-7 meme: stand still, elbows at the sides, FOREARMS hinged
      // FORWARD at the elbow (rotation.x — hands out in front, not to the
      // side), bobbing up/down alternately: the "six… seven" weighing.
      armZ = 0.15
      armZOpp = 0.15
      elbowZ = 0
      elbowZOpp = 0
      const flex = s * 0.5
      elbowX = -Math.PI / 2 + flex
      elbowXOpp = -Math.PI / 2 - flex
    }
    if (armLRef.current) armLRef.current.rotation.z = -armZ
    if (armRRef.current) armRRef.current.rotation.z = armZOpp
    if (elbowLRef.current) {
      elbowLRef.current.rotation.z = -elbowZ
      elbowLRef.current.rotation.x = elbowX
    }
    if (elbowRRef.current) {
      elbowRRef.current.rotation.z = elbowZOpp
      elbowRRef.current.rotation.x = elbowXOpp
    }
    if (bodyRef.current) bodyRef.current.position.y = bodyY
    // hyped open mouth while dancing, smile otherwise (the 2D mouth swap)
    if (smileRef.current) smileRef.current.visible = !dancing
    if (mouthORef.current) mouthORef.current.visible = dancing
    // The flanking numerals: spring pop-in from t0, then a counter-phase
    // bob off the same oscillator as the forearms ("six… seven" weighing).
    const num6 = num6Ref.current
    const num7 = num7Ref.current
    if (num6 && num7) {
      num6.visible = show
      num7.visible = show
      if (show) {
        const k = (t - t0Ref.current) / 0.3
        const pop =
          k < 0.55 ? lerp(0.4, 1.12, smooth(k / 0.55)) : lerp(1.12, 1, smooth((k - 0.55) / 0.45))
        num6.scale.setScalar(pop)
        num7.scale.setScalar(pop)
        num6.position.y = DIGIT_Y + s * 0.1
        num7.position.y = DIGIT_Y - s * 0.1
        // Billboard the flat digits at the camera (they'd read mirrored from
        // behind on a turntable): local = parentWorldRot⁻¹ · cameraRot.
        for (const n of [num6, num7]) {
          n.parent?.getWorldQuaternion(TMP_Q)
          n.quaternion.copy(TMP_Q.invert()).multiply(state.camera.quaternion)
        }
      }
    }
  })

  return (
    <group ref={bodyRef}>
      {/* legs */}
      <mesh position={[-0.14, 0.25, 0]}>
        <boxGeometry args={[0.24, 0.5, 0.26]} />
        <meshStandardMaterial color={T.leg} {...PLASTIC} />
      </mesh>
      <mesh position={[0.14, 0.25, 0]}>
        <boxGeometry args={[0.24, 0.5, 0.26]} />
        <meshStandardMaterial color={T.leg} {...PLASTIC} />
      </mesh>
      {/* hips */}
      <mesh position={[0, 0.56, 0]}>
        <boxGeometry args={[0.52, 0.12, 0.3]} />
        <meshStandardMaterial color={T.legShade} {...PLASTIC} />
      </mesh>
      {/* flared torso: a 4-sided cylinder rotated 45° = tapered box */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={T.teal} {...PLASTIC} flatShading />
      </mesh>
      {/* chest badge + shell emblem (the 2D torso's markings) */}
      <mesh position={[0, 0.83, 0.24]}>
        <boxGeometry args={[0.28, 0.12, 0.05]} />
        <meshStandardMaterial color={T.badge} {...PLASTIC} />
      </mesh>
      <mesh position={[0, 1.02, 0.23]} scale={[1, 0.75, 0.45]}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshStandardMaterial color={T.shell} {...PLASTIC} />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm group — the 2D
       * SixSevenFigure's articulation. Cap spheres keep both joints closed
       * at any pose (lessons #27/#27b). */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={T.teal} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={T.teal} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={T.skin} {...PLASTIC} />
          </mesh>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={T.teal} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={T.teal} {...PLASTIC} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={T.skin} {...PLASTIC} />
          </mesh>
        </group>
      </group>
      {/* neck + head (short cylinder head — minifig proportions) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={T.skin} {...PLASTIC} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.32, 24]} />
        <meshStandardMaterial color={T.skin} {...PLASTIC} />
      </mesh>
      {/* face: eyes + smile (idle) / open hyped mouth (dancing) */}
      <mesh position={[-0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
      </mesh>
      <mesh ref={smileRef} position={[0, 1.42, 0.255]} rotation-z={Math.PI * 1.05}>
        <torusGeometry args={[0.075, 0.014, 8, 16, Math.PI * 0.9]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
      </mesh>
      <mesh ref={mouthORef} position={[0, 1.41, 0.25]} scale={[1, 1.2, 0.5]} visible={false}>
        <sphereGeometry args={[0.035, 12, 10]} />
        <meshStandardMaterial color="#7a3b34" roughness={0.4} />
      </mesh>
      {/* cap: dome + front brim */}
      <mesh position={[0, 1.56, 0]}>
        <sphereGeometry args={[0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={T.teal} {...PLASTIC} />
      </mesh>
      <mesh position={[0, 1.57, 0.3]} rotation-x={-0.08}>
        <boxGeometry args={[0.4, 0.05, 0.26]} />
        <meshStandardMaterial color={T.tealHi} {...PLASTIC} />
      </mesh>
      {/* the flanking "6" and "7" (the 'sixsevenshow' action's numerals),
       * built from primitives — visibility/pop/bob driven per-frame */}
      <group ref={num6Ref} position={[-DIGIT_X, DIGIT_Y, 0.15]} visible={false}>
        {/* bowl + tail rising up-right */}
        <mesh position={[0, -0.1, 0]}>
          <torusGeometry args={[0.11, 0.035, 10, 20]} />
          <meshStandardMaterial color={T.badge} {...DIGIT} />
        </mesh>
        <mesh position={[0.045, 0.13, 0]} rotation-z={-0.45}>
          <boxGeometry args={[0.065, 0.26, 0.06]} />
          <meshStandardMaterial color={T.badge} {...DIGIT} />
        </mesh>
      </group>
      <group ref={num7Ref} position={[DIGIT_X, DIGIT_Y, 0.15]} visible={false}>
        {/* top bar + diagonal descending to bottom-left */}
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.26, 0.07, 0.06]} />
          <meshStandardMaterial color={T.badge} {...DIGIT} />
        </mesh>
        <mesh position={[0, -0.06, 0]} rotation-z={-0.35}>
          <boxGeometry args={[0.07, 0.38, 0.06]} />
          <meshStandardMaterial color={T.badge} {...DIGIT} />
        </mesh>
      </group>
    </group>
  )
}
