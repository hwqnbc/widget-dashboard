// Jet Trooper's mesh-level 3D model: the 2D JetBlastFigure's tan-fatigues
// soldier — brown vest slabs over a grey undershirt wedge, pouches, belt
// with silver buckle, peach minifig face under the brown cap + tan visor
// band, white headset earguards with dark speaker discs, chunky brown
// boots — wearing the twin-tank JETPACK (pack box + flanking fuel tanks +
// hip thruster housings with cyan exhaust cones) and gripping the beam
// weapon with the big red concentric-lens dish in the RIGHT fist. Rebuilt
// from three.js primitives. Venue-neutral (no spin, no stage — the
// FigureStage3D turntable or a game world drives its heading): faces +Z,
// feet at y=0, ~1.85 units tall, same skeleton as ToyModel3D so shared
// scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'jet' (Jet & Blast): the 2D celebration's ~2.6 s loop — a `liftRef`
//   group raises the WHOLE figure off the ground (rise → hover bob →
//   settle) while the cyan exhaust cones go `visible` with a flicker
//   scale, the legs trail, and the weapon arm levels to fire TWO red
//   FlashBurst windows at the lens (forward cone so the burst reads
//   face-on — the Gold Gunner lesson) with elbow recoil kicks.
// - 'walk': the shared leg-gait rig (hip-pivot swing), jetpack quiet.
// Grip note: the beam weapon's receiver/barrel/dish axis lies PARALLEL to
// the forearm (the mount rotates weapon-local +z onto the forearm's own
// axis, grip vertical in the fist) — with the elbow at -π/2 the forearm is
// level with the ground and the dish aims straight ahead; the elbow's
// x-rotation still aims it.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from jettrooper/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { JT } from './jetTrooperPalette'
import { GAIT_RATE, WALK_ACTION_SPEED, legGait } from '../shared/legGait'
import type { LegSwing } from '../shared/legGait'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Rest pose + Jet & Blast timeline (loop matches the 2D's 2.6 s). */
const R_SHZ = 0.15
const R_SHY = 0.35 // outward yaw (#61) so the big dish clears the body
const R_ELBOW = -Math.PI / 2 // carry: forearm LEVEL with the ground, aiming ahead
const L_SHZ = 0.15
const L_SHY = 0.2
const L_ELBOW = -0.25
const JET_T = 2.6
const RISE_DONE = 0.55 // airborne
const SETTLE_AT = 2.1 // descent starts
const LIFT_Y = 0.38 // hover height
const AIM_ELBOW = -1.75 // hover shot lifts the muzzle a touch above level
const FIRE_1 = 0.95 // the two shots
const FIRE_2 = 1.55
const FIRE_LEN = 0.16
const KICK_AMP = 0.18
const LEG_TRAIL = 0.16 // legs stream slightly back while airborne

/** Emissive red beam burst at the lens: core + crossed spikes + forward
 * cone so it reads even pointing at the camera; parent toggles `visible`. */
function BeamBurst() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color={JT.lensHi} emissive={JT.lensRed} emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.025, 0.24, 0.025]} />
        <meshStandardMaterial color={JT.lensRed} emissive={JT.lensRed} emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.24, 0.025, 0.025]} />
        <meshStandardMaterial color={JT.lensRed} emissive={JT.lensRed} emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.1]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.05, 0.2, 8]} />
        <meshStandardMaterial color={JT.lensHi} emissive={JT.lensRed} emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
    </group>
  )
}

/** The beam weapon in hand-local coords: fist at the origin, dark receiver
 * over the grip, barrel widening forward (+z) into the big red-lens dish;
 * scope on top. The flash group mounts ahead of the dish. */
