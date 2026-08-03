// Gold Gunner's mesh-level 3D model: the 2D GunnerFigure's yellow minifig
// head with the brown swept hair, yellow/orange jacket over the black V-neck,
// black tactical legs with knee-pad prints, and the two guns ALWAYS in hand —
// the black rifle raised in the RIGHT fist, the gold twin-barrel blaster held
// low-forward in the LEFT — rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'blaze': the 2D celebration's choreography — both guns fire in
//   ALTERNATION on a 1 s loop (the 2D's 0.5 s-per-gun stagger): each gun's
//   elbow snaps back on a short recoil pulse while an emissive muzzle-flash
//   star pops at its barrel mouth (`visible` toggled imperatively, the
//   ninja-draw idiom), right rifle then left blaster. The held pose IS the
//   2D rest pose, so the loop starts clean with no raise-in blend.
// Grip note: both guns are PISTOL grips like the imperium claw — the barrel
// rides PERPENDICULAR to the forearm (local +z of the elbow group), so the
// elbow's x-rotation is what aims it: the raised right forearm points the
// rifle up-forward, the hanging left forearm points the blaster forward.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from goldgunner/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { GG } from './goldGunnerPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

/** Pose targets. Right arm raised (rifle up-forward), left arm low (blaster
 * forward) — the 2D rest pose, held through idle AND the blaze loop. */
const R_SHZ = 0.18 // right shoulder slightly out…
const R_SHY = 0.25 // …with a touch of outward yaw (#61) so the rifle reads face-on
const R_ELBOW = -1.35 // forearm forward: the perpendicular rifle points up-forward
const L_SHZ = 0.15
const L_SHY = 0.2
const L_ELBOW = -0.35 // forearm near-hanging: the blaster points forward, level-ish
const BLAZE_T = 0.6 // full loop (s) — near the 2D's per-gun tempo, alternating
const HALF = BLAZE_T / 2
const KICK_T = 0.24 // recoil pulse length within each half
const FLASH_T = 0.1 // muzzle flash window at the start of each half
const R_KICK = 0.35 // rifle elbow snaps back (toward 0) — barrel tips rearward
const L_KICK = -0.3 // blaster elbow snaps up (more negative) — barrel tips up

/** A sine recoil pulse over the first KICK_T of a half-beat, 0 after. */
const pulse = (x: number) => (x < KICK_T ? Math.sin((Math.PI * x) / KICK_T) : 0)

/** An emissive muzzle-flash burst at the local origin: a core sphere, two
 * crossed spikes across the barrel axis, and a forward cone along +z so the
 * flash still reads when the barrel points at the camera (a flat star seen
 * end-on has almost no cross-section). Parent toggles `visible` per frame. */
function MuzzleFlash() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color={GG.flashCore} emissive={GG.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.026, 0.24, 0.026]} />
        <meshStandardMaterial color={GG.flash} emissive={GG.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.24, 0.026, 0.026]} />
        <meshStandardMaterial color={GG.flash} emissive={GG.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.07]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.05, 0.16, 8]} />
        <meshStandardMaterial color={GG.flashCore} emissive={GG.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
    </group>
  )
}

/** The black rifle in hand-local coords: fist at the origin, black grip over
 * it, slab body + long thin barrel extending +z, stock back past the wrist,
 * top sight posts — the 2D's tall dark rifle. Muzzle mouth at z ≈ 0.78. */
function BlackRifle() {
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.04, 0.08, 0.05]} />
        <meshStandardMaterial color={GG.gunShade} {...CLOTH} />
      </mesh>
      {/* receiver body + shoulder stock behind the grip */}
      <mesh position={[0, 0.05, 0.12]}>
        <boxGeometry args={[0.05, 0.07, 0.4]} />
        <meshStandardMaterial color={GG.gun} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.03, -0.14]} rotation-x={-0.25}>
        <boxGeometry args={[0.045, 0.06, 0.18]} />
        <meshStandardMaterial color={GG.gunShade} {...CLOTH} />
      </mesh>
      {/* long thin barrel + muzzle block */}
      <mesh position={[0, 0.06, 0.5]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 0.44, 10]} />
        <meshStandardMaterial color={GG.gunHi} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.06, 0.74]}>
        <boxGeometry args={[0.05, 0.05, 0.08]} />
        <meshStandardMaterial color={GG.gunShade} {...CLOTH} />
      </mesh>
      {/* sight posts on the receiver top */}
      <mesh position={[0, 0.11, 0.05]}>
        <boxGeometry args={[0.025, 0.05, 0.03]} />
        <meshStandardMaterial color={GG.panel} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.1, 0.26]}>
        <boxGeometry args={[0.02, 0.03, 0.02]} />
        <meshStandardMaterial color={GG.panel} {...CLOTH} />
      </mesh>
    </group>
  )
}

