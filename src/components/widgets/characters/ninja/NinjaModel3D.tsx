// The white ice-ninja's mesh-level 3D model: the 2D SwordNinjaFigure's robe,
// ice torso panel, gold obi + medallion, shoulder armor, dark face mask and
// the two katanas crossed on the back, rebuilt from three.js primitives.
// Venue-neutral (no spin, no stage — the FigureStage3D turntable or a game
// world drives its heading): faces +Z, feet at y=0, ~1.85 units tall, same
// skeleton as ToyModel3D so shared scaling holds.
//
// `action` picks a named move from the registry's actions3d library
// (undefined/unknown ids idle with a subtle arm sway):
// - 'pump': bounce with the right arm pumping a drawn katana overhead.
// - 'draw': the 2D celebration's choreography — reach over the right
//   shoulder, unsheathe the back katana, sweep it to an upright guard,
//   flourish, re-sheathe; looping. A phase timeline over a start-time ref
//   (so the loop always begins at the reach), with the katana visibility
//   written imperatively each frame and a wrist angle that counter-rotates
//   the arm so the blade ends vertical in the guard.
// All animation mutates refs in useFrame — zero React renders.
//
// Loaded only via lazy() (the avatar registry's Model3D/Figure3D fields) —
// never re-export from ninja/index.ts, or three.js lands in the main chunk.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { N } from './ninjaPalette'

const CLOTH = { roughness: 0.7, metalness: 0 }
const STEEL = { roughness: 0.35, metalness: 0.4 }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

/** Draw-loop pose targets (radians on the right shoulder). */
const REST = 0.12
const REACH = 2.5 // hand up over the right shoulder
const GUARD = 1.0 // raised guard, blade vertical
const BACK_TILT = -0.55 // rotation.x reaching behind the shoulder
const DRAW_T = 3.2 // loop period (s)

/** A katana in local coords: hilt at the origin, blade up (+y), ~0.85 long. */
function Katana() {
  return (
    <group>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.045, 0.62, 0.015]} />
        <meshStandardMaterial color={N.blade} {...STEEL} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.13, 0.03, 0.045]} />
        <meshStandardMaterial color={N.guard} {...STEEL} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.19, 8]} />
        <meshStandardMaterial color={N.hiltWrap} {...CLOTH} />
      </mesh>
    </group>
  )
}

