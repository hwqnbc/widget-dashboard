import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { CombatState, Projectile } from './combatModel'
import { MAX_ENEMY_PROJECTILES, MAX_PLAYER_PROJECTILES } from './combatModel'

const PLAYER_COLOR = new Color('#ffd54f')
const ENEMY_COLOR = new Color('#ff5252')
const FORWARD = new Vector3(0, 0, 1)

/**
 * Every live bolt as one instance of a stretched glowing box, oriented along
 * its velocity — a single draw call for all tracers. Matrices are written
 * imperatively each frame from the projectile pools (dead slots scale to 0);
 * no per-bolt React elements, no allocation in the loop.
 */
export default function Tracers({
  combat,
  tracerLen,
}: {
  combat: CombatState
  tracerLen: number
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const capacity = MAX_PLAYER_PROJECTILES + MAX_ENEMY_PROJECTILES
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
    const write = (p: Projectile, color: Color, len: number) => {
      if (p.active) {
        dir.set(p.vel.x, p.vel.y, p.vel.z)
        const speed = dir.length()
        if (speed > 0) dir.divideScalar(speed)
        quat.setFromUnitVectors(FORWARD, dir)
        // Head of the tracer at the bolt position, tail trailing behind.
        pos.set(
          p.pos.x - dir.x * (len / 2),
          p.pos.y - dir.y * (len / 2),
          p.pos.z - dir.z * (len / 2),
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
    for (const p of combat.player) write(p, PLAYER_COLOR, tracerLen)
    for (const p of combat.enemy) write(p, ENEMY_COLOR, tracerLen * 0.7)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.07, 0.07, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