/** The gold twin-barrel blaster in hand-local coords: fist at the origin,
 * two stacked gold barrels extending +z with bright end caps + dark mouths,
 * a gold-highlight connector block between them. Mouths at z ≈ 0.4. */
function GoldBlaster() {
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.04, 0.08, 0.05]} />
        <meshStandardMaterial color={GG.goldShade} {...STEEL} />
      </mesh>
      {/* stacked barrels */}
      <mesh position={[0, 0.05, 0.16]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.042, 0.042, 0.44, 12]} />
        <meshStandardMaterial color={GG.gold} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.15, 0.16]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.042, 0.042, 0.44, 12]} />
        <meshStandardMaterial color={GG.gold} {...STEEL} />
      </mesh>
      {/* bright end caps + dark muzzle mouths */}
      <mesh position={[0, 0.05, 0.36]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 12]} />
        <meshStandardMaterial color={GG.goldBright} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.15, 0.36]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 12]} />
        <meshStandardMaterial color={GG.goldBright} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.05, 0.39]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
        <meshStandardMaterial color={GG.goldEdge} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.15, 0.39]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
        <meshStandardMaterial color={GG.goldEdge} {...CLOTH} />
      </mesh>
      {/* highlight connector block with the two shade rivets */}
      <mesh position={[0, 0.1, 0.08]}>
        <boxGeometry args={[0.06, 0.13, 0.16]} />
        <meshStandardMaterial color={GG.goldHi} {...STEEL} />
      </mesh>
      <mesh position={[0.032, 0.1, 0.05]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, 0.01, 8]} />
        <meshStandardMaterial color={GG.goldShade} {...STEEL} />
      </mesh>
      <mesh position={[0.032, 0.1, 0.12]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, 0.01, 8]} />
        <meshStandardMaterial color={GG.goldShade} {...STEEL} />
      </mesh>
    </group>
  )
}

