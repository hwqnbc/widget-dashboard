import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { Shell, ShellCombat } from './shellModel'
import { MAX_ENEMY_SHELLS, MAX_PLAYER_SHELLS, SHELL } from './shellModel'

const PLAYER_COLOR = new Color('#ffd54f')
const ENEMY_COLOR = new Color('#ff5252')
const FORWARD = new Vector3(0, 0, 1)

/**
 * Every live shell as one instance of a stretched glowing box oriented
 * along its (curving) velocity — the Drone Strike tracer pattern, one draw
 * call for all shells in flight.
 */
export default function ShellTracers({ combat }: { combat: ShellCombat }) {
  const meshRef = useRef<InstancedMesh>(null)
  const capacity = MAX_PLAYER_SHELLS + MAX_ENEMY_SHELLS
  const temps = useMemo(
    () => ({
      matrix: new Matrix4(),
      quat: new Quaternion(),
      dir: new Vector3(),
      pos: new Vector3(),
      scale: new Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { matrix, quat, dir, pos, scale } = temps
    let i = 0
    const write = (s: Shell, color: Color, len: number) => {
      if (s.active) {
        dir.set(s.vel.x, s.vel.y, s.vel.z)
        const speed = dir.length()
        if (speed > 0) dir.divideScalar(speed)
        quat.setFromUnitVectors(FORWARD, dir)
        pos.set(
          s.pos.x - dir.x * (len / 2),
          s.pos.y - dir.y * (len / 2),
          s.pos.z - dir.z * (len / 2),
        )
        scale.set(1, 1, len)
        matrix.compose(pos, quat, scale)
      } else {
        matrix.makeScale(0, 0, 0)
      }
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color)
      i++
    }
    for (const s of combat.player) write(s, PLAYER_COLOR, SHELL.tracerLen)
    for (const s of combat.enemy) write(s, ENEMY_COLOR, SHELL.tracerLen * 0.85)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.12, 0.12, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
