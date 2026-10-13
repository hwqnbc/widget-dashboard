/**
 * Puppy Rescue — the lazy 3D view (three.js / R3F stay in this chunk; the
 * widget loads it through `lazyWithReload`). A pure VIEW: the widget owns
 * the simulation and steps it in its own loop; this reads the live state
 * from `sim` every frame and moves meshes directly (zero React renders
 * while playing).
 *
 * World: 1 unit = 1 maze cell, the maze centred on the origin, map +y (down
 * the map) is world +z (toward the camera). Fixed tilted camera fitted to
 * the whole maze at any aspect — every catcher and cone is always in view.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Vector3 } from 'three'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera } from 'three'
import { WALL_HALF, coneRays, doorOpen, isAlert, type Level, type Mode, type RescueState } from './rescueModel'
import { AlertMark, Blob, Bush, Cage, Catcher, Dog, GoalMarker, GoldKey, Padlock } from './puppyModels'
import { HERO_COAT, PUP_COATS, newAnim } from './puppyLook'
import { themeById, type PuppyTheme, type ThemeId } from './puppyThemes'

export interface SimView {
  level: Level
  /** The mode the widget is set to (the hint replay itself runs Classic). */
  mode: Mode
  s: RescueState
  /** A 💡 Hint replay: the dog is drawn as a see-through ghost. */
  ghost?: boolean
}

export interface PuppyRescue3DProps {
  sim: RefObject<SimView>
  /** Re-mount key — the level id. */
  levelKey: string
  /** Colour theme (floor, surround, pen patch, side light). */
  theme: ThemeId
}

const WALL_H = 0.45
const ELEVATION = (62 * Math.PI) / 180
const RAYS = 33
const CONE_IDLE = new Color('#ff5c8a')
const CONE_HOT = new Color('#ff1f3d')

/** Map → world. */
const wx = (level: Level, x: number) => x - level.cols / 2
const wz = (level: Level, y: number) => y - level.rows / 2
/** Map heading → rotation.y for a model facing +Z. */
const yawOf = (h: number) => Math.PI / 2 - h

function CameraRig({ level }: { level: Level }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
    // Hug the maze: its floor + wall tops, plus headroom only for the door's
    // ▼▼ marker (lesson: empty bands above/below waste a portrait card).
    const hx = level.cols / 2 + 0.08
    const hz = level.rows / 2 + 0.08
    const corners: Vector3[] = []
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [0, 0.5]) corners.push(new Vector3(x, y, z))
    corners.push(new Vector3(level.exitCol + 0.5 - level.cols / 2, 1.3, -hz))
    const dir = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION))
    const look = new Vector3(0, 0, 0)
    const p = new Vector3()
    let d = 15
    for (let k = 0; k < 8; k++) {
      camera.position.copy(look).addScaledVector(dir, d)
      camera.lookAt(look)
      camera.updateMatrixWorld()
      let m = 0
      for (const q of corners) {
        p.copy(q).project(camera)
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
      }
      d *= m / 0.985
    }
    camera.position.copy(look).addScaledVector(dir, d)
    camera.lookAt(look)
    camera.updateMatrixWorld()
  }, [camera, size.width, size.height, level])
  return null
}

/** The space around the maze follows the theme. */
function ClearColor({ color }: { color: string }) {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => gl.setClearColor(color), [gl, color])
  return null
}

