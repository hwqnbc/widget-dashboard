/**
 * Puppy Rescue's low-poly models — game-local (not avatars), built from a
 * handful of boxes/spheres with matte materials so several can render at
 * once (the low-spec convention: no transmission, no emissive, few
 * segments). Every model faces +Z with its feet on y = 0; the scene turns
 * and moves the wrapping group, and drives the walk cycle through the
 * mutable `anim` object (no React renders per frame).
 *
 * Lives in the lazy 3D chunk — never import this from the widget shell.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { DoubleSide } from 'three'
import { GAIT_RATE, GAIT_STRIDE } from '../characters/shared/legGait'
import type { Anim, Coat } from './puppyLook'

const mat = (color: string) => <meshStandardMaterial color={color} roughness={0.85} />

/** Diagonal-pair trot: one hip angle per pair. */
function trot(phase: number, v: number) {
  const amp = GAIT_STRIDE * 0.8 * Math.min(1, v / 1.2)
  return Math.sin(phase) * amp
}

/**
 * A dog: chunky body, big head, floppy ears, wagging tail, four legs that
 * trot in diagonal pairs (the shared leg-gait rig's hip-pivot convention,
 * on four legs). `sitting` folds the back legs (a caged puppy).
 */
/** Dalmatian spots, half-sunk into the body / head box faces and squashed
 * flat along each face's normal: [x, y, z, scaleX, scaleY, scaleZ]. */
const BODY_SPOTS: [number, number, number, number, number, number][] = [
  [0.04, 0.34, 0.08, 1, 0.35, 1],
  [-0.05, 0.34, -0.06, 1.2, 0.35, 1],
  [0.03, 0.34, -0.14, 0.8, 0.35, 0.8],
  [0.12, 0.27, 0.04, 0.35, 1, 1],
  [0.12, 0.2, -0.1, 0.35, 0.8, 0.8],
  [-0.12, 0.25, 0.1, 0.35, 0.9, 0.9],
  [-0.12, 0.21, -0.12, 0.35, 1, 1.1],
]
const HEAD_SPOTS: [number, number, number, number, number, number][] = [
  [0.06, 0.12, -0.03, 1, 0.35, 1],
  [-0.05, 0.12, 0.05, 0.8, 0.35, 0.8],
  [0.13, 0.03, -0.06, 0.35, 0.9, 0.9],
]

