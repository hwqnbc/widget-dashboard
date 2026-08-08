// Lloyd's mesh-level 3D model: the 2D ChopFigure's dragon-form green ninja —
// lime crowned head (spike cones + gold diamond gem) with the front-only
// black eye mask (yellow serpent eyes) and the green mouth-guard, deep-green
// scale torso with the gold shield emblem + lime scale wedges, gold pauldron
// slabs, lime arms with black fists, gold-trimmed legs with claw-toe boots —
// plus the dragon anatomy from the back-view reference: big lime WINGS
// rooted at the upper back and a thick green TAIL that emerges from the
// lower back and curls down-and-out to a rounded tip. The golden scimitar
// (pommel ring + bell tassel) rides in the RIGHT fist. Rebuilt from three.js
// primitives. Venue-neutral (no spin, no stage — the FigureStage3D turntable
// or a game world drives its heading): faces +Z, feet at y=0, ~1.85 units
// tall, same skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle sway — arms breathe, wings and
// tail slowly stir):
// - 'chop': the 2D celebration on the same 1.7 s beats — the sword arm winds
//   OVERHEAD at the shoulder, holds, whips down through the slash and eases
//   back to the carry, while the wings sweep UP through the wind-up and snap
//   DOWN on the slash (mirrored) and the tail counter-sways.
// - 'walk': the shared leg-gait rig (hip-pivot swing) with a quicker tail wag.
// Grip note: the scimitar is authored along +y and mounted as the forearm's
// obtuse extension (wrist z = π + slight up-tilt). The blade is authored
// thin-x / wide-z with the curve bowing +z, so the cutting edge ALREADY
// leads the sagittal swing — no #64 roll (adding one would re-introduce
// the flat slap the frak lesson fixed).
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from lloyd/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { LL } from './lloydPalette'
import { GAIT_RATE, WALK_ACTION_SPEED, legGait } from '../shared/legGait'
import type { LegSwing } from '../shared/legGait'

