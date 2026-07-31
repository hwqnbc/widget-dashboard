// The fire ninja's mesh-level 3D model: the 2D FireBladeFigure's red gi with
// black crossed sashes, black obi + boots, silver hex emblem, LEGO-yellow
// face with angry brows and spiky dark hair, and the sword hilt gripped in
// the right hand, rebuilt from three.js primitives. Venue-neutral (no spin,
// no stage): faces +Z, feet at y=0, ~1.85 units tall, same skeleton as
// ToyModel3D/NinjaModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway, bare handle):
// - 'blaze': the 2D celebration — a flaming blade IGNITES out of the hilt
//   (overshoot scale-up from a start-time ref) then the arm sweeps the
//   burning sword across the body in a looping guard parry, with the flame
//   flickering (scale noise + emissive pulse). Blade visibility/scale are
//   written imperatively each frame; the wrist counter-rotates the arm so
//   the blade stays upright through the sweep (lesson #60).
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from fireninja/index.ts, or three.js lands in the chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import { F } from './fireNinjaPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Guard-sweep pose targets (radians on the right shoulder). */
const REST = 0.12
const GUARD = 0.9
const SWEEP = 0.45 // sweep amplitude about the guard
const IGNITE_S = 0.5

/** Crown hair spikes: [x, y, z, tiltZ, tiltX, height]. */
const SPIKES: [number, number, number, number, number, number][] = [
  [0, 1.8, 0, 0, 0, 0.2],
  [0.13, 1.76, 0.07, -0.4, 0.1, 0.17],
  [-0.13, 1.76, 0.05, 0.45, 0.05, 0.18],
  [0.07, 1.76, -0.13, -0.15, -0.4, 0.16],
  [-0.07, 1.77, -0.11, 0.2, -0.35, 0.17],
  [0.02, 1.77, 0.14, 0, 0.4, 0.15],
]

