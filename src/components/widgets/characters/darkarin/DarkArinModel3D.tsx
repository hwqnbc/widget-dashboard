// DarkArin's mesh-level 3D model: the 2D TwinSwordFigure's amber gi, faceted
// black mask with the gold crown, gunmetal pauldrons, magenta dragon emblem,
// black obi + shin wraps, and the two translucent ice-blue blades — ALWAYS in
// hand (the 2D art has no back sheath), rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'cross': the 2D celebration's choreography — from the ready V (both
//   blades up-and-out) both arms sweep down-forward-inward and the blades
//   land crossed in an X in FRONT of the chest (defensive guard), hold,
//   then open back out; 2.6 s loop matching the 2D's 0.7 s tween + hold.
//   Both arms mirror one scalar set; the inward/outward aim lives in the
//   SHOULDER'S Y yaw (it re-planes the elbow's bend so the forearms — and
//   the blades riding them as obtuse extensions — cross the midline).
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from darkarin/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { D } from './darkArinPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Cross-loop pose targets — RIGHT-arm values; the left arm mirrors z/y. */
const READY_SHZ = 0.32 // shoulder z: arms angled out from the body
const READY_SHY = 0.4 // shoulder y yawed OUTWARD — blades up-and-out (the 2D ready V)
const READY_ELBOW = -1.85 // forearm up-forward; the blade continues it upward
const CROSS_SHZ = 0.1 // arms drop in beside the body…
const CROSS_SHY = -0.55 // …yaw flips INWARD — the forearms cross the midline
const CROSS_SHX = -0.42 // both arms swing forward: the X forms ahead of the chest
const CROSS_ELBOW = -1.72 // shallower than ready: the X sits at chest height, not the face
const WRIST_TILT = -0.35 // fixed slight up-tilt: blade = the forearm's obtuse extension
const CROSS_T = 2.6 // loop period (s) — the 2D interval's full cycle

/** Crown trim: [x, y, z, tiltZ] for the three studs (spheres, crownHi). */
const STUDS: [number, number, number][] = [
  [-0.12, 1.6, 0.25],
  [0, 1.61, 0.28],
  [0.12, 1.6, 0.25],
]
/** Side fins flaring out at the temples: [x, tiltZ]. */
const FINS: [number, number][] = [
  [-0.29, 0.9],
  [0.29, -0.9],
]

/** An ice sword in local coords: hilt at the origin, blade up (+y), ~0.85
 * long — the 2D's long thin translucent blade over a bright core. */
function IceSword() {
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.055, 0.72, 0.02]} />
        <meshStandardMaterial color={D.blade} transparent opacity={0.55} roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.022, 0.68, 0.024]} />
        <meshStandardMaterial color={D.bladeHi} transparent opacity={0.9} emissive={D.bladeEdge} emissiveIntensity={0.35} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <coneGeometry args={[0.028, 0.09, 4]} />
        <meshStandardMaterial color={D.blade} transparent opacity={0.6} flatShading />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.14, 0.03, 0.05]} />
        <meshStandardMaterial color={D.steel} {...STEEL} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.18, 8]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[0.05, 0.03, 0.05]} />
        <meshStandardMaterial color={D.steel} {...STEEL} />
      </mesh>
    </group>
  )
}