function Maze({ level, theme }: { level: Level; theme: PuppyTheme }) {
  const exitX = wx(level, level.exitCol + 0.5)
  const topZ = wz(level, 0)
  return (
    <group>
      {/* floor + a strip of path beyond the door */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[level.cols, 0.04, level.rows]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      <mesh position={[exitX, -0.02, topZ - 0.45]}>
        <boxGeometry args={[1, 0.04, 0.9]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      {level.walls.map(([x1, y1, x2, y2], i) => {
        // The exit door's edge is drawn by <Door>, not as wall.
        if (y1 === 0 && y2 === 0 && x1 <= level.exitCol && x2 >= level.exitCol + 1) {
          const parts: [number, number][] = []
          if (level.exitCol > x1) parts.push([x1, level.exitCol])
          if (x2 > level.exitCol + 1) parts.push([level.exitCol + 1, x2])
          return parts.map(([a, b]) => (
            <mesh key={`${i}-${a}`} position={[wx(level, (a + b) / 2), WALL_H / 2, topZ]}>
              <boxGeometry args={[b - a + 2 * WALL_HALF, WALL_H, 2 * WALL_HALF]} />
              <meshStandardMaterial color="#f5f5fa" roughness={0.8} />
            </mesh>
          ))
        }
        const horiz = y1 === y2
        const len = (horiz ? x2 - x1 : y2 - y1) + 2 * WALL_HALF
        return (
          <mesh key={i} position={[wx(level, (x1 + x2) / 2), WALL_H / 2, wz(level, (y1 + y2) / 2)]}>
            <boxGeometry args={horiz ? [len, WALL_H, 2 * WALL_HALF] : [2 * WALL_HALF, WALL_H, len]} />
            <meshStandardMaterial color="#f5f5fa" roughness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

/** The green double door: closed until the first puppy is freed, then it
 * swings outward and a ▼▼ marker invites you through. */
function Door({ sim }: { sim: RefObject<SimView> }) {
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const open = useRef(0)
  const { level } = sim.current
  useFrame((_, dt) => {
    const want = doorOpen(sim.current.s) ? 1 : 0
    open.current += (want - open.current) * (1 - Math.exp(-6 * Math.min(dt, 0.1)))
    const a = open.current * 1.75
    if (left.current) left.current.rotation.y = a
    if (right.current) right.current.rotation.y = -a
    if (marker.current) marker.current.visible = want === 1 && sim.current.s.status !== 'escaped'
  })
  const panel = (
    <mesh position={[0.24, WALL_H / 2 + 0.03, 0]}>
      <boxGeometry args={[0.46, WALL_H + 0.06, 0.08]} />
      <meshStandardMaterial color="#3cc35a" roughness={0.6} />
    </mesh>
  )
  return (
    <group position={[wx(level, level.exitCol + 0.5), 0, wz(level, 0)]}>
      <group ref={left} position={[-0.5, 0, 0]}>
        {panel}
      </group>
      <group ref={right} position={[0.5, 0, 0]} rotation={[0, 0, 0]}>
        <group scale={[-1, 1, 1]}>{panel}</group>
      </group>
      <group ref={marker} position={[0, 0, -0.1]}>
        <GoalMarker y={0.95} />
      </group>
    </group>
  )
}

/** One catcher: walks its track, swings its net on a catch, wears "?"/"!"
 * — a red "!" while it chases (Arcade), "?" while searching or lured. */
function CatcherActor({ sim, g }: { sim: RefObject<SimView>; g: number }) {
  const ref = useRef<Group>(null)
  const mark = useRef<Group>(null)
  const q = useRef<Group>(null)
  const x = useRef<Group>(null)
  const anim = useMemo(newAnim, [])
  const camera = useThree((s) => s.camera)
  useFrame((_, dt) => {
    const { level, s } = sim.current
    const p = s.guards[g]
    if (!ref.current || !p) return
    ref.current.position.set(wx(level, p.x), 0, wz(level, p.y))
    ref.current.rotation.y = yawOf(p.h)
    const caught = s.status === 'caught' && s.caughtBy === g
    const L = s.lure[g]
    const chase = s.status === 'play' && L !== null && L.mode === 'chase'
    anim.v = s.status === 'play' ? p.v : 0
    anim.swing = caught ? Math.min(1, anim.swing + dt * 4) : 0
    const seeing = (s.seeing >> g) & 1
    // "?" also while a bark has it investigating.
    const lured = s.lure[g] !== null && s.status === 'play'
    if (mark.current) {
      mark.current.visible = caught || ((seeing === 1 || lured) && s.status === 'play')
      mark.current.quaternion.copy(camera.quaternion)
      const k = caught ? 1.3 : chase ? 1.25 : isAlert(L) ? 1.1 : 0.8 + s.meter * 0.6
      mark.current.scale.setScalar(k)
    }
    if (q.current) q.current.visible = !caught && !chase
    if (x.current) x.current.visible = caught || chase
  })
  return (
    <group ref={ref}>
      <Blob r={0.32} />
      <group scale={1.2}>
        <Catcher anim={anim} />
      </group>
      <group ref={mark} position={[0, 1.4, 0]} visible={false}>
        <group ref={q}>
          <AlertMark kind="q" />
        </group>
        <group ref={x} visible={false}>
          <AlertMark kind="x" />
        </group>
      </group>
    </group>
  )
}

/** A catcher's vision cone: a wedge on the floor, its rim clipped by walls
 * with the same rays the detection uses. Hotter while it sees someone. */
function ConeActor({ sim, g }: { sim: RefObject<SimView>; g: number }) {
  const mesh = useRef<Mesh>(null)
  const rays = useMemo(() => new Float32Array(RAYS), [])
  const geom = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array((RAYS + 1) * 3), 3))
    const idx: number[] = []
    for (let i = 1; i < RAYS; i++) idx.push(0, i + 1, i)
    geo.setIndex(idx)
    return geo
  }, [])
  useFrame(() => {
    const { level, s } = sim.current
    const p = s.guards[g]
    if (!p) return
    coneRays(level, p, rays, !s.penOpen)
    const pos = geom.attributes.position as BufferAttribute
    const ox = wx(level, p.x)
    const oz = wz(level, p.y)
    pos.setXYZ(0, ox, 0.012, oz)
    for (let i = 0; i < RAYS; i++) {
      const a = p.h - (37.5 * Math.PI) / 180 + ((75 * Math.PI) / 180) * (i / (RAYS - 1))
      pos.setXYZ(i + 1, ox + Math.cos(a) * rays[i], 0.012, oz + Math.sin(a) * rays[i])
    }
    pos.needsUpdate = true
    geom.computeBoundingSphere()
    const m = mesh.current?.material as MeshBasicMaterial | undefined
    if (m) {
      const hot =
        ((s.seeing >> g) & 1) === 1 || (s.status === 'caught' && s.caughtBy === g) || (s.status === 'play' && isAlert(s.lure[g]))
      m.color.copy(hot ? CONE_HOT : CONE_IDLE)
      m.opacity = hot ? 0.62 : 0.42
    }
  })
  return (
    <mesh ref={mesh} geometry={geom} renderOrder={1}>
      <meshBasicMaterial color={CONE_IDLE} transparent opacity={0.42} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

/** The hero dog — a see-through ghost during a hint replay. */
function HeroActor({ sim }: { sim: RefObject<SimView> }) {
  const ref = useRef<Group>(null)
  const anim = useMemo(newAnim, [])
  const ghostShown = useRef(false)
  useFrame(({ clock }) => {
    const { level, s } = sim.current
    if (!ref.current) return
    const ghost = sim.current.ghost === true
    if (ghost !== ghostShown.current) {
      ghostShown.current = ghost
      ref.current.traverse((o) => {
        const m = (o as Mesh).material as MeshStandardMaterial | undefined
        if (!m || !('opacity' in m)) return
        m.userData.baseOpacity ??= m.opacity
        m.userData.baseTransparent ??= m.transparent
        m.transparent = ghost || (m.userData.baseTransparent as boolean)
        m.opacity = ghost ? 0.45 * (m.userData.baseOpacity as number) : (m.userData.baseOpacity as number)
        m.needsUpdate = true
      })
    }
    ref.current.position.set(wx(level, s.x), 0, wz(level, s.y))
    ref.current.rotation.y = yawOf(s.h)
    anim.v = s.status === 'play' ? s.v : 0
    anim.hop = s.status === 'escaped' ? 1 : 0
    // Caught: a little shiver. Hidden: crouched down into the bush.
    ref.current.position.x += s.status === 'caught' ? Math.sin(clock.elapsedTime * 60) * 0.02 : 0
    ref.current.position.y = s.hidden ? -0.18 : 0
  })
  return (
    <group ref={ref}>
      <Blob r={0.36} ring />
      <group scale={1.35}>
        <Dog coat={HERO_COAT} anim={anim} />
      </group>
    </group>
  )
}

/** A puppy: sits in its cage until freed, then trots in its slot of the
 * line. Cage + marker vanish on release. */
/** A puppy: waits at home (in a cage, or sitting in the pen) until freed,
 * then trots in its slot of the line. Cage + marker vanish on release. */
function PuppyActor({ sim, i }: { sim: RefObject<SimView>; i: number }) {
  const ref = useRef<Group>(null)
  const cage = useRef<Group>(null)
  const sitting = useRef<Group>(null)
  const walking = useRef<Group>(null)
  const anim = useMemo(newAnim, [])
  const { level } = sim.current
  const caged = i < level.cages.length
  const c = caged ? level.cages[i] : level.pen[i - level.cages.length]
  useFrame((_, dt) => {
    const { s } = sim.current
    if (!ref.current) return
    const slot = s.order.indexOf(i)
    const free = slot >= 0 && slot < s.px.length
    if (cage.current) {
      const k = cage.current.scale.x + ((free ? 0 : 1) - cage.current.scale.x) * (1 - Math.exp(-10 * Math.min(dt, 0.1)))
      cage.current.scale.setScalar(k)
      cage.current.visible = k > 0.02
    }
    if (sitting.current) sitting.current.visible = !free
    if (walking.current) walking.current.visible = free
    if (free) {
      ref.current.position.set(wx(level, s.px[slot]), 0, wz(level, s.py[slot]))
      ref.current.rotation.y = yawOf(s.ph[slot])
      anim.v = s.status === 'play' ? s.v : 0
      anim.hop = s.status === 'escaped' ? 1 + slot : 0
    } else {
      ref.current.position.set(wx(level, c.x), 0, wz(level, c.y))
      ref.current.rotation.y = 0
    }
  })
  const coat = PUP_COATS[i % PUP_COATS.length]
  return (
    <>
      {caged && (
        <group position={[wx(level, c.x), 0, wz(level, c.y)]}>
          <group ref={cage}>
            <Cage />
            <GoalMarker y={0.95} />
          </group>
        </group>
      )}
      <group ref={ref}>
        <group scale={caged ? 0.95 : 0.72}>
          <group ref={sitting}>
            <Dog coat={coat} anim={anim} sitting />
          </group>
          <group ref={walking} visible={false}>
            <Blob r={0.26} />
            <Dog coat={coat} anim={anim} seed={i * 1.7} />
          </group>
        </group>
      </group>
    </>
  )
}

/** The gold key on the floor (bobbing, ▼▼ over it), then carried above
 * the dog's head, gone once the padlock opens. */
function KeyActor({ sim }: { sim: RefObject<SimView> }) {
  const ground = useRef<Group>(null)
  const carried = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const { level } = sim.current
  const k = level.key
  useFrame(({ clock }) => {
    const { s } = sim.current
    const t = clock.elapsedTime
    const onFloor = !s.hasKey && !s.penOpen
    if (ground.current) ground.current.visible = onFloor
    if (spin.current) {
      spin.current.rotation.y = t * 1.6
      spin.current.position.y = 0.3 + Math.sin(t * 3) * 0.05
    }
    if (carried.current) {
      carried.current.visible = s.hasKey
      carried.current.position.set(wx(level, s.x), 1.0 + Math.sin(t * 4) * 0.04, wz(level, s.y))
      carried.current.rotation.y = t * 2
    }
  })
  if (!k) return null
  return (
    <>
      <group ref={ground} position={[wx(level, k.x), 0, wz(level, k.y)]}>
        <group ref={spin} scale={1.3}>
          <GoldKey />
        </group>
        <GoalMarker y={0.95} />
      </group>
      <group ref={carried} visible={false} scale={0.9}>
        <GoldKey />
      </group>
    </>
  )
}

/** The padlock edge: lifts and shrinks away when opened; a ▼▼ over it
 * while the dog carries the key. The pen floor is tinted gold. */
function LockActor({ sim, theme }: { sim: RefObject<SimView>; theme: PuppyTheme }) {
  const lock = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const { level } = sim.current
  const L = level.lock
  useFrame((_, dt) => {
    const { s } = sim.current
    if (lock.current) {
      const want = s.penOpen ? 0 : 1
      const k = lock.current.scale.x + (want - lock.current.scale.x) * (1 - Math.exp(-8 * Math.min(dt, 0.1)))
      lock.current.scale.setScalar(k)
      lock.current.position.y = (1 - k) * 0.8
      lock.current.visible = k > 0.02
    }
    if (marker.current) marker.current.visible = s.hasKey && !s.penOpen
  })
  if (!L) return null
  return (
    <>
      {level.pen.map((p, j) =>
        j % 2 === 0 ? (
          <mesh key={j} position={[wx(level, Math.floor(p.x) + 0.5), 0.003, wz(level, p.y)]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.96, 0.96]} />
            <meshBasicMaterial color={theme.pen} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        ) : null,
      )}
      <group position={[wx(level, L.x), 0, wz(level, L.y)]}>
        <group ref={lock}>
          <Padlock horiz={L.horiz} />
        </group>
        <group ref={marker} visible={false}>
          <GoalMarker y={0.95} />
        </group>
      </group>
    </>
  )
}

/** The bark: a yellow ring expanding from where the dog barked. */
function BarkRing({ sim }: { sim: RefObject<SimView> }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const { level, s } = sim.current
    const m = ref.current
    if (!m) return
    const age = s.barkT < 0 ? 9 : s.t - s.barkT
    m.visible = age >= 0 && age < 0.7
    if (!m.visible) return
    const k = 0.3 + (age / 0.7) * 3.7 // grows out to about the hearing range
    m.position.set(wx(level, s.barkX), 0.03, wz(level, s.barkY))
    m.scale.set(k, k, k)
    ;(m.material as MeshBasicMaterial).opacity = 0.7 * (1 - age / 0.7)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.9, 1, 40]} />
      <meshBasicMaterial color="#ffd60a" transparent opacity={0.7} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

export default function PuppyRescue3D({ sim, levelKey, theme: themeId }: PuppyRescue3DProps) {
  const { level } = sim.current
  const theme = themeById[themeId]
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.75]}
      camera={{ fov: 38, position: [0, 12, 8] }}
      style={{ width: '100%', height: '100%' }}
    >
      <ClearColor color={theme.surround} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[3, 10, 6]} intensity={1.4} />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} color={theme.rim} />
      <CameraRig level={level} />
      <group key={levelKey}>
        <Maze level={level} theme={theme} />
        <Door sim={sim} />
        {level.guards.map((_, g) => (
          <ConeActor key={`c${g}`} sim={sim} g={g} />
        ))}
        {level.bushes.map((b, i) => (
          <group key={`b${i}`} position={[wx(level, b.x), 0, wz(level, b.y)]} scale={1.15}>
            <Bush />
          </group>
        ))}
        <LockActor sim={sim} theme={theme} />
        <KeyActor sim={sim} />
        {[...level.cages, ...level.pen].map((_, i) => (
          <PuppyActor key={`p${i}`} sim={sim} i={i} />
        ))}
        {level.guards.map((_, g) => (
          <CatcherActor key={`g${g}`} sim={sim} g={g} />
        ))}
        <HeroActor sim={sim} />
        <BarkRing sim={sim} />
      </group>
    </Canvas>
  )
}