export function Dog({
  coat,
  anim,
  sitting = false,
  seed = 0,
}: {
  coat: Coat
  anim: Anim
  sitting?: boolean
  /** Walk-cycle start offset, so a line of puppies doesn't step in unison. */
  seed?: number
}) {
  const legs = useRef<(Group | null)[]>([])
  const tail = useRef<Group>(null)
  const body = useRef<Group>(null)
  const phase = useRef(seed)
  useFrame((st, dt) => {
    const d = Math.min(dt, 0.1)
    phase.current += anim.v * d * GAIT_RATE * 4.5
    const s = sitting ? 0 : trot(phase.current, anim.v)
    const L = legs.current
    if (L[0]) L[0].rotation.x = s
    if (L[3]) L[3].rotation.x = s
    if (L[1]) L[1].rotation.x = -s
    if (L[2]) L[2].rotation.x = -s
    const t = st.clock.elapsedTime
    if (tail.current) tail.current.rotation.y = Math.sin(t * (anim.v > 0.1 || anim.hop ? 18 : 7)) * 0.6
    if (body.current)
      body.current.position.y =
        Math.abs(Math.sin(phase.current)) * 0.02 * Math.min(1, anim.v) +
        (anim.hop ? Math.abs(Math.sin(t * 9 + anim.hop)) * 0.12 : 0)
  })
  // Hip pivots: front at +z, back at -z; the leg mesh hangs below.
  const hips: [number, number, number][] = [
    [-0.08, 0.15, 0.12],
    [0.08, 0.15, 0.12],
    [-0.08, 0.15, -0.12],
    [0.08, 0.15, -0.12],
  ]
  return (
    <group ref={body}>
      <group rotation={[sitting ? -0.45 : 0, 0, 0]} position={[0, sitting ? 0.04 : 0, sitting ? -0.04 : 0]}>
        <mesh position={[0, 0.24, 0]}>
          <boxGeometry args={[0.24, 0.2, 0.36]} />
          {mat(coat.body)}
        </mesh>
        {coat.saddle && (
          <mesh position={[0, 0.342, -0.01]}>
            <boxGeometry args={[0.2, 0.008, 0.3]} />
            {mat(coat.saddle)}
          </mesh>
        )}
        {coat.belly && (
          <mesh position={[0, 0.137, 0]}>
            <boxGeometry args={[0.2, 0.012, 0.3]} />
            {mat(coat.belly)}
          </mesh>
        )}
        {coat.spots &&
          BODY_SPOTS.map(([x, y, z, sx, sy, sz], i) => (
            <mesh key={i} position={[x, y, z]} scale={[sx, sy, sz]}>
              <sphereGeometry args={[0.034, 8, 6]} />
              {mat(coat.spots!)}
            </mesh>
          ))}
        <group ref={tail} position={[0, 0.31, -0.18]}>
          <mesh position={[0, 0.06, -0.05]} rotation={[0.8, 0, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.16]} />
            {mat(coat.ears)}
          </mesh>
          {coat.tailTip && (
            <mesh position={[0, 0.115, -0.105]} rotation={[0.8, 0, 0]}>
              <boxGeometry args={[0.056, 0.056, 0.05]} />
              {mat(coat.tailTip)}
            </mesh>
          )}
        </group>
      </group>
      {hips.map((p, i) => (
        <group
          key={i}
          ref={(g) => {
            legs.current[i] = g
          }}
          position={p}
          rotation={[sitting && i >= 2 ? -1.2 : 0, 0, 0]}
        >
          <mesh position={[0, -0.075, 0]}>
            <boxGeometry args={[0.07, 0.15, 0.07]} />
            {mat(coat.body)}
          </mesh>
          {coat.paws && (
            <mesh position={[0, -0.125, 0]}>
              <boxGeometry args={[0.076, 0.05, 0.076]} />
              {mat(coat.paws)}
            </mesh>
          )}
        </group>
      ))}
      <group position={[0, sitting ? 0.46 : 0.4, sitting ? 0.16 : 0.2]}>
        <mesh>
          <boxGeometry args={[0.26, 0.24, 0.24]} />
          {mat(coat.body)}
        </mesh>
        <mesh position={[0, -0.05, 0.14]}>
          <boxGeometry args={[0.13, 0.1, 0.1]} />
          {mat(coat.snout)}
        </mesh>
        <mesh position={[0, -0.02, 0.2]}>
          <sphereGeometry args={[0.03, 8, 6]} />
          {mat('#1d1b22')}
        </mesh>
        {coat.saddle && (
          <mesh position={[0, 0.122, -0.03]}>
            <boxGeometry args={[0.2, 0.006, 0.17]} />
            {mat(coat.saddle)}
          </mesh>
        )}
        {coat.mask && (
          <mesh position={[0, -0.015, 0.122]}>
            <boxGeometry args={[0.2, 0.13, 0.006]} />
            {mat(coat.mask)}
          </mesh>
        )}
        <mesh position={[-0.065, 0.04, 0.122]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          {mat(coat.eyes ?? '#1d1b22')}
        </mesh>
        <mesh position={[0.065, 0.04, 0.122]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          {mat(coat.eyes ?? '#1d1b22')}
        </mesh>
        {coat.brows &&
          [-0.065, 0.065].map((x) => (
            <mesh key={x} position={[x, 0.085, 0.121]}>
              <sphereGeometry args={[0.017, 8, 6]} />
              {mat(coat.brows!)}
            </mesh>
          ))}
        {coat.spots &&
          HEAD_SPOTS.map(([x, y, z, sx, sy, sz], i) => (
            <mesh key={i} position={[x, y, z]} scale={[sx, sy, sz]}>
              <sphereGeometry args={[0.03, 8, 6]} />
              {mat(coat.spots!)}
            </mesh>
          ))}
        <mesh position={[-0.15, -0.02, 0]} rotation={[0, 0, 0.25]}>
          <boxGeometry args={[0.06, 0.2, 0.12]} />
          {mat(coat.ears)}
        </mesh>
        <mesh position={[0.15, -0.02, 0]} rotation={[0, 0, -0.25]}>
          <boxGeometry args={[0.06, 0.2, 0.12]} />
          {mat(coat.ears)}
        </mesh>
      </group>
    </group>
  )
}

const CATCHER_BODY = '#2b2552'
const CATCHER_SKIN = '#f1c9a0'

/** A dog catcher: round dark body, white collar, a hat, and a red-handled
 * net held up in the right hand — swung down on a catch. */
export function Catcher({ anim }: { anim: Anim }) {
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const arm = useRef<Group>(null)
  const phase = useRef(0)
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    phase.current += anim.v * d * GAIT_RATE * 3
    const s = Math.sin(phase.current) * GAIT_STRIDE * Math.min(1, anim.v / 1.2)
    if (legL.current) legL.current.rotation.x = s
    if (legR.current) legR.current.rotation.x = -s
    // Net held high (-0.5 rad); a catch swings it down past horizontal.
    if (arm.current) arm.current.rotation.x = -0.5 + anim.swing * 2.1
  })
  return (
    <group>
      {[legL, legR].map((ref, i) => (
        <group key={i} ref={ref} position={[i ? 0.09 : -0.09, 0.16, 0]}>
          <mesh position={[0, -0.08, 0]}>
            <boxGeometry args={[0.09, 0.16, 0.09]} />
            {mat('#1b1838')}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.2, 0.25, 0.42, 12]} />
        {mat(CATCHER_BODY)}
      </mesh>
      <mesh position={[0, 0.57, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.04, 6, 14]} />
        {mat('#ffffff')}
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.15, 12, 10]} />
        {mat(CATCHER_SKIN)}
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.16, 0.17, 0.14, 12]} />
        {mat(CATCHER_BODY)}
      </mesh>
      <mesh position={[0, 0.76, 0.02]}>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 12]} />
        {mat(CATCHER_BODY)}
      </mesh>
      {/* the net arm: pivot at the right shoulder */}
      <group ref={arm} position={[0.24, 0.5, 0.04]}>
        <mesh position={[0, 0.2, 0.06]} rotation={[0.3, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.46, 6]} />
          {mat('#e53935')}
        </mesh>
        <group position={[0, 0.44, 0.14]} rotation={[0.3, 0, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.12, 0.018, 6, 14]} />
            {mat('#ffffff')}
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.12, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={1} transparent opacity={0.55} side={DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** A see-through cage (bars only — no glass, which would mean transmission). */
export function Cage() {
  const C = '#d6ebff'
  const S = 0.36
  const H = 0.62
  const bars = []
  for (let k = -2; k <= 2; k++) {
    const o = (k / 2.5) * S
    bars.push([o, S], [o, -S], [S, o], [-S, o])
  }
  return (
    <group>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[S * 2 + 0.06, 0.03, S * 2 + 0.06]} />
        {mat('#9aa6ff')}
      </mesh>
      {[
        [S, S],
        [S, -S],
        [-S, S],
        [-S, -S],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, H / 2, z]}>
          <boxGeometry args={[0.06, H, 0.06]} />
          {mat(C)}
        </mesh>
      ))}
      {bars.map(([x, z], i) => (
        <mesh key={`b${i}`} position={[x, H / 2, z]}>
          <boxGeometry args={[0.025, H, 0.025]} />
          {mat(C)}
        </mesh>
      ))}
      {[
        [0, S, S * 2 + 0.06, 0.05],
        [0, -S, S * 2 + 0.06, 0.05],
        [S, 0, 0.05, S * 2 + 0.06],
        [-S, 0, 0.05, S * 2 + 0.06],
      ].map(([x, z, w, d], i) => (
        <mesh key={`t${i}`} position={[x, H, z]}>
          <boxGeometry args={[w, 0.05, d]} />
          {mat(C)}
        </mesh>
      ))}
    </group>
  )
}

