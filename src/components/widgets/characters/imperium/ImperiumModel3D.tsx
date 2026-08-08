// The Imperium Claw General's mesh-level 3D model: the 2D ClawFigure's black
// faceted helmet with horn spikes, gold mechanical face plate (V-crest, four
// orange eye slits, glowing mouth vent), dark torso with the gold rib print +
// hex core emblem, gold arms with black fists — the LEFT fist akimbo on the
// hip, the RIGHT holding the oversized translucent-orange energy blade on its
// black pistol-grip gun mount — rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'slash': the 2D celebration verbatim — ONLY the right elbow animates,
//   sweeping the blade tip from hip height up past the face and back on a
//   symmetric 0.7 s cosine (the 2D's -18°→+48° ease-in-out keyframes);
//   everything else stays planted, left fist on the hip throughout.
// Grip note: the claw is a PISTOL grip — the blade rides PERPENDICULAR to
// the forearm (local +z of the elbow group), not as its extension like the
// sword avatars, so the elbow's x-rotation is what arcs the tip.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from imperium/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { IM } from './imperiumPalette'
import { GAIT_RATE, WALK_ACTION_SPEED, legGait } from '../shared/legGait'
import type { LegSwing } from '../shared/legGait'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Pose targets. The left arm is permanently akimbo; the right holds the claw. */
const LHIP_SHZ = -0.5 // left shoulder out…
const LHIP_SHY = 0.9 // …bend plane yawed inward (#61) so the fist curls to the hip
const LHIP_ELBOW = -1.05
const R_SHZ = 0.15
const R_SHY = 0.45 // outward yaw (#61): the slash plane angles out so the big blade reads face-on
const R_ELBOW = -0.55 // idle = the 2D's 0° mid-pose, blade level ahead
const CLAW_TILT = 0.5 // fixed down-cant of the mount (the 2D's -22° rest rake)
const SLASH_T = 0.7 // the 2D keyframes' duration
const SLASH_LOW = 0.31 // elbow offset below idle — blade dips (the 2D's -18°)
const SLASH_HIGH = -0.84 // above idle — blade up past the face (the 2D's +48°)

/** The energy claw in hand-local coords: fist at the origin, black barrel
 * over the grip, the broad translucent blade extending +z (forward). */
function ClawWeapon() {
  return (
    <group rotation-x={CLAW_TILT}>
      {/* grip + barrel + muzzle nub + steel-ringed side port */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.04, 0.08, 0.05]} />
        <meshStandardMaterial color={IM.gun} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.05, 0.16]}>
        <boxGeometry args={[0.05, 0.06, 0.45]} />
        <meshStandardMaterial color={IM.gun} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.05, -0.1]}>
        <boxGeometry args={[0.04, 0.05, 0.08]} />
        <meshStandardMaterial color={IM.blade} transparent opacity={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.05, 0.02]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 0.062, 8]} />
        <meshStandardMaterial color={IM.steel} {...STEEL} />
      </mesh>
      {/* broad translucent-orange blade with the inner glow + wedge tip */}
      <mesh position={[0, 0.09, 0.5]}>
        <boxGeometry args={[0.025, 0.2, 0.66]} />
        <meshStandardMaterial color={IM.blade} transparent opacity={0.62} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.09, 0.48]}>
        <boxGeometry args={[0.012, 0.14, 0.56]} />
        <meshStandardMaterial color={IM.bladeHi} transparent opacity={0.4} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.09, 0.9]} rotation-x={Math.PI / 2} scale={[0.25, 1, 1]}>
        <coneGeometry args={[0.1, 0.14, 4]} />
        <meshStandardMaterial color={IM.blade} transparent opacity={0.62} roughness={0.25} flatShading />
      </mesh>
      {/* the two square cut-outs at the blade base */}
      <mesh position={[0, 0.13, 0.28]}>
        <boxGeometry args={[0.03, 0.06, 0.06]} />
        <meshStandardMaterial color={IM.gun} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.13, 0.38]}>
        <boxGeometry args={[0.03, 0.06, 0.06]} />
        <meshStandardMaterial color={IM.gun} {...CLOTH} />
      </mesh>
    </group>
  )
}

