// Scar's mesh-level 3D model: the 2D SoldierFigure's tactical helmet (NVG
// mount, rim, comms earmuffs + mic boom) over the scarred, stubbled, scowling
// face, slim MOLLE vest with three mag pouches + belt, sleeve-dark arms with
// gloved fists — the suppressed SMG pistol-gripped in the RIGHT, the
// red-banded flashbang canister in the LEFT — rebuilt from three.js
// primitives. Venue-neutral (no spin, no stage — the FigureStage3D turntable
// or a game world drives its heading): faces +Z, feet at y=0, ~1.85 units
// tall, same skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'breach': the 2D celebration's choreography on the same ~2.4 s loop —
//   the left arm winds back then hurls the canister overhead-forward
//   (canister `visible` OFF at release, an emissive white flash burst pops
//   at a forward-up offset), then the SMG lays covering fire: three right-
//   elbow recoil pulses, each with a muzzle-flash `visible` window at the
//   suppressor tip.
// Grip note: the SMG is a PISTOL grip like the imperium claw — the barrel
// rides PERPENDICULAR to the forearm (local +z of the elbow group), so the
// elbow's x-rotation aims it; the low-ready elbow bend points it up-forward.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from scar/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { SC } from './scarPalette'
import type { AimPose } from '../shared/aimPose'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

/** How far pitch can raise/lower the SMG (radians). */
const AIM_PITCH_MIN = -0.3
const AIM_PITCH_MAX = 0.9

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Pose + breach-timeline targets (loop matches the 2D's 2.4 s). */
const R_SHZ = 0.15
const R_SHY = 0.35 // outward yaw (#61) so the cross-body SMG reads face-on
const R_ELBOW = -1.1 // low ready: the perpendicular barrel points up-forward
const L_SHZ = 0.15
const L_SHY = 0.2
const L_ELBOW = -0.35 // canister arm near-hanging
const BREACH_T = 2.4
const WIND_END = 0.18 // windback done
const RELEASE = 0.5 // canister leaves the hand
const ARM_HOME = 1.0 // left arm settled back
const WIND_SHX = 0.5 // arm swung back behind the hip
const THROW_SHX = -2.3 // arm overhead-forward at release
const BURST_ON = 0.55 // flash burst window
const BURST_OFF = 0.75
const SHOTS = [0.9, 1.25, 1.6] // covering-fire trigger times
const KICK_T = 0.22
const FLASH_T = 0.1
const KICK_AMP = 0.32
/** 'sight' (Avatar Actions widget): shoulder + track + burst, no throw. */
const SIGHT_T = 2.0
const SIGHT_SHOTS = [0.45, 0.75, 1.05, 1.35]

/** Emissive white flash burst (core + crossed spikes + forward cone so it
 * reads even pointing at the camera); parent toggles `visible`. */
function FlashBurst({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color={SC.flashCore} emissive={SC.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.026, 0.24, 0.026]} />
        <meshStandardMaterial color={SC.flash} emissive={SC.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.24, 0.026, 0.026]} />
        <meshStandardMaterial color={SC.flash} emissive={SC.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.07]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.05, 0.16, 8]} />
        <meshStandardMaterial color={SC.flashCore} emissive={SC.flash} emissiveIntensity={2.5} roughness={0.2} />
      </mesh>
    </group>
  )
}

/** The suppressed SMG in hand-local coords: fist at the origin, dark grip
 * over it, receiver + rail extending +z with the holo sight on top, curved
 * mag hanging below, ridged suppressor at the muzzle (mouth z ≈ 0.62),
 * collapsed stock back past the wrist. */
function SuppressedSMG() {
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.04, 0.08, 0.05]} />
        <meshStandardMaterial color={SC.gripDark} {...CLOTH} />
      </mesh>
      {/* receiver + top rail */}
      <mesh position={[0, 0.05, 0.14]}>
        <boxGeometry args={[0.05, 0.08, 0.4]} />
        <meshStandardMaterial color={SC.gun} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.095, 0.14]}>
        <boxGeometry args={[0.055, 0.015, 0.42]} />
        <meshStandardMaterial color={SC.rail} {...CLOTH} />
      </mesh>
      {/* holo sight with the red lens */}
      <mesh position={[0, 0.13, 0.05]}>
        <boxGeometry args={[0.045, 0.05, 0.09]} />
        <meshStandardMaterial color={SC.helmet} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.13, 0.1]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.016, 0.016, 0.012, 8]} />
        <meshStandardMaterial color={SC.redDeep} roughness={0.3} />
      </mesh>
      {/* barrel + ridged suppressor */}
      <mesh position={[0, 0.05, 0.4]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.02, 0.02, 0.16, 10]} />
        <meshStandardMaterial color={SC.rail} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.05, 0.54]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.034, 0.034, 0.16, 12]} />
        <meshStandardMaterial color={SC.gunHi} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.05, 0.54]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.036, 0.036, 0.02, 12]} />
        <meshStandardMaterial color={SC.gunShade} {...CLOTH} />
      </mesh>
      {/* curved magazine + angled foregrip below the receiver */}
      <mesh position={[0, -0.05, 0.18]} rotation-x={0.25}>
        <boxGeometry args={[0.04, 0.16, 0.05]} />
        <meshStandardMaterial color={SC.gripDark} {...CLOTH} />
      </mesh>
      <mesh position={[0, -0.02, 0.3]} rotation-x={-0.3}>
        <boxGeometry args={[0.035, 0.09, 0.04]} />
        <meshStandardMaterial color={SC.gripDark} {...CLOTH} />
      </mesh>
      {/* collapsed stock */}
      <mesh position={[0, 0.04, -0.12]}>
        <boxGeometry args={[0.03, 0.03, 0.16]} />
        <meshStandardMaterial color={SC.rail} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.03, -0.2]}>
        <boxGeometry args={[0.035, 0.07, 0.03]} />
        <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
      </mesh>
    </group>
  )
}