/** The green ▼▼ marker that bobs over a goal. */
export function GoalMarker({ y = 1 }: { y?: number }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = y + Math.sin(clock.elapsedTime * 3) * 0.06
  })
  return (
    <group ref={ref}>
      {[0, 0.22].map((dy) => (
        <mesh key={dy} position={[0, dy, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.13, 0.16, 3]} />
          <meshStandardMaterial color="#34d058" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** The "?" (suspicious, yellow) / "!" (caught, red) bubble over a catcher.
 * Built from primitives (no font). The caller billboards and shows it. */
export function AlertMark({ kind }: { kind: 'q' | 'x' }) {
  const color = kind === 'x' ? '#ff3b30' : '#ffd60a'
  const m = <meshStandardMaterial color={color} roughness={0.5} />
  if (kind === 'x')
    return (
      <group>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.07, 0.2, 0.07]} />
          {m}
        </mesh>
        <mesh position={[0, -0.06, 0]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          {m}
        </mesh>
      </group>
    )
  return (
    <group>
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[0.07, 0.028, 6, 12, Math.PI * 1.5]} />
        {m}
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.05, 0.08, 0.05]} />
        {m}
      </mesh>
      <mesh position={[0, -0.07, 0]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        {m}
      </mesh>
    </group>
  )
}

/** A soft dark disc under a figure (no real shadows — low-spec). */
export function Blob({ r = 0.22, ring = false, ringColor = '#4a3fb8' }: { r?: number; ring?: boolean; ringColor?: string }) {
  const ref = useRef<Mesh>(null)
  return (
    <mesh ref={ref} position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[r, 20]} />
      <meshBasicMaterial color={ring ? ringColor : '#000000'} transparent opacity={ring ? 0.7 : 0.22} depthWrite={false} />
    </mesh>
  )
}

