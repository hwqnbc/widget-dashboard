import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Quaternion, Vector3 } from 'three'
import type { Group, Points } from 'three'
import type { Projectile } from './combatModel'

const FORWARD = new Vector3(0, 0, 1)

// Smoke contrail tuning. Each enemy-pool slot owns a contiguous block of
// PUFFS puffs; puffs are dropped in world space every EMIT_DIST units and fade
// over LIFETIME. PUFFS is sized so a puff ages out before the ring overwrites
// it (PUFFS * EMIT_DIST > LIFETIME * rocket speed ≈ 16).
const PUFFS = 24
const LIFETIME = 1.1
const EMIT_DIST = 0.7
const DEAD_AGE = 999

const smokeVertex = /* glsl */ `
  attribute float alpha;
  varying float vAlpha;
  uniform float uSize;
  void main() {
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Size-attenuated, and grows as it fades (a dissipating puff).
    gl_PointSize = uSize * (2.0 - alpha) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const smokeFragment = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    if (vAlpha <= 0.0) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.1, d);
    gl_FragColor = vec4(uColor, vAlpha * soft * 0.55);
  }
`

/**
 * Rooftop-soldier rockets in flight. Enemy projectiles tagged `visual ===
 * 'rocket'` (spawned by a Bazooka Joe soldier's `SOLDIER_ROCKET` weapon) are
 * drawn here instead of as a tracer box (Tracers skips them): a small opaque
 * warhead with a glowing exhaust oriented along its velocity, plus a
 * **persistent world-space smoke contrail** — puffs dropped at the positions
 * the rocket passed through, left hanging in the air and fading a beat after
 * the rocket moves on, so the shot reads as an incoming missile you can see
 * and dodge.
 *
 * Two render passes, both keyed off ONE projectile pool. Despite the
 * filename, the component is pool-generic — mounted once for the enemy pool
 * (soldier RPGs) and once for the player pool (homing missiles):
 *  - **warheads** — a fixed pool of `<group>`s compacted to active rockets
 *    (render slot shifts as rockets despawn; fine, it's a live body).
 *  - **contrail** — one `<points>` cloud (single draw call). Puffs are keyed by
 *    the **stable pool index** (NOT the render slot), so a slot reused by
 *    a new rocket resets its own block instead of inheriting a stale trail. A
 *    tiny inline shader fades + grows each puff by a per-vertex `alpha`
 *    (`PointsMaterial` can't fade per-vertex). All buffers are pre-allocated
 *    and mutated in place — no per-frame allocation. Low-spec throughout: matte
 *    `meshStandardMaterial` + one additive-free points draw, no transmission.
 */
export default function EnemyRockets({ pool }: { pool: Projectile[] }) {
  const groupRefs = useRef<(Group | null)[]>([])
  const pointsRef = useRef<Points>(null)
  const temps = useMemo(() => ({ quat: new Quaternion(), dir: new Vector3() }), [])
  const slots = pool.length

  // Contrail buffers (allocated once — the pool array identity is stable).
  // positions/alpha ARE the geometry attribute arrays (passed by ref below);
  // mutate + flag needsUpdate.
  const smoke = useMemo(
    () => ({
      positions: new Float32Array(slots * PUFFS * 3),
      alpha: new Float32Array(slots * PUFFS),
      ages: new Float32Array(slots * PUFFS).fill(DEAD_AGE),
      cursor: new Uint16Array(slots),
      lastEmit: new Float32Array(slots * 3),
      wasRocket: new Uint8Array(slots),
    }),
    [slots],
  )
  const uniforms = useMemo(
    () => ({ uSize: { value: 1.2 }, uColor: { value: new Color('#b0b6bc') } }),
    [],
  )

  useFrame((_, dt) => {
    const { quat, dir } = temps
    const { positions, alpha, ages, cursor, lastEmit, wasRocket } = smoke

    // --- warhead bodies (compacted render slots) ---
    let slot = 0
    for (const p of pool) {
      if (!p.active || p.visual !== 'rocket' || slot >= slots) continue
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
    for (let s = slot; s < slots; s++) {
      const g = groupRefs.current[s]
      if (g) g.visible = false
    }

    // --- smoke contrail (keyed by stable enemy-pool index) ---
    const emit = (pi: number, x: number, y: number, z: number) => {
      const idx = pi * PUFFS + cursor[pi]
      positions[idx * 3] = x
      positions[idx * 3 + 1] = y
      positions[idx * 3 + 2] = z
      ages[idx] = 0
      cursor[pi] = (cursor[pi] + 1) % PUFFS
      lastEmit[pi * 3] = x
      lastEmit[pi * 3 + 1] = y
      lastEmit[pi * 3 + 2] = z
    }
    for (let pi = 0; pi < slots; pi++) {
      const p = pool[pi]
      const isRocket = p.active && p.visual === 'rocket'
      if (isRocket && !wasRocket[pi]) {
        // New rocket in this slot: clear any stale trail, start at the muzzle.
        for (let k = 0; k < PUFFS; k++) ages[pi * PUFFS + k] = DEAD_AGE
        cursor[pi] = 0
        emit(pi, p.pos.x, p.pos.y, p.pos.z)
      } else if (isRocket) {
        const ex = p.pos.x - lastEmit[pi * 3]
        const ey = p.pos.y - lastEmit[pi * 3 + 1]
        const ez = p.pos.z - lastEmit[pi * 3 + 2]
        if (ex * ex + ey * ey + ez * ez >= EMIT_DIST * EMIT_DIST) {
          emit(pi, p.pos.x, p.pos.y, p.pos.z)
        }
      }
      wasRocket[pi] = isRocket ? 1 : 0
    }
    // Age + fade every puff (dead rockets' puffs keep fading — lingers).
    const step = Math.min(dt, 0.05)
    for (let j = 0; j < slots * PUFFS; j++) {
      if (ages[j] >= DEAD_AGE) {
        alpha[j] = 0
        continue
      }
      ages[j] += step
      const a = 1 - ages[j] / LIFETIME
      alpha[j] = a > 0 ? a : 0
    }
    const geo = pointsRef.current?.geometry
    if (geo) {
      geo.attributes.position.needsUpdate = true
      geo.attributes.alpha.needsUpdate = true
    }
  })

  return (
    <>
      {Array.from({ length: slots }, (_, i) => (
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
        </group>
      ))}
      {/* persistent world-space smoke contrail — one draw call for all rockets */}
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[smoke.positions, 3]} />
          <bufferAttribute attach="attributes-alpha" args={[smoke.alpha, 1]} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={smokeVertex}
          fragmentShader={smokeFragment}
          transparent
          depthWrite={false}
        />
      </points>
    </>
  )
}