export default function GoldGunnerModel3D({ action }: { action?: string }) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const flashRRef = useRef<Group>(null)
  const flashLRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the loop always opens on the rifle's shot
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const flashR = flashRRef.current
    const flashL = flashLRef.current
    if (!armL || !armR || !elbowL || !elbowR || !flashR || !flashL) return

    // Per-action pose; every mutable written every frame (self-correcting).
    let elbR = R_ELBOW
    let elbL = L_ELBOW
    let sway = 0
    let showR = false
    let showL = false

    if (action === 'blaze') {
      // rifle fires on the first half-beat, blaster on the second; each
      // gun's elbow takes a short recoil pulse with the flash at its start
      const tau = (t - t0Ref.current) % BLAZE_T
      elbR = R_ELBOW + R_KICK * (tau < HALF ? pulse(tau) : 0)
      elbL = L_ELBOW + L_KICK * (tau >= HALF ? pulse(tau - HALF) : 0)
      showR = tau < FLASH_T
      showL = tau >= HALF && tau < HALF + FLASH_T
    } else {
      sway = Math.sin(t * 1.7) * 0.04 // idle: both arms breathe together
    }

    armR.rotation.z = R_SHZ + sway
    armR.rotation.y = R_SHY
    armR.rotation.x = 0
    armL.rotation.z = -(L_SHZ + sway)
    armL.rotation.y = -L_SHY
    armL.rotation.x = 0
    elbowR.rotation.x = elbR
    elbowL.rotation.x = elbL
    flashR.visible = showR
    flashL.visible = showL
  })

  return (
    <group>
      {/* black tactical legs with panel prints + knee pads, darkest boots */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={GG.pants} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={GG.pants} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.42, 0.14]}>
        <boxGeometry args={[0.14, 0.05, 0.02]} />
        <meshStandardMaterial color={GG.panel} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.42, 0.14]}>
        <boxGeometry args={[0.14, 0.05, 0.02]} />
        <meshStandardMaterial color={GG.panel} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.26, 0.14]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.045, 0.02, 10]} />
        <meshStandardMaterial color={GG.pantsShade} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.26, 0.14]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.045, 0.02, 10]} />
        <meshStandardMaterial color={GG.pantsShade} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={GG.pantsShade} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={GG.pantsShade} {...CLOTH} />
      </mesh>
      {/* waist with the buckle plate */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={GG.pants} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.17]}>
        <boxGeometry args={[0.14, 0.05, 0.02]} />
        <meshStandardMaterial color={GG.panel} {...CLOTH} />
      </mesh>
      {/* jacket torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={GG.jacket} {...CLOTH} flatShading />
      </mesh>
      {/* black open-jacket V: long canted lapels from the collar down to the
       * belt, the dark shirt filling the notch between them at the top */}
      <mesh position={[0, 1.08, 0.24]}>
        <boxGeometry args={[0.13, 0.13, 0.02]} />
        <meshStandardMaterial color={GG.shirt} {...CLOTH} />
      </mesh>
      <mesh position={[-0.09, 0.95, 0.26]} rotation-z={0.3}>
        <boxGeometry args={[0.055, 0.48, 0.025]} />
        <meshStandardMaterial color={GG.vneck} {...CLOTH} />
      </mesh>
      <mesh position={[0.09, 0.95, 0.26]} rotation-z={-0.3}>
        <boxGeometry args={[0.055, 0.48, 0.025]} />
        <meshStandardMaterial color={GG.vneck} {...CLOTH} />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Jacket sleeves (the left in the 2D's deeper orange), yellow hands. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={GG.jacketShade} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={GG.jacketShade} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={GG.jacketShade} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={GG.jacketShade} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={GG.skin} {...CLOTH} />
          </mesh>
          {/* the twin blaster in the fist; barrel ⊥ forearm (pistol grip) */}
          <group position={[0, -0.26, 0]}>
            <GoldBlaster />
            <group ref={flashLRef} position={[0, 0.1, 0.5]} visible={false}>
              <MuzzleFlash />
            </group>
          </group>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={GG.jacket} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={GG.jacket} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={GG.jacket} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={GG.jacket} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={GG.skin} {...CLOTH} />
          </mesh>
          {/* the rifle in the fist; barrel ⊥ forearm (pistol grip) */}
          <group position={[0, -0.26, 0]}>
            <BlackRifle />
            <group ref={flashRRef} position={[0, 0.06, 0.84]} visible={false}>
              <MuzzleFlash />
            </group>
          </group>
        </group>
      </group>
      {/* neck + smooth yellow minifig head (round, not faceted — bare skin) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={GG.skinShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.32, 14]} />
        <meshStandardMaterial color={GG.skin} {...CLOTH} />
      </mesh>
      {/* brown swept hair: crown cap + peak, forehead fringe, back drape */}
      <mesh position={[0, 1.63, 0]}>
        <cylinderGeometry args={[0.26, 0.24, 0.12, 8]} />
        <meshStandardMaterial color={GG.hair} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <coneGeometry args={[0.26, 0.14, 8]} />
        <meshStandardMaterial color={GG.hair} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.6, 0.21]} rotation-x={0.35}>
        <boxGeometry args={[0.4, 0.1, 0.08]} />
        <meshStandardMaterial color={GG.hairMid} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.52, -0.19]}>
        <boxGeometry args={[0.42, 0.24, 0.08]} />
        <meshStandardMaterial color={GG.hairShade} {...CLOTH} />
      </mesh>
      {/* face: dark round eyes with white glints, brow arcs, the smile */}
      <mesh position={[-0.08, 1.5, 0.225]}>
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshStandardMaterial color="#1a1a1a" {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.5, 0.225]}>
        <sphereGeometry args={[0.026, 10, 8]} />
        <meshStandardMaterial color="#1a1a1a" {...CLOTH} />
      </mesh>
      <mesh position={[-0.088, 1.508, 0.245]}>
        <sphereGeometry args={[0.008, 6, 5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0.072, 1.508, 0.245]}>
        <sphereGeometry args={[0.008, 6, 5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[-0.08, 1.56, 0.225]} rotation-z={0.2}>
        <boxGeometry args={[0.08, 0.02, 0.015]} />
        <meshStandardMaterial color={GG.line} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.56, 0.225]} rotation-z={-0.2}>
        <boxGeometry args={[0.08, 0.02, 0.015]} />
        <meshStandardMaterial color={GG.line} {...CLOTH} />
      </mesh>
      {/* smile: a shallow half-torus arc, open side up */}
      <mesh position={[0, 1.41, 0.225]} rotation-z={Math.PI}>
        <torusGeometry args={[0.055, 0.011, 6, 10, Math.PI]} />
        <meshStandardMaterial color={GG.line} {...CLOTH} />
      </mesh>
    </group>
  )
}