function BeamWeapon({ flashRef }: { flashRef: React.RefObject<Group | null> }) {
  return (
    <group>
      {/* grip + receiver */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.045, 0.09, 0.06]} />
        <meshStandardMaterial color={JT.dark} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.06, 0.1]}>
        <boxGeometry args={[0.06, 0.09, 0.34]} />
        <meshStandardMaterial color={JT.pack} {...CLOTH} />
      </mesh>
      {/* top scope */}
      <mesh position={[0, 0.13, 0.02]}>
        <boxGeometry args={[0.035, 0.05, 0.14]} />
        <meshStandardMaterial color={JT.gunMid} {...STEEL} />
      </mesh>
      {/* barrel cone widening into the dish */}
      <mesh position={[0, 0.06, 0.31]} rotation-x={-Math.PI / 2}>
        <cylinderGeometry args={[0.1, 0.05, 0.14, 10]} />
        <meshStandardMaterial color={JT.gunDark} {...CLOTH} />
      </mesh>
      {/* red concentric lens dish */}
      <mesh position={[0, 0.06, 0.4]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.16, 0.13, 0.07, 14]} />
        <meshStandardMaterial color={JT.gunDark} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.06, 0.44]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.13, 0.13, 0.015, 14]} />
        <meshStandardMaterial color={JT.lensMid} emissive={JT.lensDeep} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0.452]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.012, 12]} />
        <meshStandardMaterial color={JT.lensRed} emissive={JT.lensMid} emissiveIntensity={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0.462]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.035, 0.01, 10]} />
        <meshStandardMaterial color={JT.lensHi} emissive={JT.lensRed} emissiveIntensity={1} roughness={0.25} />
      </mesh>
      {/* beam burst window (ref-toggled) */}
      <group ref={flashRef} position={[0, 0.06, 0.56]} visible={false}>
        <BeamBurst />
      </group>
    </group>
  )
}

