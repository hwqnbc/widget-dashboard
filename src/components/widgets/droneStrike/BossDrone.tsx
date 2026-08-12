import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { Color } from 'three'
import { createControlInput } from '../droneSim/flightModel'
import type { Vec3 } from '../droneSim/flightModel'
import DroneModel from '../droneSim/DroneModel'
import type { TargetState } from './waveLayout'
import { BOSS_POD_COUNT, BOSS_POD_RADIUS, podCenter } from './bossModel'

/** The gunship is this many times a normal drone — the silhouette IS the
 * warning (its hull hit sphere is BOSS_RADIUS 2.2 to match). */
const HULL_SCALE = 3.2
/** Pod colours: a live weak point glows, a blown one is dead metal. */
const POD_LIVE = '#ffd54f'
const POD_DEAD = '#37474f'
const WHITE = new Color('#ffffff')
/** Pod placement origin — the pods are positioned in the boss group's LOCAL
 * frame, which is unrotated, so `podCenter` can be called with a zero centre
 * and its output used verbatim (see below). */
const LOCAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * The boss gunship (one per boss wave). An oversized dark quadcopter hull
 * yawing into its slow orbit, ringed by three **weak-point pods** — the only
 * places a shot does damage (the hull deflects; see bossModel + StrikeRig).
 *
 * The pods are positioned every frame by the SAME `podCenter` the rig's
 * `podHitAt` resolves against, from the same `podPhase` — and deliberately in
 * the boss group's unrotated local frame (only the hull child takes the
 * travel yaw), so no rotation convention can drift the drawn pods away from
 * the hittable ones. A live pod glows and flashes on a hit; a destroyed one
 * goes dark, shrinks and is inert. Matte materials only (low-spec rule).
 */
export default function BossDrone({ targets }: { targets: readonly TargetState[] }) {
  const groupRef = useRef<Group>(null)
  const hullRef = useRef<Group>(null)
  const podRefs = useRef<(Mesh | null)[]>([])
  // Rotors idle at hover speed — the model reads throttle from controls.
  const neutral = useRef(createControlInput()).current
  const podPos = useRef<Vec3>({ x: 0, y: 0, z: 0 }).current

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    let boss: TargetState | null = null
    for (const t of targets) {
      if (t.alive && t.kind === 'boss') {
        boss = t
        break
      }
    }
    if (!boss) {
      g.visible = false
      return
    }
    g.visible = true
    g.position.set(boss.pos.x, boss.pos.y, boss.pos.z)
    const hull = hullRef.current
    // Only the hull turns — nose (-Z at yaw 0) into the direction of travel.
    if (hull && (boss.vel.x !== 0 || boss.vel.z !== 0)) {
      hull.rotation.y = Math.atan2(-boss.vel.x, -boss.vel.z)
    }
    for (let i = 0; i < BOSS_POD_COUNT; i++) {
      const pod = podRefs.current[i]
      if (!pod) continue
      podCenter(i, LOCAL_ORIGIN, boss.podPhase, podPos)
      pod.position.set(podPos.x, podPos.y, podPos.z)
      const live = boss.podHp[i] > 0
      const mat = pod.material as MeshBasicMaterial
      mat.color.set(live ? POD_LIVE : POD_DEAD)
      // A hit flashes the live pods — it reads as the airframe ringing.
      if (live && boss.hitFlash > 0) mat.color.lerp(WHITE, Math.min(1, boss.hitFlash * 5))
      pod.scale.setScalar(live ? 1 : 0.7)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <group ref={hullRef} scale={HULL_SCALE}>
        <DroneModel controls={neutral} />
      </group>
      {Array.from({ length: BOSS_POD_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            podRefs.current[i] = el
          }}
        >
          <sphereGeometry args={[BOSS_POD_RADIUS, 16, 12]} />
          <meshBasicMaterial color={POD_LIVE} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
