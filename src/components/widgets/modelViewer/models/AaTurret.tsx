import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

/**
 * Anti-aircraft gun turret built entirely from primitives: olive fixed base
 * on four stabilizer outriggers, a rotating turret head with angled armour
 * plates and a segmented rear ammo rack, and an elevating gun cradle with
 * pistons, a long barrel and a muzzle brake. User-provided model, adapted
 * for the Model Viewer catalog: no Canvas/lights (the stage owns those); the
 * shared materials became plain prop-object constants (spreading a live
 * THREE.Material instance into JSX dumps its internals as props — lesson
 * #79); the barrel-section rotations moved from <cylinderGeometry> (where
 * R3F ignores transforms — lesson #76) onto the parent <mesh>; and the
 * traverse/elevation animation accumulates its own phase by delta while
 * `animate` is on, so pausing freezes the pose instead of snapping.
 */

const OLIVE = { color: '#475536', roughness: 0.9, metalness: 0.1 }
const DARK_METAL = { color: '#262626', roughness: 0.7, metalness: 0.5 }
const LIGHT_METAL = { color: '#525252', roughness: 0.6, metalness: 0.4 }

/** Optional aim target: head yaw + barrel elevation (radians), consumed each
 * frame so an owner (e.g. Drone Strike) can make the gun track a target. */
export interface TurretAim {
  /** World/local head yaw — the barrel's +Z is slewed toward it. */
  yaw: number
  /** Elevation above the horizon (positive = up). */
  pitch: number
}
/** Head/barrel slew responsiveness (exponential approach, per second). */
const AIM_SLEW = 5
/** Barrel elevation arc: steep up for aircraft, a touch below level. */
const PITCH_MIN = -1.35 // ≈ 77° up (rotation.x is negated elevation)
const PITCH_MAX = 0.15 // ≈ 9° down
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Stabilizer outrigger: beam, ground pad and support block. */
function StabilizerLeg({
  position,
  rotation,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Main beam */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.5, 0.1, 0.3]} />
        <meshStandardMaterial {...OLIVE} />
      </mesh>
      {/* Ground pad */}
      <mesh position={[0.7, 0.01, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.03, 16]} />
        <meshStandardMaterial {...OLIVE} />
      </mesh>
      {/* Small support block */}
      <mesh position={[0.3, 0.1, 0]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial {...OLIVE} />
      </mesh>
    </group>
  )
}

/** One shell segment of the rear ammo rack. */
function AmmoRackSegment({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.08, 0.7, 0.35]} />
      <meshStandardMaterial {...OLIVE} />
    </mesh>
  )
}

