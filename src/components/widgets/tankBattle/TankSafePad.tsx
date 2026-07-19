import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'
import type { TerrainSpec } from './terrain'
import { TANK_SPAWN, heightAt } from './terrain'
import { SAFE_ZONE_RADIUS } from './tankModel'

const IDLE_COLOR = new Color('#4dd0e1')
const ACTIVE_COLOR = new Color('#66bb6a')

/**
 * The spawn basin's safe-zone marker (the Drone Strike SafePadRing, ported
 * to the heightfield): a pulsing ring at the zone edge plus a faint light
 * column marking the volume. Idle it breathes cyan; while the player rests
 * inside (the rig writes `stateRef`) it turns green and pulses faster.
 * Pure imperative material writes — the state ref crosses the canvas
 * without React.
 */
export default function TankSafePad({
  stateRef,
  terrain,
}: {
  stateRef: { current: 'idle' | 'active' }
  terrain: TerrainSpec
}) {
  const ringRef = useRef<Mesh>(null)
  const beamRef = useRef<Mesh>(null)
  const padY = heightAt(terrain, TANK_SPAWN.x, TANK_SPAWN.z)

  useFrame(({ clock }) => {
    const active = stateRef.current === 'active'
    const t = clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * (active ? 5 : 1.8))
    const ring = ringRef.current
    if (ring) {
      const mat = ring.material as MeshBasicMaterial
      mat.color.copy(active ? ACTIVE_COLOR : IDLE_COLOR)
      mat.opacity = active ? 0.55 + 0.35 * pulse : 0.28 + 0.22 * pulse
      const s = 1 + (active ? 0.05 : 0.03) * pulse
      ring.scale.set(s, s, 1)
    }
    const beam = beamRef.current
    if (beam) {
      const mat = beam.material as MeshBasicMaterial
      mat.color.copy(active ? ACTIVE_COLOR : IDLE_COLOR)
      mat.opacity = active ? 0.09 + 0.06 * pulse : 0.03 + 0.02 * pulse
    }
  })

  return (
    <>
      <mesh
        ref={ringRef}
        rotation-x={-Math.PI / 2}
        position={[TANK_SPAWN.x, padY + 0.08, TANK_SPAWN.z]}
      >
        <ringGeometry args={[SAFE_ZONE_RADIUS - 0.6, SAFE_ZONE_RADIUS, 56]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
      {/* Open-ended light column marking the safe-zone volume. */}
      <mesh ref={beamRef} position={[TANK_SPAWN.x, padY + 4, TANK_SPAWN.z]}>
        <cylinderGeometry
          args={[SAFE_ZONE_RADIUS, SAFE_ZONE_RADIUS, 8, 40, 1, true]}
        />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </>
  )
}
