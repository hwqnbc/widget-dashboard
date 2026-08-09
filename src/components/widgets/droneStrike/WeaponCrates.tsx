import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide } from 'three'
import type { Group, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { CrateLoot } from './waveLayout'

/** Runtime crate slot — body-owned shared mutable state (the combat-pool
 * pattern): loaded from the wave spec on each intro, consumed by the rig on
 * pickup (`active = false`), read here every frame. Type-only export keeps
 * this file fast-refreshable. */
export interface CrateState {
  active: boolean
  x: number
  /** Roof height the disc sits on (matches CrateSpec.top). */
  top: number
  z: number
  loot: CrateLoot
}

/** Disc/beacon tint per loot (laser cyan / lob amber / shotgun ember /
 * homing green / heart red / score cache magenta — mirrored by the minimap
 * crate marker). */
const CRATE_COLORS: Record<CrateLoot, string> = {
  laser: '#4fc3f7',
  lob: '#ffd54f',
  shotgun: '#ff7043',
  homing: '#69f0ae',
  heart: '#ff5252',
  score: '#e040fb',
}

/**
 * The rooftop supply crate — the LandingPads disc recipe (circle + pulsing
 * emissive + a tall faint beacon column so it can be spotted across the
 * city), plus a small crate box. Everything is driven from the shared
 * `CrateState` in useFrame (visibility, position, per-loot colour) — zero
 * React renders, the SafePadRing pattern.
 */
export default function WeaponCrates({ crate }: { crate: CrateState }) {
  const groupRef = useRef<Group>(null)
  const discMat = useRef<MeshStandardMaterial>(null)
  const boxMat = useRef<MeshStandardMaterial>(null)
  const beaconMat = useRef<MeshBasicMaterial>(null)
  const lastLoot = useRef<CrateLoot | null>(null)

  useFrame(({ clock }) => {
    const g = groupRef.current
    if (!g) return
    g.visible = crate.active
    if (!crate.active) return
    g.position.set(crate.x, crate.top + 0.02, crate.z)
    if (lastLoot.current !== crate.loot) {
      lastLoot.current = crate.loot
      const tint = CRATE_COLORS[crate.loot]
      discMat.current?.color.set(tint)
      discMat.current?.emissive.set(tint)
      boxMat.current?.emissive.set(tint)
      beaconMat.current?.color.set(tint)
    }
    const pulse = 0.4 + 0.3 * Math.sin(clock.elapsedTime * 3)
    if (discMat.current) discMat.current.emissiveIntensity = pulse
    if (boxMat.current) boxMat.current.emissiveIntensity = pulse * 0.8
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* pickup disc on the roof */}
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.6, 28]} />
        <meshStandardMaterial
          ref={discMat}
          color="#4fc3f7"
          emissive="#4fc3f7"
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* the crate itself */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial ref={boxMat} color="#3a4048" emissive="#4fc3f7" roughness={0.6} />
      </mesh>
      {/* findability beacon column */}
      <mesh position={[0, 13, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 26, 12, 1, true]} />
        <meshBasicMaterial
          ref={beaconMat}
          color="#4fc3f7"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
