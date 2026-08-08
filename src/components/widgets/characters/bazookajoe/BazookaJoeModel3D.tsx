// Bazooka Joe's mesh-level 3D model: the 2D BazookaFigure's black cap with
// forward visor over the sunglasses band and cocky smirk, dark tactical vest
// with chest-pocket slabs + silver buckles, cargo legs — and the RPG
// shouldered in the RIGHT fist: black rear cone + tube, white ridged mid
// cylinder, and the TRANSLUCENT red warhead (transparent material, the
// source art's flagged fix) pointing up-forward. LEFT arm rests. Rebuilt
// from three.js primitives. Venue-neutral (no spin, no stage — the
// FigureStage3D turntable or a game world drives its heading): faces +Z,
// feet at y=0, ~1.85 units tall, same skeleton as ToyModel3D so shared
// scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'launch': the 2D celebration on the same ~2.6 s loop — the firing
//   elbow takes one sharp recoil pulse with an orange backblast `visible`
//   window at the rear opening; the warhead group goes `visible` OFF at
//   the shot (back ON when the loop wraps) and a big emissive fireball
//   pops at a far up-forward offset where it detonates.
// - 'aim' (Take Aim): a longer ~4.2 s deliberate arc, visually distinct
//   from 'launch' — the figure KNEELS onto the launcher-side knee (body
//   drops, rear leg folds under, front leg extends, left fist braced on
//   the knee) while the arm hoists the tube onto the shoulder with a
//   NATURAL grip — forearm up so the elbow sits BELOW the raised fist,
//   the tube counter-rotated level in the hand — tracks with elevation +
//   yaw sweeps that settle before the trigger, fires ONCE, then stands
//   back into the carry as the loop wraps.
// Grip note: the launcher is a PISTOL grip like the imperium claw — the
// tube rides PERPENDICULAR to the forearm (local +z of the elbow group),
// so the elbow's x-rotation aims it; the deep elbow bend shoulders the
// tube with the warhead up-forward.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from bazookajoe/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { BJ } from './bazookaJoePalette'
import type { AimPose } from '../shared/aimPose'

/** How far pitch can raise/lower the launcher (radians). */
const AIM_PITCH_MIN = -0.3
const AIM_PITCH_MAX = 0.9

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Pose + launch-timeline targets (loop matches the 2D's 2.6 s). */
const R_SHZ = 0.15
const R_SHY = 0.3 // outward yaw (#61) so the shouldered tube reads face-on
const R_ELBOW = -1.35 // deep bend: the perpendicular tube points up-forward
const L_SHZ = 0.15
const L_SHY = 0.2
const L_ELBOW = -0.25 // resting arm
const LAUNCH_T = 2.6
const FIRE = 0.3 // the shot
const KICK_T = 0.28
const KICK_AMP = 0.34
const BLAST_OFF = 0.5 // backblast window: [FIRE, BLAST_OFF]
const BOOM_ON = 0.85 // fireball window
const BOOM_OFF = 1.15
/** 'aim' (Take Aim) — a longer, deliberate arc, distinct from the quick
 * 'launch': kneel while hoisting the tube onto the shoulder with the
 * natural RPG grip (forearm points UP so the elbow ends BELOW the fist;
 * AIM_WEAPON_ROT counter-rotates the tube in the hand back to level),
 * track with elevation + yaw sweeps, settle, ONE shot, stand back into
 * the carry as the loop wraps. */
const AIM_T = 4.2
const AIM_RAISE = 0.6 // carry → sighting blend done
const AIM_SETTLE = 2.9 // tracking sweeps faded out
const AIM_FIRE = 3.05 // the shot
const AIM_LOWER = 3.6 // sighting → carry blend starts
const AIM_BOOM_ON = 3.45
const AIM_BOOM_OFF = 3.75
const SH_AIM = -0.6 // upper arm forward-down — elbow stays LOW…
const ELB_AIM = -1.6 // …forearm swings UP: fist at shoulder height, elbow below the hand
const AIM_SWEEP_EL = 0.18 // tracking elevation sweep
const AIM_SWEEP_YAW = 0.14 // tracking yaw sweep
const AIM_YAW = 0.08 // arm tucked in while sighting — tube hugs the neck/shoulder
/** Kneel (one-knee firing stance) — follows the same raise/lower blend:
 * the body drops while the launcher-side leg folds back under it (shin on
 * the ground) and the other leg extends forward; the left arm braces on
 * the raised front knee. */
const KNEEL_DROP = 0.32
const KNEEL_REAR = 1.45 // rear (launcher-side) leg folded back
const KNEEL_FRONT = 1.15 // front leg extended forward
const BRACE_SHX = -0.5 // left arm leans onto the front knee
const BRACE_ELB = -0.4
const WEAPON_LIFT = 0.12 // raises the tube from through-the-cap to resting ON it
const AIM_WEAPON_ROT = 2.05 // counter-rotates the tube in the fist: level despite the raised forearm

/** Emissive fireball burst (orange core + crossed spikes + forward cone so
 * it reads even pointing at the camera); parent toggles `visible`. */
function FireBurst({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color={BJ.fireCore} emissive={BJ.fire} emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.028, 0.26, 0.028]} />
        <meshStandardMaterial color={BJ.fire} emissive={BJ.fire} emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.26, 0.028, 0.028]} />
        <meshStandardMaterial color={BJ.fire} emissive={BJ.fire} emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.08]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.055, 0.18, 8]} />
        <meshStandardMaterial color={BJ.fireCore} emissive={BJ.fire} emissiveIntensity={1.3} roughness={0.2} />
      </mesh>
    </group>
  )
}