/** The flashbang canister in hand-local coords: gripped through the fist —
 * the gunmetal body centred on the hand (poking out below with the red base
 * band), fuse head + pull ring just above, the whole thing proud of the
 * forearm on +z so it never hides inside the arm cylinder. */
function Flashbang() {
  return (
    <group position={[0, -0.02, 0.055]}>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.19, 12]} />
        <meshStandardMaterial color={SC.gunHi} {...STEEL} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.053, 0.053, 0.04, 12]} />
        <meshStandardMaterial color={SC.red} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.04, 0.035, 0.04]} />
        <meshStandardMaterial color={SC.mount} {...CLOTH} />
      </mesh>
      <mesh position={[0.042, 0.1, 0]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.026, 0.007, 6, 10]} />
        <meshStandardMaterial color={SC.ring} {...STEEL} />
      </mesh>
    </group>
  )
}

export default function ScarModel3D({
  action,
  aimRef,
}: {
  action?: string
  /** When set (in-game soldier mode), overrides `action`: live SMG elevation
   * + a one-shot fire pose (recoil + muzzle flash) driven by the ref. */
  aimRef?: RefObject<AimPose | null>
}) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const canisterRef = useRef<Group>(null)
  const burstRef = useRef<Group>(null)
  const muzzleRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the breach always opens on the windback
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const canister = canisterRef.current
    const burstG = burstRef.current
    const muzzle = muzzleRef.current
    if (!armL || !armR || !elbowL || !elbowR || !canister || !burstG || !muzzle) return

    // Per-action pose; every mutable written every frame (self-correcting).
    const aim = aimRef?.current
    let shXL = 0
    let elbR = R_ELBOW
    let sway = 0
    let armRPitch = 0
    let canisterOn = true
    let burstOn = false
    let muzzleOn = false

    if (aim) {
      // In-game soldier: live SMG elevation toward the drone + a one-shot fire
      // pose (recoil + muzzle flash) from `fire`. No flashbang throw here.
      armRPitch = -Math.max(AIM_PITCH_MIN, Math.min(AIM_PITCH_MAX, aim.pitch))
      const f = aim.fire
      if (f > 0) {
        elbR = R_ELBOW + KICK_AMP * f // recoil kick, strongest at the shot
        muzzleOn = f > 0.5 // muzzle flash right after the trigger
      }
    } else if (action === 'breach') {
      const tau = (t - t0Ref.current) % BREACH_T
      // toss: wind back, hurl overhead-forward, settle home
      if (tau < WIND_END) shXL = lerp(0, WIND_SHX, smooth(tau / WIND_END))
      else if (tau < RELEASE) shXL = lerp(WIND_SHX, THROW_SHX, smooth((tau - WIND_END) / (RELEASE - WIND_END)))
      else if (tau < ARM_HOME) shXL = lerp(THROW_SHX, 0, smooth((tau - RELEASE) / (ARM_HOME - RELEASE)))
      canisterOn = tau < RELEASE
      burstOn = tau >= BURST_ON && tau < BURST_OFF
      // covering fire: three recoil pulses with muzzle-flash windows
      for (const s of SHOTS) {
        const dt = tau - s
        if (dt >= 0 && dt < KICK_T) elbR = R_ELBOW + KICK_AMP * Math.sin((Math.PI * dt) / KICK_T)
        if (dt >= 0 && dt < FLASH_T) muzzleOn = true
      }
    } else if (action === 'sight') {
      // Shoulder the SMG, sweep-track and fire controlled bursts (no throw).
      const tau = (t - t0Ref.current) % SIGHT_T
      armRPitch = -0.3 - 0.18 * Math.sin(tau * 1.4)
      for (const s of SIGHT_SHOTS) {
        const dt = tau - s
        if (dt >= 0 && dt < KICK_T) elbR = R_ELBOW + KICK_AMP * Math.sin((Math.PI * dt) / KICK_T)
        if (dt >= 0 && dt < FLASH_T) muzzleOn = true
      }
    } else {
      sway = Math.sin(t * 1.7) * 0.04 // idle: both arms breathe together
    }

    armR.rotation.z = R_SHZ + sway
    armR.rotation.y = R_SHY
    armR.rotation.x = armRPitch
    armL.rotation.z = -(L_SHZ + sway)
    armL.rotation.y = -L_SHY
    armL.rotation.x = shXL
    elbowR.rotation.x = elbR
    elbowL.rotation.x = L_ELBOW
    canister.visible = canisterOn
    burstG.visible = burstOn
    muzzle.visible = muzzleOn
  })

  return (
    <group>
      {/* dark tactical legs with knee-pad slabs, darkest boots */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={SC.legs} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={SC.legs} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.24, 0.14]}>
        <boxGeometry args={[0.16, 0.14, 0.03]} />
        <meshStandardMaterial color={SC.pad} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.24, 0.14]}>
        <boxGeometry args={[0.16, 0.14, 0.03]} />
        <meshStandardMaterial color={SC.pad} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={SC.strap} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={SC.strap} {...CLOTH} />
      </mesh>
      {/* belt with the steel buckle */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={SC.vestShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.17]}>
        <boxGeometry args={[0.1, 0.08, 0.02]} />
        <meshStandardMaterial color="#252a33" {...STEEL} />
      </mesh>
      {/* vest torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={SC.vest} {...CLOTH} flatShading />
      </mesh>
      {/* SPECIAL patch slab + three mag pouches on the chest */}
      <mesh position={[0, 1.08, 0.24]}>
        <boxGeometry args={[0.2, 0.05, 0.02]} />
        <meshStandardMaterial color={SC.gunShade} {...CLOTH} />
      </mesh>
      <mesh position={[-0.11, 0.82, 0.28]}>
        <boxGeometry args={[0.08, 0.16, 0.06]} />
        <meshStandardMaterial color={SC.pouch} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.82, 0.29]}>
        <boxGeometry args={[0.08, 0.16, 0.06]} />
        <meshStandardMaterial color={SC.pouch} {...CLOTH} />
      </mesh>
      <mesh position={[0.11, 0.82, 0.28]}>
        <boxGeometry args={[0.08, 0.16, 0.06]} />
        <meshStandardMaterial color={SC.pouch} {...CLOTH} />
      </mesh>
      {/* MOLLE strap lines across the upper chest */}
      <mesh position={[0, 0.98, 0.265]}>
        <boxGeometry args={[0.34, 0.012, 0.01]} />
        <meshStandardMaterial color={SC.strap} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.02, 0.26]}>
        <boxGeometry args={[0.36, 0.012, 0.01]} />
        <meshStandardMaterial color={SC.strap} {...CLOTH} />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Sleeve-dark arms, gloved fists; SMG right, flashbang left. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={SC.vestHi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color="#1c2026" {...CLOTH} />
          </mesh>
          {/* the flashbang standing out of the fist */}
          <group ref={canisterRef} position={[0, -0.26, 0]}>
            <Flashbang />
          </group>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={SC.vestHi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={SC.sleeve} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color="#1c2026" {...CLOTH} />
          </mesh>
          {/* the SMG in the fist; barrel ⊥ forearm (pistol grip) */}
          <group position={[0, -0.26, 0]}>
            <SuppressedSMG />
            <group ref={muzzleRef} position={[0, 0.05, 0.68]} visible={false}>
              <FlashBurst scale={0.9} />
            </group>
          </group>
        </group>
      </group>
      {/* the flashbang detonation, up-forward-left of the figure */}
      <group ref={burstRef} position={[-0.55, 1.75, 0.85]} visible={false}>
        <FlashBurst scale={1.6} />
      </group>
      {/* neck + tan head with stubble, scowl, brows, eyes and the scars */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={SC.skinDark} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.23, 0.22, 0.32, 14]} />
        <meshStandardMaterial color={SC.skin} {...CLOTH} />
      </mesh>
      {/* stubble wrap on the lower face */}
      <mesh position={[0, 1.34, 0]}>
        <cylinderGeometry args={[0.225, 0.222, 0.09, 14]} />
        <meshStandardMaterial color="#8a5a38" {...CLOTH} />
      </mesh>
      {/* eyes: whites + dark iris slabs under heavy angled brows */}
      <mesh position={[-0.08, 1.51, 0.215]}>
        <boxGeometry args={[0.07, 0.028, 0.02]} />
        <meshStandardMaterial color={SC.eyeWhite} roughness={0.3} />
      </mesh>
      <mesh position={[0.08, 1.51, 0.215]}>
        <boxGeometry args={[0.07, 0.028, 0.02]} />
        <meshStandardMaterial color={SC.eyeWhite} roughness={0.3} />
      </mesh>
      <mesh position={[-0.08, 1.51, 0.225]}>
        <boxGeometry args={[0.024, 0.024, 0.012]} />
        <meshStandardMaterial color={SC.iris} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.51, 0.225]}>
        <boxGeometry args={[0.024, 0.024, 0.012]} />
        <meshStandardMaterial color={SC.iris} {...CLOTH} />
      </mesh>
      <mesh position={[-0.08, 1.555, 0.22]} rotation-z={-0.22}>
        <boxGeometry args={[0.095, 0.026, 0.018]} />
        <meshStandardMaterial color={SC.brow} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.555, 0.22]} rotation-z={0.22}>
        <boxGeometry args={[0.095, 0.026, 0.018]} />
        <meshStandardMaterial color={SC.brow} {...CLOTH} />
      </mesh>
      {/* nose + grimacing scowl */}
      <mesh position={[0, 1.46, 0.23]}>
        <boxGeometry args={[0.045, 0.09, 0.03]} />
        <meshStandardMaterial color={SC.nose} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.375, 0.222]} rotation-z={0.12}>
        <boxGeometry args={[0.11, 0.018, 0.012]} />
        <meshStandardMaterial color={SC.lineDeep} {...CLOTH} />
      </mesh>
      {/* stitched scar down the right cheek (viewer's right = +x) */}
      <mesh position={[0.135, 1.5, 0.19]} rotation-z={-0.3} rotation-y={0.35}>
        <boxGeometry args={[0.015, 0.16, 0.012]} />
        <meshStandardMaterial color={SC.scar} roughness={0.4} />
      </mesh>
      <mesh position={[0.15, 1.42, 0.175]} rotation-z={-0.1} rotation-y={0.35}>
        <boxGeometry args={[0.014, 0.09, 0.012]} />
        <meshStandardMaterial color={SC.scar} roughness={0.4} />
      </mesh>
      <mesh position={[0.14, 1.52, 0.195]} rotation-y={0.35}>
        <boxGeometry args={[0.045, 0.01, 0.013]} />
        <meshStandardMaterial color={SC.stitch} {...CLOTH} />
      </mesh>
      <mesh position={[0.145, 1.46, 0.185]} rotation-y={0.35}>
        <boxGeometry args={[0.045, 0.01, 0.013]} />
        <meshStandardMaterial color={SC.stitch} {...CLOTH} />
      </mesh>
      {/* slash scar on the left cheek */}
      <mesh position={[-0.14, 1.42, 0.18]} rotation-z={0.5} rotation-y={-0.35}>
        <boxGeometry args={[0.09, 0.013, 0.012]} />
        <meshStandardMaterial color={SC.scar} roughness={0.4} />
      </mesh>
      {/* helmet: 8-seg shell + dome cap, rim band, NVG mount, earmuffs, mic */}
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.27, 0.25, 0.14, 8]} />
        <meshStandardMaterial color={SC.helmet} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.735, 0]}>
        <coneGeometry args={[0.28, 0.09, 8]} />
        <meshStandardMaterial color={SC.helmet} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.265, 0.265, 0.045, 14]} />
        <meshStandardMaterial color={SC.helmetRim} {...CLOTH} />
      </mesh>
      {/* NVG mount bracket + lens on the front */}
      <mesh position={[0, 1.68, 0.24]}>
        <boxGeometry args={[0.11, 0.11, 0.06]} />
        <meshStandardMaterial color={SC.mount} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.68, 0.275]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.025, 0.025, 0.02, 10]} />
        <meshStandardMaterial color={SC.lens} {...STEEL} />
      </mesh>
      {/* comms earmuffs + the mic boom curving to the mouth */}
      <mesh position={[-0.23, 1.48, 0]}>
        <boxGeometry args={[0.05, 0.12, 0.1]} />
        <meshStandardMaterial color={SC.pad} {...CLOTH} />
      </mesh>
      <mesh position={[0.23, 1.48, 0]}>
        <boxGeometry args={[0.05, 0.12, 0.1]} />
        <meshStandardMaterial color={SC.pad} {...CLOTH} />
      </mesh>
      <mesh position={[0.17, 1.41, 0.13]} rotation-z={0.5} rotation-y={0.5}>
        <boxGeometry args={[0.02, 0.02, 0.18]} />
        <meshStandardMaterial color={SC.padEdge} {...CLOTH} />
      </mesh>
      <mesh position={[0.06, 1.38, 0.22]}>
        <boxGeometry args={[0.045, 0.03, 0.03]} />
        <meshStandardMaterial color={SC.rail} {...CLOTH} />
      </mesh>
    </group>
  )
}
