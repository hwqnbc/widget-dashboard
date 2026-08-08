import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { LaserBeam } from './combatModel'
import { BEAM_LIFE, MAX_BEAMS } from './combatModel'

const FORWARD = new Vector3(0, 0, 1)

/**
 * Draws the laser's fired beams — one InstancedMesh (the Tracers recipe):
 * each live beam is a thin box stretched start→end, oriented by
 * `setFromUnitVectors`, its THICKNESS shrinking with age (instanced meshes
 * can't fade opacity per instance, but a thinning beam reads as a fade).
 * The rig spawns beams on each hitscan shot (`spawnLaserBeam` in
 * combatModel); this component ages them.
 */
export default function LaserBeams({ beams }: { beams: LaserBeam[] }) {
  const meshRef = useRef<InstancedMesh>(null)
  const temps = useMemo(
    () => ({
      mat: new Matrix4(),
      quat: new Quaternion(),
      pos: new Vector3(),
      scl: new Vector3(),
      dir: new Vector3(),
    }),
    [],
  )

  useFrame((_, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const { mat, quat, pos, scl, dir } = temps
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i]
      if (b.active) {
        b.age += dt
        if (b.age >= BEAM_LIFE) b.active = false
      }
      dir.set(b.ex - b.sx, b.ey - b.sy, b.ez - b.sz)
      const len = dir.length()
      if (!b.active || len === 0) {
        mat.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, mat)
        continue
      }
      dir.divideScalar(len)
      quat.setFromUnitVectors(FORWARD, dir)
      pos.set((b.sx + b.ex) / 2, (b.sy + b.ey) / 2, (b.sz + b.ez) / 2)
      const thick = 1 - b.age / BEAM_LIFE
      scl.set(thick, thick, len)
      mat.compose(pos, quat, scl)
      mesh.setMatrixAt(i, mat)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_BEAMS]} frustumCulled={false}>
      <boxGeometry args={[0.05, 0.05, 1]} />
      <meshBasicMaterial color="#7ce8ff" toneMapped={false} />
    </instancedMesh>
  )
}