export default function NinjaModel3D({ action }: { action?: string }) {
  const bodyRef = useRef<Group>(null)
  const armLRef = useRef<Group>(null)
  const armRRef = useRef<Group>(null)
  const heldRef = useRef<Group>(null)
  /** Back katana with its hilt over the RIGHT shoulder — the one 'draw' pulls. */
  const backRRef = useRef<Group>(null)
  /** Back katana over the LEFT shoulder — the one 'pump' holds drawn. */
  const backLRef = useRef<Group>(null)
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
    const held = heldRef.current
    const backR = backRRef.current
    const backL = backLRef.current
    if (!body || !armL || !armR || !held || !backR || !backL) return

    // Per-action pose; every mutable written every frame (self-correcting).
    let armRz = REST
    let armRx = 0
    let armLz = -REST
    let bodyY = 0
    let heldVisible = false
    let heldWrist = Math.PI // blade as the arm's extension
    let backRVisible = true
    let backLVisible = true

    if (action === 'pump') {
      bodyY = Math.abs(Math.sin(t * 5.4)) * 0.16
      armRz = 1.9 - Math.sin(t * 5.4) * 0.35
      armLz = -(0.5 + Math.sin(t * 5.4) * 0.2)
      heldVisible = true
      backLVisible = false
    } else if (action === 'draw') {
      const tau = (t - t0Ref.current) % DRAW_T
      armLz = -0.3
      if (tau < 0.8) {
        // reach up over the right shoulder, slight crouch
        const k = smooth(tau / 0.8)
        armRz = lerp(REST, REACH, k)
        armRx = lerp(0, BACK_TILT, k)
        bodyY = -0.05 * k
      } else if (tau < 1.6) {
        // unsheathe: sweep to the guard, blade arcing out overhead
        const k = smooth((tau - 0.8) / 0.8)
        armRz = lerp(REACH, GUARD, k)
        armRx = lerp(BACK_TILT, 0, k)
        bodyY = -0.05 * (1 - k)
        heldVisible = true
        backRVisible = false
        // wrist: from arm-extension at the grab to blade-vertical at guard.
        // Start at -π (≡ π) so the lerp takes the SHORT arc — from +π the
        // blade sweeps 300° the wrong way and points down mid-draw.
        heldWrist = lerp(-Math.PI, -GUARD + 0.15, k)
      } else if (tau < 2.3) {
        // guard flourish: small pump, blade stays upright
        const pump = Math.sin(((tau - 1.6) / 0.7) * Math.PI * 2) * 0.1
        armRz = GUARD + pump
        heldVisible = true
        backRVisible = false
        heldWrist = -armRz + 0.15
      } else if (tau < 2.9) {
        // re-sheathe: reverse the sweep back over the shoulder
        const k = smooth((tau - 2.3) / 0.6)
        armRz = lerp(GUARD, REACH, k)
        armRx = lerp(0, BACK_TILT, k)
        bodyY = -0.05 * k
        const sheathed = k > 0.92
        heldVisible = !sheathed
        backRVisible = sheathed
        heldWrist = lerp(-GUARD + 0.15, -Math.PI, k) // short arc back
      } else {
        // return to rest
        const k = smooth((tau - 2.9) / 0.3)
        armRz = lerp(REACH, REST, k)
        armRx = lerp(BACK_TILT, 0, k)
        bodyY = -0.05 * (1 - k)
      }
    } else {
      const sway = Math.sin(t * 1.7) * 0.05
      armLz = -(REST + sway)
      armRz = REST - sway
    }

    body.position.y = bodyY
    armL.rotation.z = armLz
    armR.rotation.z = armRz
    armR.rotation.x = armRx
    held.visible = heldVisible
    held.rotation.z = heldWrist
    backR.visible = backRVisible
    backL.visible = backLVisible
  })

  return (
    <group ref={bodyRef}>
      {/* legs + tabi feet */}
      <mesh position={[-0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.27, 0]}>
        <boxGeometry args={[0.24, 0.46, 0.26]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[-0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      <mesh position={[0.14, 0.05, 0.03]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      {/* gold obi belt + knot */}
      <mesh position={[0, 0.57, 0]}>
        <boxGeometry args={[0.54, 0.14, 0.32]} />
        <meshStandardMaterial color={N.gold} {...CLOTH} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, 0.17]}>
        <boxGeometry args={[0.12, 0.1, 0.06]} />
        <meshStandardMaterial color={N.gold} {...CLOTH} roughness={0.5} />
      </mesh>
      {/* ice torso: tapered 4-seg cylinder (the toy's flared-box trick) */}
      <mesh position={[0, 0.92, 0]} rotation-y={Math.PI / 4}>
        <cylinderGeometry args={[0.3, 0.4, 0.6, 4]} />
        <meshStandardMaterial color={N.ice} {...CLOTH} flatShading />
      </mesh>
      {/* white robe V lapels */}
      <mesh position={[-0.08, 1.02, 0.24]} rotation-z={0.26}>
        <boxGeometry args={[0.09, 0.42, 0.03]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      <mesh position={[0.08, 1.02, 0.24]} rotation-z={-0.26}>
        <boxGeometry args={[0.09, 0.42, 0.03]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      {/* gold hex medallion (8-seg disc reads faceted at this size) */}
      <mesh position={[0, 0.88, 0.26]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.075, 0.075, 0.025, 8]} />
        <meshStandardMaterial color={N.gold} {...STEEL} flatShading />
      </mesh>
      {/* right shoulder armor slab */}
      <mesh position={[0.37, 1.23, 0]} rotation-z={-0.25}>
        <boxGeometry args={[0.28, 0.07, 0.3]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} />
      </mesh>
      {/* katanas crossed on the back, hilts up over the shoulders */}
      <group position={[0, 0, -0.26]}>
        <group ref={backRRef} position={[0.18, 1.32, 0]} rotation-z={2.4}>
          <Katana />
        </group>
        <group ref={backLRef} position={[-0.18, 1.32, 0]} rotation-z={-2.4}>
          <Katana />
        </group>
      </group>
      {/* arms: groups pivoted at the shoulder so useFrame swings them */}
      <group ref={armLRef} position={[-0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={N.robe} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={N.robeShade} {...CLOTH} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.38, 1.14, 0]}>
        <mesh position={[0, -0.21, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.42, 12]} />
          <meshStandardMaterial color={N.robe} {...CLOTH} />
        </mesh>
        <mesh position={[0, -0.46, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial color={N.robeShade} {...CLOTH} />
        </mesh>
        {/* the katana in hand; visibility + wrist driven per-frame */}
        <group ref={heldRef} position={[0, -0.46, 0]} rotation-z={Math.PI} visible={false}>
          <Katana />
        </group>
      </group>
      {/* neck + faceted hood head (8-seg flat-shaded — helmet-like, short) */}
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={N.robeShade2} {...CLOTH} />
      </mesh>
      <mesh position={[0, 1.48, 0]}>
        <cylinderGeometry args={[0.27, 0.27, 0.34, 8]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} flatShading />
      </mesh>
      {/* hood peak */}
      <mesh position={[0, 1.74, 0]}>
        <coneGeometry args={[0.27, 0.2, 8]} />
        <meshStandardMaterial color={N.robe} {...CLOTH} flatShading />
      </mesh>
      {/* dark mask band with ice eyes */}
      <mesh position={[0, 1.5, 0.24]}>
        <boxGeometry args={[0.36, 0.14, 0.05]} />
        <meshStandardMaterial color={N.line} {...CLOTH} />
      </mesh>
      <mesh position={[-0.09, 1.52, 0.27]}>
        <boxGeometry args={[0.07, 0.035, 0.02]} />
        <meshStandardMaterial color={N.iceMid} roughness={0.3} />
      </mesh>
      <mesh position={[0.09, 1.52, 0.27]}>
        <boxGeometry args={[0.07, 0.035, 0.02]} />
        <meshStandardMaterial color={N.iceMid} roughness={0.3} />
      </mesh>
    </group>
  )
}