export default function BazookaJoeModel3D({
  action,
  aimRef,
}: {
  action?: string
  /** When set (in-game soldier mode), overrides `action`: live launcher
   * elevation + a one-shot launch pose driven by the ref, no re-renders. */
  aimRef?: RefObject<AimPose | null>
}) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const legLRef = useRef<Group>(null)
  const legRRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)
  const weaponRef = useRef<Group>(null)
  const warheadRef = useRef<Group>(null)
  const blastRef = useRef<Group>(null)
  const boomRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the loop always opens loaded, shot at FIRE
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    const body = bodyRef.current
    const weapon = weaponRef.current
    const warhead = warheadRef.current
    const blast = blastRef.current
    const boomG = boomRef.current
    if (!armL || !armR || !elbowL || !elbowR || !legL || !legR || !body || !weapon || !warhead || !blast || !boomG) return

    // Per-action pose; every mutable written every frame (self-correcting).
    const aim = aimRef?.current
    let elbR = R_ELBOW
    let sway = 0
    let armRPitch = 0
    let armRYaw = R_SHY
    let kneelK = 0
    let warheadOn = true
    let blastOn = false
    let boomOn = false

    if (aim) {
      // In-game soldier: live launcher elevation toward the drone + a one-shot
      // launch pose from `fire` (no far detonation — the rocket is a real
      // projectile the pool renders and flies at the player).
      armRPitch = -Math.max(AIM_PITCH_MIN, Math.min(AIM_PITCH_MAX, aim.pitch))
      const f = aim.fire
      if (f > 0) {
        elbR = R_ELBOW + KICK_AMP * f // recoil kick, strongest at the shot
        warheadOn = f < 0.6 // warhead gone as the rocket leaves the tube
        blastOn = f > 0.5 // backblast flares at the muzzle
      }
    } else if (action === 'launch') {
      // the 2D celebration: a quick fire-and-boom from the shoulder carry
      const tau = (t - t0Ref.current) % LAUNCH_T
      const dt = tau - FIRE
      if (dt >= 0 && dt < KICK_T) elbR = R_ELBOW + KICK_AMP * Math.sin((Math.PI * dt) / KICK_T)
      warheadOn = tau < FIRE
      blastOn = tau >= FIRE && tau < BLAST_OFF
      boomOn = tau >= BOOM_ON && tau < BOOM_OFF
    } else if (action === 'aim') {
      // Take Aim: kneel onto one knee while raising the launcher OVER the
      // shoulder, track (elevation + yaw sweeps that settle before the
      // trigger), ONE shot, then stand back into the carry.
      const tau = (t - t0Ref.current) % AIM_T
      let elbBase = R_ELBOW
      if (tau < AIM_RAISE) {
        kneelK = smooth(tau / AIM_RAISE)
        armRPitch = lerp(0, SH_AIM, kneelK)
        elbBase = lerp(R_ELBOW, ELB_AIM, kneelK)
      } else if (tau < AIM_LOWER) {
        kneelK = 1
        armRPitch = SH_AIM
        elbBase = ELB_AIM
        const amp =
          smooth(Math.min((tau - AIM_RAISE) / 0.3, 1)) * smooth(Math.min((AIM_SETTLE - tau) / 0.4, 1))
        armRPitch += AIM_SWEEP_EL * Math.sin((tau - AIM_RAISE) * 2.2) * amp
        armRYaw = AIM_YAW + AIM_SWEEP_YAW * Math.sin((tau - AIM_RAISE) * 1.5) * amp
      } else {
        const k = smooth((tau - AIM_LOWER) / (AIM_T - AIM_LOWER))
        kneelK = 1 - k
        armRPitch = lerp(SH_AIM, 0, k)
        elbBase = lerp(ELB_AIM, R_ELBOW, k)
        armRYaw = lerp(AIM_YAW, R_SHY, k)
      }
      if (tau < AIM_RAISE) armRYaw = lerp(R_SHY, AIM_YAW, kneelK)
      const dt = tau - AIM_FIRE
      elbR = elbBase + (dt >= 0 && dt < KICK_T ? KICK_AMP * Math.sin((Math.PI * dt) / KICK_T) : 0)
      warheadOn = tau < AIM_FIRE
      blastOn = tau >= AIM_FIRE && tau < AIM_FIRE + 0.2
      boomOn = tau >= AIM_BOOM_ON && tau < AIM_BOOM_OFF
    } else {
      sway = Math.sin(t * 1.7) * 0.04 // idle: both arms breathe together
    }

    armR.rotation.z = R_SHZ + sway
    armR.rotation.y = armRYaw
    armR.rotation.x = armRPitch
    armL.rotation.z = -(L_SHZ + sway)
    armL.rotation.y = -L_SHY
    armL.rotation.x = BRACE_SHX * kneelK // brace on the front knee while kneeling
    elbowR.rotation.x = elbR
    elbowL.rotation.x = L_ELBOW + (BRACE_ELB - L_ELBOW) * kneelK
    body.position.y = -KNEEL_DROP * kneelK
    weapon.position.y = -0.26 + WEAPON_LIFT * kneelK // tube up onto the shoulder cap
    weapon.rotation.x = AIM_WEAPON_ROT * kneelK // …and level despite the up-swung forearm
    legR.rotation.x = KNEEL_REAR * kneelK // launcher-side shin folds under
    legL.rotation.x = -KNEEL_FRONT * kneelK // front leg extends ahead
    warhead.visible = warheadOn
    blast.visible = blastOn
    boomG.visible = boomOn
  })

  return (
    <group>
      {/* cargo legs with pocket slabs, dark boots — each on a hip pivot so
       * the Take Aim kneel can fold the rear leg under and extend the front */}
      <group ref={legLRef} position={[-0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={BJ.legs} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.12, 0.14]}>
          <boxGeometry args={[0.15, 0.1, 0.02]} />
          <meshStandardMaterial color={BJ.hip} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={BJ.boot} {...CLOTH} />
        </mesh>
      </group>
      <group ref={legRRef} position={[0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={BJ.legs} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.12, 0.14]}>
          <boxGeometry args={[0.15, 0.1, 0.02]} />
          <meshStandardMaterial color={BJ.hip} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={BJ.boot} {...CLOTH} />
        </mesh>
      </group>
      {/* everything above the legs drops together during the kneel */}
      <group ref={bodyRef}>
      {/* waist with the silver buckle */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={BJ.hip} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.17]}>
        <boxGeometry args={[0.09, 0.06, 0.02]} />
        <meshStandardMaterial color={BJ.silver} {...STEEL} />
      </mesh>
      {/* vest torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={BJ.vest} {...CLOTH} flatShading />
      </mesh>
      {/* chest pockets + pouch row + harness straps with silver buckles */}
      <mesh position={[-0.1, 1.05, 0.245]}>
        <boxGeometry args={[0.13, 0.1, 0.03]} />
        <meshStandardMaterial color={BJ.pocket} {...CLOTH} />
      </mesh>
      <mesh position={[0.1, 1.05, 0.245]}>
        <boxGeometry args={[0.13, 0.1, 0.03]} />
        <meshStandardMaterial color={BJ.pocket} {...CLOTH} />
      </mesh>
      <mesh position={[-0.11, 0.85, 0.27]}>
        <boxGeometry args={[0.09, 0.14, 0.05]} />
        <meshStandardMaterial color={BJ.pouch} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.85, 0.28]}>
        <boxGeometry args={[0.09, 0.14, 0.05]} />
        <meshStandardMaterial color={BJ.pouch} {...CLOTH} />
      </mesh>
      <mesh position={[0.11, 0.85, 0.27]}>
        <boxGeometry args={[0.09, 0.14, 0.05]} />
        <meshStandardMaterial color={BJ.pouch} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.7, 0.3]}>
        <boxGeometry args={[0.4, 0.05, 0.02]} />
        <meshStandardMaterial color={BJ.harness} {...CLOTH} />
      </mesh>
      <mesh position={[-0.08, 0.7, 0.315]}>
        <boxGeometry args={[0.04, 0.06, 0.01]} />
        <meshStandardMaterial color={BJ.silver} {...STEEL} />
      </mesh>
      <mesh position={[0.08, 0.7, 0.315]}>
        <boxGeometry args={[0.04, 0.06, 0.01]} />
        <meshStandardMaterial color={BJ.silver} {...STEEL} />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Vest-dark sleeves, skin hands; the RPG in the right fist. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={BJ.vest} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={BJ.skinShade} {...CLOTH} />
          </mesh>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={BJ.vest} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={BJ.vestBase} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={BJ.skinShade} {...CLOTH} />
          </mesh>
          {/* the RPG in the fist; tube ⊥ forearm (pistol grip) — rear cone
           * back past the wrist, white mid ahead, warhead at the front.
           * Lifted slightly while aiming so the tube RESTS on the shoulder
           * cap (the arm chain alone can't reach that high). */}
          <group ref={weaponRef} position={[0, -0.26, 0]}>
            {/* grip block over the fist */}
            <mesh position={[0, 0, -0.02]}>
              <boxGeometry args={[0.04, 0.08, 0.05]} />
              <meshStandardMaterial color={BJ.harness} {...CLOTH} />
            </mesh>
            {/* rear cone + opening (backblast end, −z) */}
            <mesh position={[0, 0.05, -0.24]} rotation-x={-Math.PI / 2}>
              <cylinderGeometry args={[0.055, 0.038, 0.14, 12]} />
              <meshStandardMaterial color={BJ.plastic} {...CLOTH} />
            </mesh>
            <mesh position={[0, 0.05, -0.31]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.056, 0.056, 0.02, 12]} />
              <meshStandardMaterial color={BJ.plasticShade} {...CLOTH} />
            </mesh>
            {/* black tube over the shoulder */}
            <mesh position={[0, 0.05, -0.03]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.038, 0.038, 0.3, 12]} />
              <meshStandardMaterial color={BJ.plastic} {...CLOTH} />
            </mesh>
            {/* white ridged mid section */}
            <mesh position={[0, 0.05, 0.24]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.045, 0.045, 0.26, 12]} />
              <meshStandardMaterial color={BJ.white} {...STEEL} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.05, 0.16]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.048, 0.048, 0.02, 12]} />
              <meshStandardMaterial color={BJ.silver} {...STEEL} />
            </mesh>
            <mesh position={[0, 0.05, 0.32]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.048, 0.048, 0.02, 12]} />
              <meshStandardMaterial color={BJ.silver} {...STEEL} />
            </mesh>
            {/* TRANSLUCENT red warhead — hides during flight */}
            <group ref={warheadRef} position={[0, 0.05, 0.37]}>
              <mesh position={[0, 0, 0.02]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.05, 0.05, 0.05, 12]} />
                <meshStandardMaterial color={BJ.red} transparent opacity={0.65} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0, 0.13]} rotation-x={Math.PI / 2}>
                <coneGeometry args={[0.05, 0.18, 12]} />
                <meshStandardMaterial color={BJ.red} transparent opacity={0.65} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0, 0.23]}>
                <sphereGeometry args={[0.02, 8, 6]} />
                <meshStandardMaterial color={BJ.redGlow} transparent opacity={0.8} roughness={0.2} />
              </mesh>
            </group>
            {/* backblast at the rear opening */}
            <group ref={blastRef} position={[0, 0.05, -0.4]} visible={false}>
              <FireBurst scale={0.9} />
            </group>
          </group>
        </group>
      </group>
      {/* neck + minifig head with the smirk */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={BJ.skinShade} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.32, 14]} />
        <meshStandardMaterial color={BJ.skin} {...CLOTH} />
      </mesh>
      {/* sunglasses: dark band wrap + lens slabs with white glints + bridge */}
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.075, 14]} />
        <meshStandardMaterial color={BJ.lens} {...CLOTH} />
      </mesh>
      <mesh position={[-0.08, 1.52, 0.225]}>
        <boxGeometry args={[0.09, 0.06, 0.025]} />
        <meshStandardMaterial color={BJ.lens} roughness={0.25} />
      </mesh>
      <mesh position={[0.08, 1.52, 0.225]}>
        <boxGeometry args={[0.09, 0.06, 0.025]} />
        <meshStandardMaterial color={BJ.lens} roughness={0.25} />
      </mesh>
      <mesh position={[-0.1, 1.535, 0.24]} rotation-z={-0.3}>
        <boxGeometry args={[0.04, 0.012, 0.01]} />
        <meshStandardMaterial color="#8a9099" roughness={0.2} />
      </mesh>
      <mesh position={[0.06, 1.535, 0.24]} rotation-z={-0.3}>
        <boxGeometry args={[0.04, 0.012, 0.01]} />
        <meshStandardMaterial color="#8a9099" roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.52, 0.235]}>
        <boxGeometry args={[0.03, 0.015, 0.01]} />
        <meshStandardMaterial color={BJ.plasticHi} {...CLOTH} />
      </mesh>
      {/* cocky smirk: a short slab canted up to one side + hook */}
      <mesh position={[0.01, 1.375, 0.222]} rotation-z={0.18}>
        <boxGeometry args={[0.1, 0.016, 0.012]} />
        <meshStandardMaterial color={BJ.smirk} {...CLOTH} />
      </mesh>
      <mesh position={[0.075, 1.39, 0.222]} rotation-z={0.7}>
        <boxGeometry args={[0.035, 0.014, 0.012]} />
        <meshStandardMaterial color={BJ.smirk} {...CLOTH} />
      </mesh>
      {/* black cap: band, domed crown, forward visor */}
      <mesh position={[0, 1.62, 0]}>
        <cylinderGeometry args={[0.245, 0.245, 0.08, 14]} />
        <meshStandardMaterial color={BJ.capBand} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.22, 0.245, 0.1, 8]} />
        <meshStandardMaterial color={BJ.plastic} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <coneGeometry args={[0.22, 0.08, 8]} />
        <meshStandardMaterial color={BJ.plastic} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.6, 0.3]} rotation-x={0.12}>
        <boxGeometry args={[0.34, 0.03, 0.18]} />
        <meshStandardMaterial color={BJ.visor} {...CLOTH} />
      </mesh>
      </group>
      {/* the rocket's detonation, far up-forward of the figure —
       * world-fixed, so it stays put while the body kneels */}
      <group ref={boomRef} position={[0.4, 1.65, 1.0]} visible={false}>
        <FireBurst scale={2.2} />
      </group>
    </group>
  )
}
