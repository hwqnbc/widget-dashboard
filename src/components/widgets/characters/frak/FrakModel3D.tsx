// Frak's mesh-level 3D model: the 2D FrakFigure's faceted lime hood (peak
// spike + darker back drape), orange face opening with the green lower-face
// wrap, gunmetal torso with the lime hex chest plate + belt bar, orange arms
// with black gloves, printed grey legs, and the two pearl-gold SABERS —
// broad curved blades with knuckle-bow hilts, ALWAYS in hand (the 2D art has
// no sheath), rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'flurry': the 2D celebration's choreography — the arms ALTERNATE in
//   antiphase: one raises its blade overhead-forward while the other
//   chops down-and-inward across the front (sagittal chop, a small inward
//   shoulder-y yaw pulling the struck blade toward the midline), swapping
//   every half-beat on the 2D's ~1.24 s cycle. A short raise-in blend at
//   action start lifts both arms out of the idle guard so the loop never
//   pops. Each arm runs its own strike progress (k and 1−k) — unlike the
//   darkarin cross, which mirrors one scalar set.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from frak/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { FR } from './frakPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Flurry pose targets — RIGHT-arm values; the left arm mirrors y/z. */
const IDLE_SHZ = 0.25 // idle guard: arms slightly out, blades up-forward
const IDLE_SHY = 0.45 // slight outward yaw: the guard reads as a V face-on (#61)
const IDLE_ELBOW = -1.85 // elbows bent so both blades stand up-forward at rest
const FLURRY_SHZ = 0.12 // during the flurry the arms stay near the body
const RAISE_SHX = -2.35 // shoulder x: arm swung overhead-forward, blade up
const RAISE_ELBOW = -0.25
const STRIKE_SHX = -0.55 // chop landed: arm forward-down
const STRIKE_SHY = -0.4 // inward yaw at the strike — the blade drives at the midline
const STRIKE_ELBOW = -0.55
const WRIST_TILT = -0.35 // fixed slight up-tilt: blade = the forearm's obtuse extension
const FLURRY_T = 1.24 // full loop (s) — the 2D's two 620 ms half-beats
const HALF = FLURRY_T / 2
const TWEEN = 0.5 // the 2D's 0.5 s move; the rest of the half-beat holds
const RAISE_IN = 0.35 // blend from the idle guard into the loop at action start

/** A pearl-gold SABER in local coords: hilt at the origin, blade up (+y),
 * ~0.7 long — a broad flat blade whose upper third sweeps back toward +x
 * (the curve), a bright goldHi stripe on the +x cutting edge, and a
 * knuckle bow arcing from the crossguard to the pommel on the edge side.
 * The held groups roll it rotation-y=π/2 so the EDGE leads the sagittal
 * chop and the flat faces sideways — a slice, not a flat slap (#64);
 * with the curve bowing forward the two hands mirror by construction. */
function GoldSaber() {
  return (
    <group>
      {/* broad lower blade + swept-back upper segment + tip wedge */}
      <mesh position={[0, 0.27, 0]}>
        <boxGeometry args={[0.09, 0.46, 0.022]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} />
      </mesh>
      <mesh position={[0.03, 0.55, 0]} rotation-z={-0.2}>
        <boxGeometry args={[0.078, 0.2, 0.022]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} />
      </mesh>
      <mesh position={[0.075, 0.68, 0]} rotation-z={-0.5} scale={[1, 1, 0.3]}>
        <coneGeometry args={[0.038, 0.12, 4]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} flatShading />
      </mesh>
      {/* bright stripe along the +x cutting edge */}
      <mesh position={[0.038, 0.27, 0]}>
        <boxGeometry args={[0.018, 0.44, 0.026]} />
        <meshStandardMaterial color={FR.goldHi} {...STEEL} />
      </mesh>
      <mesh position={[0.068, 0.55, 0]} rotation-z={-0.2}>
        <boxGeometry args={[0.016, 0.18, 0.026]} />
        <meshStandardMaterial color={FR.goldHi} {...STEEL} />
      </mesh>
      {/* crossguard + knuckle bow (half-torus on the edge side) */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.16, 0.03, 0.05]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} />
      </mesh>
      <mesh position={[0, -0.09, 0]} rotation-z={-Math.PI / 2}>
        <torusGeometry args={[0.11, 0.013, 8, 12, Math.PI]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} />
      </mesh>
      {/* wrapped grip + pommel */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.16, 8]} />
        <meshStandardMaterial color={FR.glove} {...CLOTH} />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[0.045, 0.03, 0.045]} />
        <meshStandardMaterial color={FR.gold} {...STEEL} />
      </mesh>
    </group>
  )
}