export default function AaTurret({
  animate,
  aimRef,
}: {
  animate: boolean
  /** When set (and non-null), the gun slews to track this aim instead of
   * running the canned scan — the Model Viewer omits it, Drone Strike feeds
   * the player's bearing so the turret aims where it shoots. */
  aimRef?: RefObject<TurretAim | null>
}) {
  const turretGroupRef = useRef<Group>(null)
  const barrelCradleRef = useRef<Group>(null)
  // Animation phase in seconds, advanced only while animating — the pose is
  // always derived from it, so Animate off freezes and on resumes smoothly.
  const phaseRef = useRef(0)

  useFrame((_, delta) => {
    const head = turretGroupRef.current
    const cradle = barrelCradleRef.current
    const aim = aimRef?.current
    if (aim) {
      // Track a target: slew the head yaw (shortest way around) and the
      // barrel elevation toward the aim, clamped to the gun's arc.
      const k = 1 - Math.exp(-AIM_SLEW * delta)
      if (head) {
        let d = aim.yaw - head.rotation.y
        d = Math.atan2(Math.sin(d), Math.cos(d))
        head.rotation.y += d * k
      }
      if (cradle) {
        const target = clamp(-aim.pitch, PITCH_MIN, PITCH_MAX)
        cradle.rotation.x += (target - cradle.rotation.x) * k
      }
      return
    }
    if (animate) phaseRef.current += delta
    const t = phaseRef.current
    // Slow continuous traverse.
    if (head) head.rotation.y = t * 0.1
    // Barrel elevation sweeping ~-12°..48° on a sine.
    if (cradle) {
      cradle.rotation.x = -(Math.PI / 10 + Math.sin(t * 0.5) * (Math.PI / 6))
    }
  })

  return (
    // Natural build is ~4.4 units tall at full elevation — scaled to the
    // catalog convention (~2.5 units) so the default camera frames it.
    <group scale={0.6}>
      {/* 1. Fixed base & stabilizers */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.0, 0.3, 1.0]} />
        <meshStandardMaterial {...OLIVE} />
      </mesh>
      {/* Four outriggers */}
      <StabilizerLeg position={[1.2, 0, 1.2]} rotation={[0, -Math.PI / 4, 0]} />
      <StabilizerLeg position={[-1.2, 0, 1.2]} rotation={[0, Math.PI / 4, 0]} />
      <StabilizerLeg position={[1.2, 0, -1.2]} rotation={[0, Math.PI + Math.PI / 4, 0]} />
      <StabilizerLeg position={[-1.2, 0, -1.2]} rotation={[0, Math.PI - Math.PI / 4, 0]} />

      {/* Central pedestal mount */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.6, 24]} />
        <meshStandardMaterial {...OLIVE} />
      </mesh>

      {/* 2. Rotating turret head */}
      <group ref={turretGroupRef} position={[0, 0.85, 0]}>
        {/* Turret floor plate */}
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.7, 0.7, 0.1, 16]} />
          <meshStandardMaterial {...LIGHT_METAL} />
        </mesh>

        {/* Armour hull (angled olive plating) */}
        <group position={[0, 0.3, 0]}>
          <mesh position={[0.4, 0.3, 0.3]} rotation={[0, -0.15, 0]}>
            <boxGeometry args={[0.8, 0.6, 0.1]} />
            <meshStandardMaterial {...OLIVE} roughness={0.95} />
          </mesh>
          <mesh position={[-0.4, 0.3, 0.3]} rotation={[0, 0.15, 0]}>
            <boxGeometry args={[0.8, 0.6, 0.1]} />
            <meshStandardMaterial {...OLIVE} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.4, 0.6, 0.6]} />
            <meshStandardMaterial {...OLIVE} />
          </mesh>
        </group>

        {/* Ammunition racks (rear segmented structure) */}
        <group position={[0, 0.45, -0.6]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[0.7, 0.1, 0.45]} />
            <meshStandardMaterial {...OLIVE} />
          </mesh>
          <AmmoRackSegment position={[-0.25, 0.35, 0]} />
          <AmmoRackSegment position={[-0.1, 0.35, 0]} />
          <AmmoRackSegment position={[0.05, 0.35, 0]} />
          <AmmoRackSegment position={[0.2, 0.35, 0]} />
          <AmmoRackSegment position={[0.35, 0.35, 0]} />
        </group>

        {/* 3. Gun cradle & barrel (elevation group) */}
        <group ref={barrelCradleRef} position={[0, 1.0, 0.1]}>
          {/* Breech/cradle mechanism */}
          <mesh position={[0, 0.15, -0.1]}>
            <boxGeometry args={[0.3, 0.4, 0.6]} />
            <meshStandardMaterial {...DARK_METAL} />
          </mesh>
          <mesh position={[0, 0.35, -0.2]}>
            <boxGeometry args={[0.15, 0.2, 0.3]} />
            <meshStandardMaterial {...LIGHT_METAL} />
          </mesh>

          {/* Elevation pistons */}
          <mesh position={[-0.15, -0.1, 0.15]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
            <meshStandardMaterial {...LIGHT_METAL} />
          </mesh>
          <mesh position={[0.15, -0.1, 0.15]} rotation={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
            <meshStandardMaterial {...LIGHT_METAL} />
          </mesh>

          {/* The gun barrel — cylinders are minted along Y, so each mesh
           * (not the geometry) rotates its section to lie along +Z */}
          <group position={[0, 0.15, 0.2]}>
            {/* Thick breech section */}
            <mesh position={[0, 0, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.08, 0.8, 12]} />
              <meshStandardMaterial {...OLIVE} />
            </mesh>
            {/* Main long barrel */}
            <mesh position={[0, 0, 2.0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 2.4, 12]} />
              <meshStandardMaterial {...DARK_METAL} />
            </mesh>
            {/* Muzzle brake */}
            <mesh position={[0, 0, 3.25]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.04, 0.15, 12, 1]} />
              <meshStandardMaterial {...DARK_METAL} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