export default function FireNinjaModel3D({ action }: { action?: string }) {
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const wristRef = useRef<Group>(null)
  const bladeRef = useRef<Group>(null)
  const coreMatRef = useRef<MeshStandardMaterial>(null)
  const t0Ref = useRef(0)
  const prevActionRef = useRef<string | undefined>(undefined)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (action !== prevActionRef.current) {
      prevActionRef.current = action
      t0Ref.current = t
    }
    const armL = armLRef.current
    const armR = armRRef.current
    const wrist = wristRef.current
    const blade = bladeRef.current
    if (!armL || !armR || !wrist || !blade) return

    let armRz = REST
    let armLz = -REST
    let wristZ = Math.PI // hilt along the hanging arm, blade axis down
    let bladeScale = 0
    let flicker = 1

    if (action === 'blaze') {
      const tau = t - t0Ref.current
      armLz = -0.4
      if (tau < IGNITE_S) {
        // raise into the guard while the blade shoots out of the hilt
        const k = smooth(tau / IGNITE_S)
        armRz = lerp(REST, GUARD, k)
        wristZ = lerp(Math.PI, -GUARD + 0.2, k) // short arc — blade ends upright
        // overshoot ignite: 0 → 1.12 → 1
        bladeScale = tau / IGNITE_S < 0.55 ? lerp(0.02, 1.12, smooth(tau / (IGNITE_S * 0.55))) : lerp(1.12, 1, smooth((tau / IGNITE_S - 0.55) / 0.45))
      } else {
        // looping cross-body guard sweep, blade held upright
        const s = Math.sin(((tau - IGNITE_S) / 1.5) * Math.PI * 2)
        armRz = GUARD + s * SWEEP
        wristZ = -armRz + 0.2
        bladeScale = 1
        // living flame: two incommensurate wobbles + emissive pulse
        flicker = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.04
      }
    } else {
      const sway = Math.sin(t * 1.7) * 0.05
      armLz = -(REST + sway)
      armRz = REST - sway
    }

    armL.rotation.z = armLz
    armR.rotation.z = armRz
    wrist.rotation.z = wristZ
    blade.visible = bladeScale > 0.03
    blade.scale.set(1 + (flicker - 1) * 0.6, bladeScale * flicker, 1 + (flicker - 1) * 0.6)
    if (coreMatRef.current) coreMatRef.current.emissiveIntensity = 1.1 + (flicker - 1) * 6
  })

  return (
    <group>
      {/* legs + black boots */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={F.gi} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={F.gi} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={F.sash} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={F.sash} {...CLOTH} />
      </mesh>
      {/* black obi belt + knot */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={F.sash} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.55, 0.17]}>
        <boxGeometry args={[0.12, 0.1, 0.06]} />
        <meshStandardMaterial color={F.sashHi} {...CLOTH} />
      </mesh>
      {/* red gi torso: tapered 4-seg cylinder (the flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={F.gi} {...CLOTH} flatShading />
      </mesh>
      {/* black sashes crossed over the chest */}
      <mesh position={[-0.0, 0.95, 0.245]} rotation-z={0.7}>
        <boxGeometry args={[0.09, 0.6, 0.03]} />
        <meshStandardMaterial color={F.sash} {...CLOTH} />
      </mesh>
      <mesh position={[0, 0.95, 0.245]} rotation-z={-0.7}>
        <boxGeometry args={[0.09, 0.6, 0.03]} />
        <meshStandardMaterial color={F.sash} {...CLOTH} />
      </mesh>
      {/* silver hex emblem over the cross */}
      <mesh position={[0, 0.98, 0.27]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.08, 0.08, 0.025, 6]} />
        <meshStandardMaterial color={F.steel} {...STEEL} flatShading />
      </mesh>
      {/* arms: groups pivoted at the shoulder so useFrame swings them */}
      <group ref={armLRef} position={[-0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={F.gi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={F.skin} {...CLOTH} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={F.gi} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={F.skin} {...CLOTH} />
        </mesh>
        {/* the sword, always gripped: gold tsuba + wrapped grip + pommel,
         * with the fire blade child that ignites for 'blaze' */}
        <group ref={wristRef} position={[0, -0.46, 0]} rotation-z={Math.PI}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.16, 0.03, 0.05]} />
            <meshStandardMaterial color={F.guard} {...STEEL} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.18, 8]} />
            <meshStandardMaterial color={F.hilt} {...CLOTH} />
          </mesh>
          <mesh position={[0, -0.21, 0]}>
            <boxGeometry args={[0.05, 0.03, 0.05]} />
            <meshStandardMaterial color={F.guard} {...STEEL} />
          </mesh>
          <group ref={bladeRef} position={[0, 0.02, 0]} visible={false}>
            {/* white-hot core */}
            <mesh position={[0, 0.36, 0]}>
              <boxGeometry args={[0.05, 0.7, 0.02]} />
              <meshStandardMaterial
                ref={coreMatRef}
                color={F.flameCore}
                emissive={F.flameCore}
                emissiveIntensity={1.1}
                roughness={0.4}
              />
            </mesh>
            {/* outer flame envelope */}
            <mesh position={[0, 0.42, 0]}>
              <coneGeometry args={[0.07, 0.86, 8]} />
              <meshStandardMaterial
                color={F.flame}
                emissive={F.flameDeep}
                emissiveIntensity={0.7}
                transparent
                opacity={0.75}
                flatShading
              />
            </mesh>
          </group>
        </group>
      </group>
      {/* neck + LEGO-yellow minifig head */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={F.skin} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.32, 24]} />
        <meshStandardMaterial color={F.skin} {...CLOTH} />
      </mesh>
      {/* face: angry brows, eyes, small open smile */}
      <mesh position={[-0.09, 1.56, 0.25]} rotation-z={-0.3}>
        <boxGeometry args={[0.09, 0.025, 0.02]} />
        <meshStandardMaterial color={F.hair} roughness={0.5} />
      </mesh>
      <mesh position={[0.09, 1.56, 0.25]} rotation-z={0.3}>
        <boxGeometry args={[0.09, 0.025, 0.02]} />
        <meshStandardMaterial color={F.hair} roughness={0.5} />
      </mesh>
      <mesh position={[-0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={F.line} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.5, 0.25]}>
        <sphereGeometry args={[0.028, 10, 8]} />
        <meshStandardMaterial color={F.line} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.41, 0.255]} rotation-z={Math.PI * 1.05}>
        <torusGeometry args={[0.06, 0.014, 8, 16, Math.PI * 0.9]} />
        <meshStandardMaterial color={F.line} roughness={0.3} />
      </mesh>
      {/* spiky dark hair: flat-shaded cap + crown spikes + sideburns */}
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.275, 0.27, 0.14, 8]} />
        <meshStandardMaterial color={F.hair} {...CLOTH} flatShading />
      </mesh>
      {SPIKES.map(([x, y, z, tz, tx, h], i) => (
        <mesh key={i} position={[x, y, z]} rotation-z={tz} rotation-x={tx}>
          <coneGeometry args={[0.07, h, 5]} />
          <meshStandardMaterial color={F.hair} {...CLOTH} flatShading />
        </mesh>
      ))}
      <mesh position={[-0.26, 1.5, 0.08]}>
        <boxGeometry args={[0.05, 0.16, 0.08]} />
        <meshStandardMaterial color={F.hair} {...CLOTH} />
      </mesh>
      <mesh position={[0.26, 1.5, 0.08]}>
        <boxGeometry args={[0.05, 0.16, 0.08]} />
        <meshStandardMaterial color={F.hair} {...CLOTH} />
      </mesh>
    </group>
  )
}