export default function DarkArinModel3D({ action }: { action?: string }) {
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
    // One right-arm scalar set — the left arm mirrors z and y below.
    let shZ = READY_SHZ
    let shY = READY_SHY
    let shX = 0
    let elbow = READY_ELBOW
    let bodyY = 0

    if (action === 'cross') {
      const tau = (t - t0Ref.current) % CROSS_T
      let k = 0
      if (tau < 0.7) {
        k = smooth(tau / 0.7) // sweep into the cross
      } else if (tau < 1.3) {
        k = 1 // hold the X — a small elbow press keeps it alive
        elbow = CROSS_ELBOW + Math.sin(((tau - 0.7) / 0.6) * Math.PI) * 0.06
      } else if (tau < 2.0) {
        k = 1 - smooth((tau - 1.3) / 0.7) // open back out
      } // else: hold the ready V until the loop restarts
      shZ = lerp(READY_SHZ, CROSS_SHZ, k)
      shY = lerp(READY_SHY, CROSS_SHY, k)
      shX = lerp(0, CROSS_SHX, k)
      if (tau < 0.7 || tau >= 1.3) elbow = lerp(READY_ELBOW, CROSS_ELBOW, k)
      bodyY = -0.05 * k // slight crouch behind the guard
    } else {
      const sway = Math.sin(t * 1.7) * 0.05
      shZ = READY_SHZ + sway // both arms breathe out/in together (mirrored)
    }

    body.position.y = bodyY
    armR.rotation.z = shZ
    armR.rotation.y = shY
    armR.rotation.x = shX
    armL.rotation.z = -shZ
    armL.rotation.y = -shY
    armL.rotation.x = shX
    elbowL.rotation.x = elbow
    elbowR.rotation.x = elbow
    heldL.rotation.x = WRIST_TILT
    heldR.rotation.x = WRIST_TILT
  })

  return (
    <group ref={bodyRef}>
      {/* legs with black shin wraps + tabi feet */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={D.gi} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={D.gi} {...CLOTH} />
      </mesh>
      {[-0.14, 0.14].map((x) =>
        [0.2, 0.12].map((y) => (
          <mesh key={`${x}${y}`} position={[x, y, 0]}>
            <boxGeometry args={[0.26, 0.045, 0.28]} />
            <meshStandardMaterial color={D.mask} {...CLOTH} />
          </mesh>
        )),
      )}
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      {/* black obi belt + knot */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <boxGeometry args={[0.54, 0.025, 0.33]} />
        <meshStandardMaterial color={D.maskHi} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.55, 0.17]}>
        <boxGeometry args={[0.12, 0.1, 0.06]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      {/* amber gi torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={D.gi} {...CLOTH} flatShading />
      </mesh>
      {/* magenta dragon emblem (8-seg disc + curl accent — glyph shorthand) */}
      <mesh position={[0, 0.95, 0.26]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.09, 0.09, 0.025, 8]} />
        <meshStandardMaterial color={D.dragon} {...CLOTH} flatShading />
      </mesh>
      <mesh position={[0.02, 0.97, 0.275]} rotation-z={0.6}>
        <boxGeometry args={[0.1, 0.03, 0.01]} />
        <meshStandardMaterial color={D.dragonHi} {...CLOTH} />
      </mesh>
      {/* gunmetal pauldrons + gorget collar */}
      <mesh position={[-0.3, 1.23, 0]} rotation-z={0.25}>
        <boxGeometry args={[0.28, 0.07, 0.3]} />
        <meshStandardMaterial color={D.armor} {...CLOTH} />
      </mesh>
      <mesh position={[0.3, 1.23, 0]} rotation-z={-0.25}>
        <boxGeometry args={[0.28, 0.07, 0.3]} />
        <meshStandardMaterial color={D.armor} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.24, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.16, 0.2, 0.08, 4]} />
        <meshStandardMaterial color={D.armorHi} {...CLOTH} flatShading />
      </mesh>
      {/* arms: shoulder group (pose) + ELBOW-hinged forearm (the move) —
       * the shared two-joint rig; cap spheres keep both joints closed.
       * Each hand permanently grips an ice sword (no back sheath in the 2D). */}
      <group ref={armLRef} position={[-0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={D.gi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={D.gi} {...CLOTH} />
        </mesh>
        <group ref={elbowLRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={D.gi} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={D.gi} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={D.giShade} {...CLOTH} />
          </mesh>
          {/* the sword in hand; rides the FOREARM as its obtuse extension */}
          <group ref={heldLRef} position={[0, -0.26, 0]} rotation-z={Math.PI}>
            <IceSword />
          </group>
        </group>
      </group>
      <group ref={armRRef} position={[0.3, 1.14, 0]}>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color={D.gi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.11, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.22, 12]} />
          <meshStandardMaterial color={D.gi} {...CLOTH} />
        </mesh>
        <group ref={elbowRRef} position={[0, -0.22, 0]}>
          <mesh>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color={D.gi} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.24, 12]} />
            <meshStandardMaterial color={D.gi} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <meshStandardMaterial color={D.giShade} {...CLOTH} />
          </mesh>
          <group ref={heldRRef} position={[0, -0.26, 0]} rotation-z={Math.PI}>
            <IceSword />
          </group>
        </group>
      </group>
      {/* neck + faceted chin-pointed mask head (8-seg, wider at the top) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.27, 0.16, 0.36, 8]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} flatShading />
      </mesh>
      {/* faceted apex cap */}
      <mesh position={[0, 1.71, 0]}>
        <coneGeometry args={[0.28, 0.12, 8]} />
        <meshStandardMaterial color={D.mask} {...CLOTH} flatShading />
      </mesh>
      {/* determined amber eyes, inner corners raised, with dark pupils */}
      <mesh position={[-0.09, 1.5, 0.22]} rotation-z={0.18}>
        <boxGeometry args={[0.08, 0.035, 0.03]} />
        <meshStandardMaterial color={D.eye} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.5, 0.22]} rotation-z={-0.18}>
        <boxGeometry args={[0.08, 0.035, 0.03]} />
        <meshStandardMaterial color={D.eye} roughness={0.3} />
      </mesh>
      <mesh position={[-0.08, 1.5, 0.24]}>
        <boxGeometry args={[0.022, 0.022, 0.01]} />
        <meshStandardMaterial color={D.line} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.5, 0.24]}>
        <boxGeometry args={[0.022, 0.022, 0.01]} />
        <meshStandardMaterial color={D.line} {...CLOTH} />
      </mesh>
      {/* gold crown: brow band + centre spike + studs + temple fins */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.285, 0.275, 0.07, 8]} />
        <meshStandardMaterial color={D.crown} {...STEEL} flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0.22]}>
        <coneGeometry args={[0.035, 0.12, 4]} />
        <meshStandardMaterial color={D.crown} {...STEEL} flatShading />
      </mesh>
      {STUDS.map(([x, y, z]) => (
        <mesh key={`s${x}`} position={[x, y, z]}>
          <sphereGeometry args={[0.026, 10, 8]} />
          <meshStandardMaterial color={D.crownHi} {...STEEL} />
        </mesh>
      ))}
      {FINS.map(([x, tilt]) => (
        <mesh key={`f${x}`} position={[x, 1.62, 0]} rotation-z={tilt}>
          <coneGeometry args={[0.03, 0.11, 4]} />
          <meshStandardMaterial color={D.crown} {...STEEL} flatShading />
        </mesh>
      ))}
    </group>
  )
}
