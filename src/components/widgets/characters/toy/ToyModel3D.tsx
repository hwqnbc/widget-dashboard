// The toy minifigure's mesh-level 3D model: the 2D ToyFigure's teal cap &
// torso, green legs and chest badge/shell rebuilt from three.js primitives.
// Venue-neutral — it neither spins nor assumes a stage, so it can stand
// anywhere: the Avatar Actions viewer puts it on the FigureStage3D turntable,
// the Drone Sim plants it in the world as the RC operator. It owns only the
// character's animation: a hint of idle arm sway, and `playing` runs the 3D
// take on the toy's "6 7" celebration — a bounce with both arms raised and
// pumping alternately. Animation mutates refs in useFrame (zero React
// renders), matching the drone widgets' input path. Faces +Z; ~1.85 units
// tall, feet at y=0. `action` picks a named move from the registry's
// actions3d library — 'sixseven' (the "6 7" dance) or 'sixsevenshow' (the
// same dance flanked by big red "6"/"7" numerals built from primitives,
// popping in with a spring and bobbing in counter-phase with the arms, the
// 2D SixSevenFigure's popL/popR); undefined/unknown ids idle.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from toy/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion } from 'three'
import type { Group } from 'three'
import { TOY as T } from './toyPalette'

/** Scratch quaternion for the numeral billboarding (no per-frame allocs). */
const TMP_Q = new Quaternion()

const PLASTIC = { roughness: 0.55, metalness: 0 }
/** Glossy numeral red (the 2D digits are T.badge with a white outline). */
const DIGIT = { roughness: 0.3, metalness: 0 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Digits flank at waist height (the 2D places them in the lower third) —
 * below the dancing arms' reach (raised hands stay above y ≈ 1.0). */
const DIGIT_X = 0.78
const DIGIT_Y = 0.62

export default function ToyModel3D({ action }: { action?: string }) {
  const bodyRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
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
    const dancing = action === 'sixseven' || action === 'sixsevenshow'
    const show = action === 'sixsevenshow'
    const body = bodyRef.current
    if (body) body.position.y = dancing ? Math.abs(Math.sin(t * 5.4)) * 0.16 : 0
    // Arms hang with a hint of sway when idle; raised and pumping
    // alternately (the "6 7" scales motion) while celebrating.
    const s = Math.sin(t * 5.4)
    const lift = dancing ? 1.75 : 0.12
    const swing = dancing ? s * 0.45 : Math.sin(t * 1.7) * 0.05
    // +z rotation moves a hanging arm toward +x, so left/right mirror.
    if (armLRef.current) armLRef.current.rotation.z = -(lift + swing)
    if (armRRef.current) armRRef.current.rotation.z = lift - swing
    // The flanking numerals: spring pop-in from t0, then a counter-phase
    // bob off the same oscillator as the arms ("six… seven" weighing).
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
      {/* arms: groups pivoted at the shoulder so useFrame swings them */}
      <group ref={armLRef} position={[-0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={T.skin} {...PLASTIC} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={T.teal} {...PLASTIC} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={T.skin} {...PLASTIC} />
        </mesh>
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
      {/* face: eyes + smile on the head's front */}
      <mesh position={[-0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.42, 0.255]} rotation-z={Math.PI * 1.05}>
        <torusGeometry args={[0.075, 0.014, 8, 16, Math.PI * 0.9]} />
        <meshStandardMaterial color={T.line} roughness={0.3} />
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