export default function JetTrooperModel3D({ action }: { action?: string }) {
  const liftRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const legLRef = useRef<Group>(null)
  const legRRef = useRef<Group>(null)
  const exhaustLRef = useRef<Group>(null)
  const exhaustRRef = useRef<Group>(null)
  const flashRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)
  const walkPhaseRef = useRef(0)
  const gaitRef = useRef<LegSwing>({ left: 0, right: 0 }).current

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the jet always opens grounded
    }
    const lift = liftRef.current
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    const exL = exhaustLRef.current
    const exR = exhaustRRef.current
    const flash = flashRef.current
    if (!lift || !armL || !armR || !elbowL || !elbowR || !legL || !legR || !exL || !exR || !flash) return

    // Per-action pose; every mutable written every frame (self-correcting).
    let liftY = 0
    let elbR = R_ELBOW
    let swayR = 0
    let legTrail = 0
    let jetOn = false
    let firing = false
    let gaitL = 0
    let gaitR = 0

    if (action === 'jet') {
      const tau = (t - t0Ref.current) % JET_T
      let airK: number
      if (tau < RISE_DONE) airK = smooth(tau / RISE_DONE)
      else if (tau < SETTLE_AT) airK = 1
      else airK = 1 - smooth((tau - SETTLE_AT) / (JET_T - SETTLE_AT))
      liftY = LIFT_Y * airK + (airK > 0.95 ? Math.sin(t * 6) * 0.02 : 0)
      jetOn = airK > 0.05
      legTrail = LEG_TRAIL * airK
      elbR = lerp(R_ELBOW, AIM_ELBOW, airK)
      const sinceFire = tau >= FIRE_2 ? tau - FIRE_2 : tau - FIRE_1
      firing = airK > 0.9 && sinceFire >= 0 && sinceFire < FIRE_LEN
      if (sinceFire >= 0 && sinceFire < 0.24) elbR += KICK_AMP * Math.sin((Math.PI * sinceFire) / 0.24) // recoil
    } else if (action === 'walk') {
      walkPhaseRef.current += WALK_ACTION_SPEED * delta * GAIT_RATE
      const g = legGait(walkPhaseRef.current, WALK_ACTION_SPEED, gaitRef)
      gaitL = g.left
      gaitR = g.right
    } else {
      swayR = Math.sin(t * 1.7) * 0.04 // idle: the weapon arm breathes
    }

    lift.position.y = liftY
    armR.rotation.z = R_SHZ + swayR
    armR.rotation.y = R_SHY
    armR.rotation.x = 0
    armL.rotation.z = L_SHZ
    armL.rotation.y = -L_SHY
    armL.rotation.x = legTrail * 0.6 // the free arm drifts back a touch airborne
    elbowR.rotation.x = elbR
    elbowL.rotation.x = L_ELBOW
    legL.rotation.x = gaitL + legTrail // gait on the ground, trail in the air
    legR.rotation.x = gaitR + legTrail
    // exhaust: visible + flicker while the jet burns
    exL.visible = jetOn
    exR.visible = jetOn
    const flicker = 1 + Math.sin(t * 40) * 0.22
    exL.scale.set(1, flicker, 1)
    exR.scale.set(1, 1 + Math.sin(t * 40 + 1.7) * 0.22, 1)
    flash.visible = firing
  })

  return (
    <group ref={liftRef}>
      {/* tan legs on hip pivots (shared leg-gait convention) with the seam
       * line and CHUNKY brown boots */}
      <group ref={legLRef} position={[-0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={JT.clothDeep} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.14, 0.135]}>
          <boxGeometry args={[0.14, 0.1, 0.01]} />
          <meshStandardMaterial color={JT.seam} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.44, 0.05]}>
          <boxGeometry args={[0.27, 0.12, 0.38]} />
          <meshStandardMaterial color={JT.boot} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.485, 0.05]}>
          <boxGeometry args={[0.28, 0.035, 0.39]} />
          <meshStandardMaterial color={JT.bootSole} {...CLOTH} />
        </mesh>
      </group>
      <group ref={legRRef} position={[0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={JT.clothDeep} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.14, 0.135]}>
          <boxGeometry args={[0.14, 0.1, 0.01]} />
          <meshStandardMaterial color={JT.seam} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.44, 0.05]}>
          <boxGeometry args={[0.27, 0.12, 0.38]} />
          <meshStandardMaterial color={JT.boot} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.485, 0.05]}>
          <boxGeometry args={[0.28, 0.035, 0.39]} />
          <meshStandardMaterial color={JT.bootSole} {...CLOTH} />
        </mesh>
      </group>
      {/* belt waist with the silver buckle */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={JT.belt} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.165]}>
        <boxGeometry args={[0.12, 0.1, 0.012]} />
        <meshStandardMaterial color={JT.silver} {...STEEL} />
      </mesh>
      {/* tan torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={JT.cloth} {...CLOTH} flatShading />
      </mesh>
      {/* grey undershirt wedge at the collar */}
      <mesh position={[0, 1.12, 0.2]}>
        <boxGeometry args={[0.16, 0.12, 0.05]} />
        <meshStandardMaterial color={JT.shirt} {...CLOTH} />
      </mesh>
      {/* brown vest side slabs + pouches + the silver rank badge */}
      <mesh position={[-0.14, 0.95, 0.21]} rotation-z={0.08}>
        <boxGeometry args={[0.16, 0.5, 0.06]} />
        <meshStandardMaterial color={JT.vestDeep} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.95, 0.21]} rotation-z={-0.08}>
        <boxGeometry args={[0.16, 0.5, 0.06]} />
        <meshStandardMaterial color={JT.vestDeep} {...CLOTH} />
      </mesh>
      <mesh position={[-0.15, 0.74, 0.25]}>
        <boxGeometry args={[0.11, 0.11, 0.05]} />
        <meshStandardMaterial color={JT.vest} {...CLOTH} />
      </mesh>
      <mesh position={[0.15, 0.74, 0.25]}>
        <boxGeometry args={[0.11, 0.11, 0.05]} />
        <meshStandardMaterial color={JT.vest} {...CLOTH} />
      </mesh>
      <mesh position={[0.11, 1.06, 0.245]}>
        <boxGeometry args={[0.08, 0.05, 0.012]} />
        <meshStandardMaterial color={JT.silver} {...STEEL} />
      </mesh>
      {/* JETPACK on the back: pack box, flanking fuel tanks, hip thruster
       * housings with the cyan exhaust cones (hidden until the jet burns) */}
      <mesh position={[0, 0.95, -0.24]}>
        <boxGeometry args={[0.34, 0.5, 0.16]} />
        <meshStandardMaterial color={JT.pack} {...CLOTH} />
      </mesh>
      <mesh position={[-0.24, 1.05, -0.26]}>
        <cylinderGeometry args={[0.07, 0.07, 0.36, 10]} />
        <meshStandardMaterial color={JT.tank} {...STEEL} />
      </mesh>
      <mesh position={[0.24, 1.05, -0.26]}>
        <cylinderGeometry args={[0.07, 0.07, 0.36, 10]} />
        <meshStandardMaterial color={JT.tank} {...STEEL} />
      </mesh>
      <mesh position={[-0.24, 1.24, -0.26]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color={JT.tankHi} {...STEEL} />
      </mesh>
      <mesh position={[0.24, 1.24, -0.26]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color={JT.tankHi} {...STEEL} />
      </mesh>
      <mesh position={[-0.24, 0.68, -0.24]}>
        <boxGeometry args={[0.13, 0.16, 0.13]} />
        <meshStandardMaterial color={JT.tank} {...CLOTH} />
      </mesh>
      <mesh position={[0.24, 0.68, -0.24]}>
        <boxGeometry args={[0.13, 0.16, 0.13]} />
        <meshStandardMaterial color={JT.tank} {...CLOTH} />
      </mesh>
      <group ref={exhaustLRef} position={[-0.24, 0.58, -0.24]} visible={false}>
        <mesh position={[0, -0.11, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.06, 0.22, 8]} />
          <meshStandardMaterial color={JT.jetHi} emissive={JT.jetGlow} emissiveIntensity={1.3} roughness={0.2} transparent opacity={0.85} />
        </mesh>
        <mesh position={[0, -0.2, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.03, 0.16, 8]} />
          <meshStandardMaterial color="#ffffff" emissive={JT.jetGlow} emissiveIntensity={1.5} roughness={0.2} transparent opacity={0.9} />
        </mesh>
      </group>
      <group ref={exhaustRRef} position={[0.24, 0.58, -0.24]} visible={false}>
        <mesh position={[0, -0.11, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.06, 0.22, 8]} />
          <meshStandardMaterial color={JT.jetHi} emissive={JT.jetGlow} emissiveIntensity={1.3} roughness={0.2} transparent opacity={0.85} />
        </mesh>
        <mesh position={[0, -0.2, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.03, 0.16, 8]} />
          <meshStandardMaterial color="#ffffff" emissive={JT.jetGlow} emissiveIntensity={1.5} roughness={0.2} transparent opacity={0.9} />
        </mesh>
      </group>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep the joints closed.
       * Tan sleeves, dark-brown fists; the RIGHT fist grips the weapon. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={JT.clothDeep} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={JT.cloth} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={JT.cloth} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={JT.cloth} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={JT.hand} {...CLOTH} />
          </mesh>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={JT.clothDeep} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={JT.cloth} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={JT.cloth} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={JT.cloth} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={JT.hand} {...CLOTH} />
          </mesh>
          {/* the beam weapon in the fist; the +π/2 roll lays the receiver
              PARALLEL to the forearm (dish beyond the fist, scope on top) */}
          <group position={[0, -0.26, 0]} rotation-x={Math.PI / 2}>
            <BeamWeapon flashRef={flashRef} />
          </group>
        </group>
      </group>
      {/* neck + peach head with brows, glossy eyes and the smirk */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={JT.steel} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.47, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.34, 14]} />
        <meshStandardMaterial color={JT.face} {...CLOTH} />
      </mesh>
      <mesh position={[-0.07, 1.5, 0.183]} rotation-z={0.06}>
        <boxGeometry args={[0.035, 0.055, 0.02]} />
        <meshStandardMaterial color="#1a130e" roughness={0.3} />
      </mesh>
      <mesh position={[0.07, 1.5, 0.183]} rotation-z={-0.06}>
        <boxGeometry args={[0.035, 0.055, 0.02]} />
        <meshStandardMaterial color="#1a130e" roughness={0.3} />
      </mesh>
      <mesh position={[-0.07, 1.57, 0.185]} rotation-z={0.25}>
        <boxGeometry args={[0.08, 0.02, 0.015]} />
        <meshStandardMaterial color={JT.faceLine} {...CLOTH} />
      </mesh>
      <mesh position={[0.07, 1.57, 0.185]} rotation-z={-0.25}>
        <boxGeometry args={[0.08, 0.02, 0.015]} />
        <meshStandardMaterial color={JT.faceLine} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.375, 0.185]} rotation-z={0.06}>
        <boxGeometry args={[0.09, 0.016, 0.012]} />
        <meshStandardMaterial color={JT.faceLine} {...CLOTH} />
      </mesh>
      {/* brown cap: dome + tan visor band */}
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={JT.cap} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.635, 0]}>
        <cylinderGeometry args={[0.205, 0.205, 0.05, 14]} />
        <meshStandardMaterial color={JT.capBand} {...CLOTH} />
      </mesh>
      {/* white headset earguards with dark speaker discs */}
      <mesh position={[-0.2, 1.5, 0]}>
        <boxGeometry args={[0.06, 0.26, 0.2]} />
        <meshStandardMaterial color={JT.guard} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.2, 1.5, 0]}>
        <boxGeometry args={[0.06, 0.26, 0.2]} />
        <meshStandardMaterial color={JT.guard} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[-0.235, 1.5, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.065, 0.065, 0.02, 12]} />
        <meshStandardMaterial color={JT.guardDisc} {...CLOTH} />
      </mesh>
      <mesh position={[0.235, 1.5, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.065, 0.065, 0.02, 12]} />
        <meshStandardMaterial color={JT.guardDisc} {...CLOTH} />
      </mesh>
      <mesh position={[-0.248, 1.5, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 0.01, 10]} />
        <meshStandardMaterial color={JT.silver} {...STEEL} />
      </mesh>
      <mesh position={[0.248, 1.5, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.028, 0.028, 0.01, 10]} />
        <meshStandardMaterial color={JT.silver} {...STEEL} />
      </mesh>
    </group>
  )
}
