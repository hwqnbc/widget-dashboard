import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Group } from 'three'
import type { CombatState } from './combatModel'
import { MAX_ENEMY_PROJECTILES } from './combatModel'

const FORWARD = new Vector3(0, 0, 1)

/**
 * Rooftop-soldier rockets in flight. Enemy projectiles tagged `visual ===
 * 'rocket'` (spawned by a Bazooka Joe soldier's `SOLDIER_ROCKET` weapon) are
 * drawn here instead of as a tracer box (Tracers skips them): a small opaque
 * warhead with a glowing exhaust and a fading smoke streak, oriented along its
 * velocity — so the shot reads as a rocket flying in that you can see and
 * dodge. A fixed pool of groups (sized to the enemy projectile pool) is
 * allocated once; each frame the active rocket projectiles are assigned to
 * slots and spare slots hidden. One draw group per rocket; matte
 * `meshStandardMaterial` only (low-spec, no transmission).
 */
export default function EnemyRockets({ combat }: { combat: CombatState }) {
  const groupRefs = useRef<(Group | null)[]>([])
  const temps = useMemo(() => ({ quat: new Quaternion(), dir: new Vector3() }), [])

  useFrame(() => {
    const { quat, dir } = temps
    let slot = 0
    for (const p of combat.enemy) {
      if (!p.active || p.visual !== 'rocket' || slot >= MAX_ENEMY_PROJECTILES) continue
      const g = groupRefs.current[slot]
      if (g) {
        g.visible = true
        g.position.set(p.pos.x, p.pos.y, p.pos.z)
        dir.set(p.vel.x, p.vel.y, p.vel.z)
        const speed = dir.length()
        if (speed > 0) {
          dir.divideScalar(speed)
          quat.setFromUnitVectors(FORWARD, dir)
          g.quaternion.copy(quat)
        }
      }
      slot++
    }
    for (; slot < MAX_ENEMY_PROJECTILES; slot++) {
      const g = groupRefs.current[slot]
      if (g) g.visible = false
    }
  })

  return (
    <>
      {Array.from({ length: MAX_ENEMY_PROJECTILES }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          visible={false}
        >
          {/* warhead body + nose, pointing +Z (the flight direction) */}
          <mesh position={[0, 0, -0.12]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 0.34, 10]} />
            <meshStandardMaterial color="#3a4048" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.14]} rotation-x={Math.PI / 2}>
            <coneGeometry args={[0.09, 0.22, 10]} />
            <meshStandardMaterial color="#c62828" roughness={0.5} />
          </mesh>
          {/* three tail fins */}
          {[0, 1, 2].map((f) => (
            <mesh key={f} position={[0, 0, -0.28]} rotation-z={(f * Math.PI * 2) / 3}>
              <boxGeometry args={[0.02, 0.16, 0.12]} />
              <meshStandardMaterial color="#2a2f36" roughness={0.7} />
            </mesh>
          ))}
          {/* glowing exhaust at the tail */}
          <mesh position={[0, 0, -0.34]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial
              color="#ffd54f"
              emissive="#ff9800"
              emissiveIntensity={1.6}
              roughness={0.3}
              toneMapped={false}
            />
          </mesh>
          {/* fading smoke streak trailing behind (motion cue) */}
          <mesh position={[0, 0, -0.9]} rotation-x={-Math.PI / 2}>
            <coneGeometry args={[0.11, 1.1, 8, 1, true]} />
            <meshStandardMaterial color="#9aa0a6" transparent opacity={0.28} depthWrite={false} roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  )
}