const GOLD = '#f5b301'
const GOLD_DARK = '#c98a00'

/** The gold key: a ring bow, a shaft and two teeth, lying flat-ish. */
export function GoldKey() {
  return (
    <group>
      <mesh position={[-0.16, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.04, 8, 16]} />
        <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0.06, 0, 0]}>
        <boxGeometry args={[0.3, 0.05, 0.06]} />
        <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.3} />
      </mesh>
      {[0.12, 0.2].map((x) => (
        <mesh key={x} position={[x, 0, 0.06]}>
          <boxGeometry args={[0.04, 0.05, 0.08]} />
          <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** The golden padlock that seals the pen: bars across the gap plus a fat
 * lock body. The scene lifts it away when it opens. `horiz`: the edge runs
 * along x (else along z). */
export function Padlock({ horiz }: { horiz: boolean }) {
  return (
    <group rotation={[0, horiz ? 0 : Math.PI / 2, 0]}>
      {[-0.35, -0.12, 0.12, 0.35].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.05, 0.44, 0.05]} />
          <meshStandardMaterial color={GOLD_DARK} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.96, 0.05, 0.06]} />
        <meshStandardMaterial color={GOLD_DARK} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.24, 0.06]}>
        <boxGeometry args={[0.3, 0.26, 0.14]} />
        <meshStandardMaterial color={GOLD} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.42, 0.06]}>
        <torusGeometry args={[0.1, 0.03, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#cfd6dd" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.22, 0.135]}>
        <circleGeometry args={[0.035, 10]} />
        <meshStandardMaterial color="#3b2a00" />
      </mesh>
    </group>
  )
}

/** A round leafy bush — a hiding spot. Matte clustered spheres. */
export function Bush() {
  const leaves: [number, number, number, number, string][] = [
    [0, 0.22, 0, 0.3, '#2f9e44'],
    [-0.22, 0.17, 0.08, 0.22, '#37b24d'],
    [0.22, 0.17, 0.06, 0.22, '#2b8a3e'],
    [0.05, 0.16, 0.24, 0.2, '#40c057'],
    [-0.06, 0.16, -0.22, 0.2, '#2f9e44'],
    [0.02, 0.4, 0.02, 0.2, '#51cf66'],
  ]
  return (
    <group>
      {leaves.map(([x, y, z, r, c], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 10, 8]} />
          <meshStandardMaterial color={c} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}
