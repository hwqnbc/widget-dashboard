import { useLayoutEffect, useRef } from 'react'
import { Color, Matrix4 } from 'three'
import type { InstancedMesh } from 'three'
import type { WorldPalette } from './palettes'
import { BUILDINGS, RINGS } from './worldLayout'
import { SPAWN } from './flightModel'

/**
 * The static world: sky, fog, lights, ground, an instanced-mesh city (one
 * draw call for all buildings), the landing pad under the spawn point and a
 * few decorative gate rings. No shadow maps — the drone carries a cheap blob
 * shadow instead (see DroneRig).
 */
export default function WorldScene({ palette }: { palette: WorldPalette }) {
  const buildingsRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = buildingsRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    const color = new Color()
    const base = new Color(palette.building)
    BUILDINGS.forEach((b, i) => {
      matrix.makeScale(b.w, b.h, b.d)
      matrix.setPosition(b.x, b.h / 2, b.z)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.copy(base).multiplyScalar(b.shade))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [palette.building])

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, 40, 160]} />
      <ambientLight intensity={0.3} />
      <hemisphereLight args={[palette.sky, palette.ground, 0.9]} />
      <directionalLight position={[30, 50, 20]} intensity={1.4} />

      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>
      <gridHelper args={[120, 60, palette.grid, palette.grid]} position={[0, 0.01, 0]} />

      <instancedMesh ref={buildingsRef} args={[undefined, undefined, BUILDINGS.length]}>
        <boxGeometry />
        <meshStandardMaterial />
      </instancedMesh>

      <mesh position={[SPAWN.x, 0.05, SPAWN.z]}>
        <cylinderGeometry args={[2.2, 2.2, 0.1, 32]} />
        <meshStandardMaterial color={palette.pad} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[SPAWN.x, 0.12, SPAWN.z]}>
        <torusGeometry args={[1.5, 0.08, 8, 40]} />
        <meshStandardMaterial color={palette.ring} />
      </mesh>

      {RINGS.map((r, i) => (
        <mesh key={i} position={[r.x, r.y, r.z]} rotation-y={r.yaw}>
          <torusGeometry args={[2.4, 0.12, 10, 40]} />
          <meshStandardMaterial color={palette.ring} />
        </mesh>
      ))}
    </>
  )
}