export default function ImperiumModel3D({ action }: { action?: string }) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const legLRef = useRef<Group>(null)
  const legRRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)
  const walkPhaseRef = useRef(0)
  const gaitRef = useRef<LegSwing>({ left: 0, right: 0 }).current

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the slash always starts at its LOW extreme
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    if (!armL || !armR || !elbowL || !elbowR || !legL || !legR) return

    // Per-action pose; every mutable written every frame (self-correcting).
    let elbR = R_ELBOW
    let swayR = 0
    let gaitL = 0
    let gaitR = 0

    if (action === 'slash') {
      // the 2D celebration: a symmetric ease-in-out sweep of ONLY the right
      // elbow, low → high → low; everything else stays planted
      const tau = (t - t0Ref.current) % SLASH_T
      const k = (1 - Math.cos((tau / SLASH_T) * Math.PI * 2)) / 2
      elbR = R_ELBOW + lerp(SLASH_LOW, SLASH_HIGH, k)
    } else if (action === 'walk') {
      walkPhaseRef.current += WALK_ACTION_SPEED * delta * GAIT_RATE
      const g = legGait(walkPhaseRef.current, WALK_ACTION_SPEED, gaitRef)
      gaitL = g.left
      gaitR = g.right
    } else {
      swayR = Math.sin(t * 1.7) * 0.04 // idle: the sword arm breathes a touch
    }

    armR.rotation.z = R_SHZ + swayR
    armR.rotation.y = R_SHY
    armR.rotation.x = 0
    armL.rotation.z = LHIP_SHZ
    armL.rotation.y = LHIP_SHY
    armL.rotation.x = 0
    elbowR.rotation.x = elbR
    elbowL.rotation.x = LHIP_ELBOW
    legL.rotation.x = gaitL // walk gait (0 in every other branch)
    legR.rotation.x = gaitR
  })

  return (
    <group>
      {/* black-armor legs with orange circuit accents + darkest boots — each
       * on a hip pivot [±0.14, 0.5, 0] (shared leg-gait convention) so the walk
       * gait swings the leg (accent + boot ride along); children −0.5 y */}
      <group ref={legLRef} position={[-0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={IM.armor} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.16, 0.14]}>
          <boxGeometry args={[0.02, 0.16, 0.02]} />
          <meshStandardMaterial color={IM.circuit} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={IM.line} {...CLOTH} />
        </mesh>
      </group>
      <group ref={legRRef} position={[0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={IM.armor} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.26, 0.14]}>
          <boxGeometry args={[0.09, 0.02, 0.02]} />
          <meshStandardMaterial color={IM.circuit} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={IM.line} {...CLOTH} />
        </mesh>
      </group>
      {/* waist with the gold belt line */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={IM.torso} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.6, 0.17]}>
        <boxGeometry args={[0.4, 0.025, 0.01]} />
        <meshStandardMaterial color={IM.gold} {...STEEL} />
      </mesh>
      {/* dark torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={IM.torso} {...CLOTH} flatShading />
      </mesh>
      {/* gold rib print + hex core emblem with the orange circuit spine */}
      <mesh position={[-0.06, 1.05, 0.26]} rotation-z={0.35}>
        <boxGeometry args={[0.03, 0.14, 0.01]} />
        <meshStandardMaterial color={IM.gold} {...STEEL} />
      </mesh>
      <mesh position={[0.06, 1.05, 0.26]} rotation-z={-0.35}>
        <boxGeometry args={[0.03, 0.14, 0.01]} />
        <meshStandardMaterial color={IM.gold} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.9, 0.26]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.09, 0.09, 0.025, 6]} />
        <meshStandardMaterial color={IM.gold} {...STEEL} flatShading />
      </mesh>
      <mesh position={[0, 0.88, 0.28]}>
        <boxGeometry args={[0.02, 0.14, 0.01]} />
        <meshStandardMaterial color={IM.circuit} {...CLOTH} />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Black pauldron caps, gold sleeves, black fists. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={IM.armor} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={IM.gold} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={IM.gold} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={IM.gold} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={IM.gunShade} {...CLOTH} />
          </mesh>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={IM.armor} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={IM.gold} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={IM.gold} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={IM.gold} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={IM.gunShade} {...CLOTH} />
          </mesh>
          {/* the claw mount in the fist; blade ⊥ forearm (pistol grip) */}
          <group position={[0, -0.26, 0]}>
            <ClawWeapon />
          </group>
        </group>
      </group>
      {/* neck + faceted black helmet: 8-seg shell, dome cap, horn spikes */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={IM.armorShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.27, 0.2, 0.36, 8]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <coneGeometry args={[0.28, 0.16, 8]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[-0.19, 1.74, 0]} rotation-z={0.45}>
        <coneGeometry args={[0.045, 0.22, 4]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.19, 1.74, 0]} rotation-z={-0.45}>
        <coneGeometry args={[0.045, 0.22, 4]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} flatShading />
      </mesh>
      {/* gold face plate under the black V-crest */}
      <mesh position={[0, 1.47, 0.24]}>
        <boxGeometry args={[0.26, 0.13, 0.045]} />
        <meshStandardMaterial color={IM.face} {...STEEL} roughness={0.5} />
      </mesh>
      <mesh position={[-0.065, 1.56, 0.25]} rotation-z={-0.4}>
        <boxGeometry args={[0.14, 0.035, 0.05]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} />
      </mesh>
      <mesh position={[0.065, 1.56, 0.25]} rotation-z={0.4}>
        <boxGeometry args={[0.14, 0.035, 0.05]} />
        <meshStandardMaterial color={IM.armor} {...CLOTH} />
      </mesh>
      {/* four angular orange eye slits: wide upper pair, inset lower pair */}
      <mesh position={[-0.085, 1.5, 0.27]} rotation-z={-0.2}>
        <boxGeometry args={[0.085, 0.032, 0.02]} />
        <meshStandardMaterial color={IM.eye} roughness={0.3} />
      </mesh>
      <mesh position={[0.085, 1.5, 0.27]} rotation-z={0.2}>
        <boxGeometry args={[0.085, 0.032, 0.02]} />
        <meshStandardMaterial color={IM.eye} roughness={0.3} />
      </mesh>
      <mesh position={[-0.065, 1.44, 0.27]} rotation-z={-0.2}>
        <boxGeometry args={[0.055, 0.026, 0.02]} />
        <meshStandardMaterial color={IM.eye} roughness={0.3} />
      </mesh>
      <mesh position={[0.065, 1.44, 0.27]} rotation-z={0.2}>
        <boxGeometry args={[0.055, 0.026, 0.02]} />
        <meshStandardMaterial color={IM.eye} roughness={0.3} />
      </mesh>
      {/* mouth-guard vent with the orange glow line */}
      <mesh position={[0, 1.36, 0.25]}>
        <boxGeometry args={[0.09, 0.04, 0.02]} />
        <meshStandardMaterial color={IM.gunShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.36, 0.262]}>
        <boxGeometry args={[0.07, 0.012, 0.005]} />
        <meshStandardMaterial color={IM.eye} roughness={0.3} />
      </mesh>
    </group>
  )
}