export default function FrakModel3D({ action }: { action?: string }) {
  const bodyRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const heldLRef = useRef<Group>(null)
  const heldRRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // choreographed loops start at phase 0, not mid-move
    }
    const body = bodyRef.current
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const heldL = heldLRef.current
    const heldR = heldRRef.current
    if (!body || !armL || !armR || !elbowL || !elbowR || !heldL || !heldR) return

    // Per-action pose; every mutable written every frame (self-correcting).
    // Right-arm scalars + the left arm's own strike progress (antiphase).
    let shXR = 0
    let shYR = IDLE_SHY
    let shZR = IDLE_SHZ
    let elbR = IDLE_ELBOW
    let shXL = 0
    let shYL = IDLE_SHY
    let shZL = IDLE_SHZ
    let elbL = IDLE_ELBOW
    let bodyY = 0

    if (action === 'flurry') {
      const te = t - t0Ref.current
      const raise = smooth(Math.min(te / RAISE_IN, 1)) // guard → loop, no pop
      const tau = te % FLURRY_T
      const m = smooth(Math.min((tau < HALF ? tau : tau - HALF) / TWEEN, 1))
      const kR = tau < HALF ? m : 1 - m // right strikes on the first half-beat
      const kL = tau < HALF ? 1 - m : m
      // loop pose per arm, then blended out of the idle guard by `raise`
      shXR = lerp(0, lerp(RAISE_SHX, STRIKE_SHX, kR), raise)
      shYR = lerp(IDLE_SHY, lerp(0, STRIKE_SHY, kR), raise)
      shZR = lerp(IDLE_SHZ, FLURRY_SHZ, raise)
      elbR = lerp(IDLE_ELBOW, lerp(RAISE_ELBOW, STRIKE_ELBOW, kR), raise)
      shXL = lerp(0, lerp(RAISE_SHX, STRIKE_SHX, kL), raise)
      shYL = lerp(IDLE_SHY, lerp(0, STRIKE_SHY, kL), raise)
      shZL = shZR
      elbL = lerp(IDLE_ELBOW, lerp(RAISE_ELBOW, STRIKE_ELBOW, kL), raise)
      // a small dip as each chop lands
      bodyY = -0.03 * Math.sin(Math.PI * Math.min((tau % HALF) / TWEEN, 1)) * raise
    } else {
      const sway = Math.sin(t * 1.7) * 0.05
      shZR = IDLE_SHZ + sway // both arms breathe out/in together (mirrored)
      shZL = IDLE_SHZ + sway
    }

    body.position.y = bodyY
    armR.rotation.x = shXR
    armR.rotation.y = shYR
    armR.rotation.z = shZR
    armL.rotation.x = shXL
    armL.rotation.y = -shYL
    armL.rotation.z = -shZL
    elbowR.rotation.x = elbR
    elbowL.rotation.x = elbL
    heldR.rotation.x = WRIST_TILT
    heldL.rotation.x = WRIST_TILT
  })

  return (
    <group ref={bodyRef}>
      {/* printed grey legs + black boots */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={FR.legs} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={FR.legs} {...CLOTH} />
      </mesh>
      {/* lime thigh patch (left) + green diagonal slashes (right) */}
      <mesh position={[-0.14, 0.42, 0.14]}>
        <boxGeometry args={[0.09, 0.06, 0.02]} />
        <meshStandardMaterial color={FR.lime} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.42, 0.14]} rotation-z={0.6}>
        <boxGeometry args={[0.1, 0.022, 0.02]} />
        <meshStandardMaterial color={FR.green} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.34, 0.14]} rotation-z={0.6}>
        <boxGeometry args={[0.1, 0.022, 0.02]} />
        <meshStandardMaterial color={FR.green} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={FR.glove} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={FR.glove} {...CLOTH} />
      </mesh>
      {/* belt with the lime bar */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={FR.torsoShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.17]}>
        <boxGeometry args={[0.2, 0.06, 0.02]} />
        <meshStandardMaterial color={FR.lime} {...CLOTH} />
      </mesh>
      {/* gunmetal torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={FR.torso} {...CLOTH} flatShading />
      </mesh>
      {/* lime hex chest plate with the nested green glyph */}
      <mesh position={[0, 0.98, 0.26]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.11, 0.11, 0.025, 6]} />
        <meshStandardMaterial color={FR.lime} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 0.98, 0.28]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 6]} />
        <meshStandardMaterial color={FR.green} {...CLOTH} flatShading />
      </mesh>
      {/* collar gorget hiding the hood/torso seam */}
      <mesh position={[0, 1.24, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.15, 0.19, 0.08, 4]} />
        <meshStandardMaterial color={FR.torsoShade} {...CLOTH} flatShading />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Orange skin sleeves, black glove hands, a gold sword in each. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={FR.skin} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={FR.skin} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={FR.skin} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={FR.skin} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={FR.glove} {...CLOTH} />
          </mesh>
          {/* the saber in hand; rides the FOREARM as its obtuse extension,
           * rolled 90° so the cutting edge leads the chop */}
          <group ref={heldLRef} position={[0, -0.26, 0]} rotation-z={Math.PI} rotation-y={Math.PI / 2}>
            <GoldSaber />
          </group>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={FR.skin} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={FR.skin} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={FR.skin} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={FR.skin} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={FR.glove} {...CLOTH} />
          </mesh>
          <group ref={heldRRef} position={[0, -0.26, 0]} rotation-z={Math.PI} rotation-y={Math.PI / 2}>
            <GoldSaber />
          </group>
        </group>
      </group>
      {/* neck stub in hood-drape green (the 2D hood base meets the torso) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={FR.hoodShade} {...CLOTH} />
      </mesh>
      {/* faceted lime hood: 8-seg shell + peak + crown spike, darker back drape */}
      <mesh position={[0, 1.47, 0]}>
        <cylinderGeometry args={[0.27, 0.2, 0.34, 8]} />
        <meshStandardMaterial color={FR.hood} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.68, 0]}>
        <coneGeometry args={[0.28, 0.14, 8]} />
        <meshStandardMaterial color={FR.hood} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <coneGeometry args={[0.035, 0.1, 4]} />
        <meshStandardMaterial color={FR.hood} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.42, -0.2]}>
        <boxGeometry args={[0.42, 0.4, 0.08]} />
        <meshStandardMaterial color={FR.hoodShade} {...CLOTH} />
      </mesh>
      {/* face opening: orange skin panel over the green lower-face wrap */}
      <mesh position={[0, 1.52, 0.24]}>
        <boxGeometry args={[0.3, 0.14, 0.04]} />
        <meshStandardMaterial color={FR.skin} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.41, 0.24]}>
        <boxGeometry args={[0.3, 0.12, 0.04]} />
        <meshStandardMaterial color={FR.wrap} {...CLOTH} />
      </mesh>
      {/* wide-set canted green eyes (inner corners raised) + dark pupils */}
      <mesh position={[-0.09, 1.53, 0.27]} rotation-z={0.15}>
        <boxGeometry args={[0.075, 0.035, 0.02]} />
        <meshStandardMaterial color={FR.eye} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.53, 0.27]} rotation-z={-0.15}>
        <boxGeometry args={[0.075, 0.035, 0.02]} />
        <meshStandardMaterial color={FR.eye} roughness={0.3} />
      </mesh>
      <mesh position={[-0.105, 1.53, 0.28]}>
        <boxGeometry args={[0.022, 0.022, 0.01]} />
        <meshStandardMaterial color={FR.eyeDark} {...CLOTH} />
      </mesh>
      <mesh position={[0.105, 1.53, 0.28]}>
        <boxGeometry args={[0.022, 0.022, 0.01]} />
        <meshStandardMaterial color={FR.eyeDark} {...CLOTH} />
      </mesh>
    </group>
  )
}