const CLOTH = { roughness: 0.7, metalness: 0 }
const GOLD = { roughness: 0.35, metalness: 0.5 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Rest pose + chop timeline (beats match the 2D keyframes' 1.7 s loop). */
const R_SHZ = 0.15
const R_SHY = 0.3 // outward yaw (#61) so the swing plane reads face-on
const R_ELBOW = -1.4 // carry: forearm forward, the blade riding ~45° up
const L_SHZ = 0.15
const L_SHY = 0.2
const L_ELBOW = -0.25
const CHOP_T = 1.7
const RAISE_DONE = 0.51 // 30% — wind-up complete
const RAISE_HOLD = 0.714 // 42% — cocked overhead
const SLASH_DONE = 0.952 // 56% — whipped through
const SLASH_HOLD = 1.224 // 72% — held low
const SH_RAISE = -2.5 // shoulder x overhead
const SH_SLASH = 0.55 // past the rest, blade down-forward
const ELB_RAISE = -0.5 // arm overhead, blade continuing up
const ELB_SLASH = -0.7 // blade thrown forward-down at the slash
/** Wing flap targets (left wing z; right mirrors). */
const WING_UP = 0.5
const WING_DOWN = -0.35

/** The golden scimitar in fist-local coords, authored along +y: pommel ring
 * + bell tassel below the grip, guard above, the curved blade climbing +y
 * and bowing into +z. Mounted flipped (wrist z = π) as the forearm's obtuse
 * extension; the blade is flat in x so the edge leads the swing — already
 * edge-leading as authored, so NO #64 roll on this group. */
function GoldenSword() {
  return (
    <group>
      {/* handle through the fist */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.16, 8]} />
        <meshStandardMaterial color={LL.goldMid} {...GOLD} />
      </mesh>
      {/* pommel ring + hanging bell tassel */}
      <mesh position={[0, -0.1, 0]}>
        <torusGeometry args={[0.045, 0.014, 8, 16]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      <mesh position={[0, -0.19, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.06, 6]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      <mesh position={[0, -0.26, 0]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      {/* guard flare */}
      <mesh position={[0, 0.11, 0]}>
        <boxGeometry args={[0.05, 0.035, 0.13]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      {/* curved blade: a joint-chain of flat segments bowing forward (+z),
          each segment's base buried in the previous one so the blade reads
          continuous — ends meet at (0,0.478,0.036) and (0,0.766,0.129) with
          ~0.02 overlap, the tip cone's base sunk into the last segment */}
      <mesh position={[0, 0.299, 0.018]} rotation-x={0.1}>
        <boxGeometry args={[0.02, 0.36, 0.1]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      <mesh position={[0, 0.613, 0.081]} rotation-x={0.3}>
        <boxGeometry args={[0.018, 0.34, 0.09]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      <mesh position={[0, 0.61, 0.104]} rotation-x={0.3}>
        <boxGeometry args={[0.008, 0.26, 0.045]} />
        <meshStandardMaterial color={LL.goldHi} {...GOLD} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.818, 0.167]} rotation-x={0.55} scale={[0.3, 1, 1]}>
        <coneGeometry args={[0.055, 0.18, 4]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
      </mesh>
    </group>
  )
}

/** One dragon wing in root-local coords; `s` = +1 (left, spans −x… wait
 * viewer's left = −x) or −1. Membrane panels angled up-and-out with spike
 * cones on the leading edge, all flat-shaded lime like the reference. */
function Wing({ s }: { s: number }) {
  return (
    <>
      {/* root nub anchoring the wing to the back */}
      <mesh position={[s * 0.02, 0.03, 0.02]}>
        <boxGeometry args={[0.12, 0.16, 0.08]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} flatShading />
      </mesh>
      {/* overlapping membrane panels sweeping up-and-out */}
      <mesh position={[s * 0.2, 0.12, -0.02]} rotation-z={s * 0.55} rotation-y={s * -0.3}>
        <boxGeometry args={[0.46, 0.34, 0.024]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[s * 0.46, 0.0, -0.1]} rotation-z={s * 0.2} rotation-y={s * -0.4}>
        <boxGeometry args={[0.4, 0.26, 0.02]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      {/* leading-edge spikes seated on the panel tops */}
      <mesh position={[s * 0.22, 0.32, -0.03]} rotation-z={s * -0.6}>
        <coneGeometry args={[0.035, 0.2, 4]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[s * 0.44, 0.2, -0.09]} rotation-z={s * -1.0}>
        <coneGeometry args={[0.032, 0.18, 4]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[s * 0.62, 0.04, -0.15]} rotation-z={s * -1.3}>
        <coneGeometry args={[0.028, 0.16, 4]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} flatShading />
      </mesh>
    </>
  )
}

export default function LloydModel3D({ action }: { action?: string }) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const elbowLRef = useRef<Group>(null)
  const elbowRRef = useRef<Group>(null)
  const legLRef = useRef<Group>(null)
  const legRRef = useRef<Group>(null)
  const wingLRef = useRef<Group>(null)
  const wingRRef = useRef<Group>(null)
  const tailRef = useRef<Group>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)
  const walkPhaseRef = useRef(0)
  const gaitRef = useRef<LegSwing>({ left: 0, right: 0 }).current

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t // the chop always opens at the carry
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const elbowL = elbowLRef.current
    const elbowR = elbowRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    const wingL = wingLRef.current
    const wingR = wingRRef.current
    const tail = tailRef.current
    if (!armL || !armR || !elbowL || !elbowR || !legL || !legR || !wingL || !wingR || !tail) return

    // Per-action pose; every mutable written every frame (self-correcting).
    let shR = 0
    let elbR = R_ELBOW
    let swayR = 0
    let flap = 0
    let tailSway = Math.sin(t * 0.9) * 0.12
    let gaitL = 0
    let gaitR = 0

    if (action === 'chop') {
      // the 2D celebration's beats: wind overhead, hold, whip down, ease back
      const tau = (t - t0Ref.current) % CHOP_T
      if (tau < RAISE_DONE) {
        const k = smooth(tau / RAISE_DONE)
        shR = lerp(0, SH_RAISE, k)
        elbR = lerp(R_ELBOW, ELB_RAISE, k)
        flap = lerp(0, WING_UP, k)
      } else if (tau < RAISE_HOLD) {
        shR = SH_RAISE
        elbR = ELB_RAISE
        flap = WING_UP
      } else if (tau < SLASH_DONE) {
        const k = smooth((tau - RAISE_HOLD) / (SLASH_DONE - RAISE_HOLD))
        shR = lerp(SH_RAISE, SH_SLASH, k)
        elbR = lerp(ELB_RAISE, ELB_SLASH, k)
        flap = lerp(WING_UP, WING_DOWN, k)
      } else if (tau < SLASH_HOLD) {
        shR = SH_SLASH
        elbR = ELB_SLASH
        flap = WING_DOWN
      } else {
        const k = smooth((tau - SLASH_HOLD) / (CHOP_T - SLASH_HOLD))
        shR = lerp(SH_SLASH, 0, k)
        elbR = lerp(ELB_SLASH, R_ELBOW, k)
        flap = lerp(WING_DOWN, 0, k)
      }
      tailSway = -flap * 0.3 // the tail counter-balances the wing beat
    } else if (action === 'walk') {
      walkPhaseRef.current += WALK_ACTION_SPEED * delta * GAIT_RATE
      const g = legGait(walkPhaseRef.current, WALK_ACTION_SPEED, gaitRef)
      gaitL = g.left
      gaitR = g.right
      tailSway = Math.sin(walkPhaseRef.current * 0.5) * 0.22 // quicker wag
      flap = Math.sin(walkPhaseRef.current * 0.5) * 0.08
    } else {
      swayR = Math.sin(t * 1.7) * 0.04 // idle: the sword arm breathes…
      flap = Math.sin(t * 1.3) * 0.06 // …the wings stir
    }

    armR.rotation.x = shR
    armR.rotation.z = R_SHZ + swayR
    armR.rotation.y = R_SHY
    armL.rotation.x = 0
    armL.rotation.z = L_SHZ
    armL.rotation.y = -L_SHY
    elbowR.rotation.x = elbR
    elbowL.rotation.x = L_ELBOW
    legL.rotation.x = gaitL // walk gait (0 in every other branch)
    legR.rotation.x = gaitR
    wingL.rotation.z = flap
    wingR.rotation.z = -flap
    tail.rotation.y = tailSway
  })

  return (
    <group>
      {/* deep-green legs on hip pivots (shared leg-gait convention): gold trim
       * slab on the thigh, darkest boot with three gold claw-toe cones */}
      <group ref={legLRef} position={[-0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.12, 0.135]}>
          <boxGeometry args={[0.18, 0.14, 0.01]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={LL.deepest} {...CLOTH} />
        </mesh>
        <mesh position={[-0.07, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
        <mesh position={[0, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
        <mesh position={[0.07, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
      </group>
      <group ref={legRRef} position={[0.14, 0.5, 0]}>
        <mesh position={[0, -0.23, 0]}>
          <boxGeometry args={[0.24, 0.46, 0.26]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.12, 0.135]}>
          <boxGeometry args={[0.18, 0.14, 0.01]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} />
        </mesh>
        <mesh position={[0, -0.45, 0.03]}>
          <boxGeometry args={[0.26, 0.1, 0.32]} />
          <meshStandardMaterial color={LL.deepest} {...CLOTH} />
        </mesh>
        <mesh position={[-0.07, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
        <mesh position={[0, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
        <mesh position={[0.07, -0.45, 0.2]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.028, 0.09, 4]} />
          <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
        </mesh>
      </group>
      {/* waist with the gold belt buckle */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={LL.belt} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.57, 0.165]}>
        <boxGeometry args={[0.14, 0.1, 0.01]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      {/* dragon tail: shrinking sphere chain curling down-back and hooking
       * out to the rounded tip (the back-view reference) */}
      <group ref={tailRef} position={[0, 0.52, -0.16]}>
        <mesh position={[0, -0.05, -0.06]}>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0.06, -0.22, -0.14]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0.16, -0.36, -0.17]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0.3, -0.43, -0.12]}>
          <sphereGeometry args={[0.095, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0.43, -0.42, -0.04]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
        <mesh position={[0.52, -0.36, 0.02]}>
          <sphereGeometry args={[0.068, 10, 8]} />
          <meshStandardMaterial color={LL.mid} {...CLOTH} />
        </mesh>
      </group>
      {/* deep-green torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={LL.midDeep} {...CLOTH} flatShading />
      </mesh>
      {/* gold shield emblem with the red inset + gold cross */}
      <mesh position={[0, 1.02, 0.245]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.11, 0.11, 0.03, 5]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
      </mesh>
      <mesh position={[0, 1.02, 0.262]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.015, 5]} />
        <meshStandardMaterial color={LL.emblemRed} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.02, 0.272]}>
        <boxGeometry args={[0.016, 0.12, 0.008]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      <mesh position={[0, 1.03, 0.272]}>
        <boxGeometry args={[0.09, 0.016, 0.008]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} />
      </mesh>
      {/* lime scale wedges on the lower torso */}
      <mesh position={[0, 0.82, 0.3]} rotation-x={Math.PI} scale={[1, 1, 0.4]}>
        <coneGeometry args={[0.045, 0.09, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[-0.1, 0.76, 0.32]} rotation-x={Math.PI} scale={[1, 1, 0.4]}>
        <coneGeometry args={[0.04, 0.08, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.1, 0.76, 0.32]} rotation-x={Math.PI} scale={[1, 1, 0.4]}>
        <coneGeometry args={[0.04, 0.08, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      {/* dragon wings on back-root pivots (the flap swings the whole wing) */}
      <group ref={wingLRef} position={[-0.2, 1.18, -0.17]}>
        <Wing s={-1} />
      </group>
      <group ref={wingRRef} position={[0.2, 1.18, -0.17]}>
        <Wing s={1} />
      </group>
      {/* gold pauldron slabs over the shoulders */}
      <mesh position={[-0.33, 1.27, 0]} rotation-z={0.35}>
        <boxGeometry args={[0.24, 0.05, 0.28]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
      </mesh>
      <mesh position={[0.33, 1.27, 0]} rotation-z={-0.35}>
        <boxGeometry args={[0.24, 0.05, 0.28]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep the joints closed.
       * Lime sleeves, black fists; the RIGHT fist carries the scimitar. */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={LL.green} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={LL.green} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={LL.lime} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={LL.lime} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={LL.hand} {...CLOTH} />
          </mesh>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={LL.green} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={LL.green} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={LL.lime} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={LL.lime} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={LL.hand} {...CLOTH} />
          </mesh>
          {/* scimitar: the forearm's obtuse extension with the fixed wrist
              up-tilt (negative x, the ninja convention), edge leading (#64) */}
          <group position={[0, -0.26, 0]} rotation-z={Math.PI} rotation-x={-0.5}>
            <GoldenSword />
          </group>
        </group>
      </group>
      {/* neck + lime head with the black visor band, yellow serpent eyes and
       * the green mouth-guard mask */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={LL.mid} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.47, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.34, 14]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} />
      </mesh>
      {/* black EYE MASK — a front-only patch covering the eyes AND the nose
          area down to the green mouth-guard, like the 2D art's black face
          panel (the head and headgear stay lime from the sides and back);
          the yellow serpent-eye slits ride on it */}
      <mesh position={[0, 1.495, 0.15]}>
        <boxGeometry args={[0.3, 0.17, 0.1]} />
        <meshStandardMaterial color={LL.black} {...CLOTH} />
      </mesh>
      <mesh position={[-0.075, 1.52, 0.21]} rotation-z={-0.15}>
        <boxGeometry args={[0.08, 0.032, 0.02]} />
        <meshStandardMaterial color={LL.eyeYellow} roughness={0.3} />
      </mesh>
      <mesh position={[0.075, 1.52, 0.21]} rotation-z={0.15}>
        <boxGeometry args={[0.08, 0.032, 0.02]} />
        <meshStandardMaterial color={LL.eyeYellow} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.36, 0.12]}>
        <boxGeometry args={[0.24, 0.11, 0.09]} />
        <meshStandardMaterial color={LL.mid} {...CLOTH} />
      </mesh>
      {/* crown: lime spike cones (tall centre blade, tilted side spikes) with
       * the gold diamond gem on the brow */}
      <mesh position={[0, 1.68, 0]}>
        <coneGeometry args={[0.2, 0.14, 14]} />
        <meshStandardMaterial color={LL.lime} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.84, 0]}>
        <coneGeometry args={[0.05, 0.28, 4]} />
        <meshStandardMaterial color={LL.limeHi} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[-0.12, 1.78, 0]} rotation-z={0.45}>
        <coneGeometry args={[0.04, 0.2, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.12, 1.78, 0]} rotation-z={-0.45}>
        <coneGeometry args={[0.04, 0.2, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[-0.18, 1.7, 0]} rotation-z={0.9}>
        <coneGeometry args={[0.035, 0.16, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.18, 1.7, 0]} rotation-z={-0.9}>
        <coneGeometry args={[0.035, 0.16, 4]} />
        <meshStandardMaterial color={LL.green} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0.17]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 4]} />
        <meshStandardMaterial color={LL.gold} {...GOLD} flatShading />
      </mesh>
    </group>
  )
}
