/**
 * Car Park — the lazy 3D board (three.js / R3F stay in this chunk; the
 * widget loads it through `lazyWithReload`). A pure VIEW: the widget owns
 * the game (move log, clamping, snapping, win) and this renders the same
 * position, feeding drags back through `onBegin` / `onDrag` / `onEnd` in
 * bay units — so 2D and 3D play identically.
 *
 * World: 1 unit = 1 bay, lot centred on the origin, rows run toward the
 * camera (+z), the exit is on the right (+x) of `EXIT_ROW`. Fixed angled
 * camera, refit to the canvas aspect on every resize (no orbit — it would
 * fight the drag).
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import { EXIT_ROW, LOT, occupancy, type Lot, type Move, type Vehicle } from './carParkModel'
import { TARGET_COLOR, vehicleColor } from './palette'
import Vehicle3D from './Vehicle3D'

export interface CarPark3DProps {
  lot: Lot
  pos: readonly number[]
  /** Live drag from the widget (fractional bays). */
  drag: { vi: number; delta: number } | null
  won: boolean
  selected: number | null
  /** Start a drag; false when the widget refuses (won / already dragging). */
  onBegin: (vi: number) => boolean
  onDrag: (deltaBays: number) => void
  onEnd: () => void
  /** Level identity — re-mounts the vehicles instead of gliding them. */
  levelKey: string
  /** DOM wrapper that carries the e2e probe attributes. */
  probeRef: RefObject<HTMLElement | null>
  /** Camera quarter-turns around the lot (0–3); eased between steps. */
  yaw: number
  /** The hinted move, if a hint is showing. */
  hint: Move | null
}

/** Transient scene facts the probe mirrors to the DOM (not React state —
 * they change inside `useFrame`). */
interface SceneFx {
  droveOff: boolean
}

const HALF = LOT / 2
/** Drags intersect a horizontal plane at mid-body height, so the point under
 * the finger stays on the car it grabbed (and e2e can aim exactly). */
const DRAG_Y = 0.3
const DRAG_PLANE = new Plane(new Vector3(0, 1, 0), -DRAG_Y)
const EASE = 16
/** Drive-off: the won car ACCELERATES from rest (bays/s²) and is hidden once
 * it's this far along — past the raised barrier and off the lot. */
const DRIVE_ACCEL = 6
const DRIVE_GONE = LOT + 3
const ELEVATION = (55 * Math.PI) / 180
const LOOK_AT = new Vector3(0, 0, 0)
/** Camera yaw easing rate (≈400 ms to settle a quarter turn). */
const YAW_EASE = 10
const GATE_EASE = 6
const GATE_UP = (80 * Math.PI) / 180
const EXIT_Z = EXIT_ROW + 0.5 - HALF

/** World position of a vehicle's rear corner origin at offset `off`. */
function originOf(v: Vehicle, off: number): [number, number, number] {
  return v.horiz ? [off - HALF, 0, v.lane + 0.5 - HALF] : [v.lane + 0.5 - HALF, 0, off - HALF]
}

/** Keep the whole lot (kerb + exit arrow) in frame at any aspect: walk the
 * camera along its view direction until the bounds fill ~94%. The direction
 * is the 55° elevation vector turned about Y by the eased yaw angle; the fit
 * reruns only while the angle moves or the canvas resizes. */
const CORNERS: Vector3[] = []
for (const x of [-HALF - 0.3, HALF + 0.5])
  for (const z of [-HALF - 0.3, HALF + 0.3]) for (const y of [0, 0.8]) CORNERS.push(new Vector3(x, y, z))

function fitCamera(camera: PerspectiveCamera, angle: number) {
  const c = Math.cos(ELEVATION)
  const dir = new Vector3(Math.sin(angle) * c, Math.sin(ELEVATION), Math.cos(angle) * c)
  const p = new Vector3()
  let d = 12
  for (let k = 0; k < 6; k++) {
    camera.position.copy(LOOK_AT).addScaledVector(dir, d)
    camera.lookAt(LOOK_AT)
    camera.updateMatrixWorld()
    let m = 0
    for (const q of CORNERS) {
      p.copy(q).project(camera)
      m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
    }
    d *= m / 0.94
  }
  camera.position.copy(LOOK_AT).addScaledVector(dir, d)
  camera.lookAt(LOOK_AT)
  camera.updateMatrixWorld()
}

function CameraRig({ yaw }: { yaw: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const angle = useRef(yaw * (Math.PI / 2))
  const dirty = useRef(true)
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
    fitCamera(camera, angle.current)
  }, [camera, size.width, size.height])
  useFrame((_, dt) => {
    const goal = yaw * (Math.PI / 2)
    // Shortest way round (3 → 0 turns a quarter, not three quarters back).
    let diff = goal - angle.current
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    if (Math.abs(diff) < 1e-3) {
      if (dirty.current) {
        angle.current = goal
        fitCamera(camera, angle.current)
        dirty.current = false
      }
      return
    }
    angle.current += diff * (1 - Math.exp(-YAW_EASE * Math.min(dt, 0.1)))
    dirty.current = true
    fitCamera(camera, angle.current)
  })
  return null
}

/** A bobbing marker over the red car — a downward red cone in a white
 * ring. Gentle motion catches the eye without flashing; hidden while the
 * car is dragged or driving off. Low-spec: matte, 8 segments. */
function TargetMarker({ len, visible }: { len: number; visible: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 1.3 + Math.sin(clock.elapsedTime * 3) * 0.1
  })
  return (
    <group ref={ref} position={[len / 2, 1.3, 0]} visible={visible}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.26, 0.5, 8]} />
        <meshStandardMaterial color={TARGET_COLOR} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.27, 0.045, 6, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
    </group>
  )
}

const HINT_COLOR = '#ffc400'

/** The hint in 3D: a translucent ghost of the hinted car at its destination
 * bays, and a yellow arrow bobbing above the car pointing the way to slide.
 * Unlit + transparent (low-spec, no emissive). */
function HintGhost({ lot, pos, hint }: { lot: Lot; pos: readonly number[]; hint: Move }) {
  const arrow = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (arrow.current) arrow.current.position.y = 1.05 + Math.sin(clock.elapsedTime * 4) * 0.08
  })
  const [vi, d] = hint
  const v = lot.vehicles[vi]
  const along = (off: number) => {
    const [x, , z] = originOf(v, off)
    return v.horiz ? ([x + v.len / 2, z] as const) : ([x, z + v.len / 2] as const)
  }
  const [gx, gz] = along(pos[vi] + d)
  const [cx, cz] = along(pos[vi])
  const sx = v.horiz ? v.len - 0.12 : 0.88
  const sz = v.horiz ? 0.88 : v.len - 0.12
  // Cone points +Y by default; tip it along the move.
  const s = Math.sign(d)
  const rot: [number, number, number] = v.horiz ? [0, 0, -s * (Math.PI / 2)] : [s * (Math.PI / 2), 0, 0]
  return (
    <group>
      <mesh position={[gx, 0.3, gz]}>
        <boxGeometry args={[sx, 0.5, sz]} />
        <meshBasicMaterial color={HINT_COLOR} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={arrow} position={[cx, 1.05, cz]}>
        <mesh rotation={rot}>
          <coneGeometry args={[0.2, 0.45, 8]} />
          <meshStandardMaterial color={HINT_COLOR} roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

/** Is the target car's path to the exit clear (every exit-row bay ahead of
 * its nose empty)? Drives the barrier. */
function pathClear(lot: Lot, pos: readonly number[]): boolean {
  const grid = occupancy(lot, pos)
  for (let c = pos[0] + lot.vehicles[0].len; c < LOT; c++) if (grid[EXIT_ROW * LOT + c] !== -1) return false
  return true
}

/** Boom barrier across the exit gap: a post on the kerb just below the gap
 * and a red/white striped arm hinged on it, lifted while `open`. */
function ExitGate({ open }: { open: boolean }) {
  const arm = useRef<Group>(null)
  const want = useRef(open)
  want.current = open
  useFrame((_, dt) => {
    const g = arm.current
    if (!g) return
    const goal = want.current ? GATE_UP : 0
    g.rotation.x += (goal - g.rotation.x) * (1 - Math.exp(-GATE_EASE * Math.min(dt, 0.1)))
  })
  const x = HALF + 0.125
  const hingeZ = EXIT_Z + 0.62
  return (
    <group position={[x, 0, hingeZ]}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
        <meshStandardMaterial color="#eceff1" roughness={0.7} />
      </mesh>
      <group ref={arm} position={[0, 0.42, 0]}>
        {Array.from({ length: 5 }, (_, k) => (
          <mesh key={k} position={[0, 0, -0.12 - k * 0.22]}>
            <boxGeometry args={[0.06, 0.06, 0.22]} />
            <meshStandardMaterial color={k % 2 === 0 ? TARGET_COLOR : '#fafafa'} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Throttled DOM mirror for e2e (single owner of these attributes, lesson
 * #46): a frame counter, and per vehicle its screen-space TRACK — the
 * projected drag-plane point at every offset its lane allows — so a test
 * can drag a real 3D car to an exact bay. */
function Probe({
  probeRef,
  lot,
  pos,
  gateOpen,
  won,
  fx,
  hint,
}: {
  probeRef: RefObject<HTMLElement | null>
  lot: Lot
  pos: readonly number[]
  gateOpen: boolean
  won: boolean
  fx: RefObject<SceneFx>
  hint: Move | null
}) {
  const frames = useRef(0)
  const latest = useRef({ lot, pos, gateOpen, won, hint })
  latest.current = { lot, pos, gateOpen, won, hint }
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame(() => {
    frames.current += 1
    if (frames.current % 10 !== 0) return
    const el = probeRef.current
    if (!el) return
    el.setAttribute('data-frames', String(frames.current))
    const { lot: l, pos: p, gateOpen: gate, won: w } = latest.current
    el.setAttribute('data-gate', gate ? 'open' : 'closed')
    el.setAttribute('data-lights', w ? 'on' : 'off')
    el.setAttribute('data-drove-off', fx.current.droveOff ? '1' : '0')
    const h = latest.current.hint
    el.setAttribute('data-hint', h ? `${h[0]}:${h[1]}` : '')
    const v3 = new Vector3()
    const out = l.vehicles.map((v, i) => {
      const track: [number, number][] = []
      for (let off = 0; off + v.len <= LOT; off++) {
        const [x, , z] = originOf(v, off)
        v3.set(v.horiz ? x + v.len / 2 : x, DRAG_Y, v.horiz ? z : z + v.len / 2).project(camera)
        track.push([
          Math.round(((v3.x + 1) / 2) * size.width),
          Math.round(((1 - v3.y) / 2) * size.height),
        ])
      }
      return { i, off: p[i], track }
    })
    el.setAttribute('data-vehicles', JSON.stringify(out))
  })
  return null
}

function VehicleNode({
  v,
  vi,
  off,
  instant,
  driveOff,
  fx,
  selected,
  interactive,
  hinted,
  onBegin,
  onDrag,
  onEnd,
}: {
  hinted: boolean
  v: Vehicle
  vi: number
  off: number
  instant: boolean
  /** Won target car: accelerate out through the exit instead of easing. */
  driveOff: boolean
  fx: RefObject<SceneFx>
  selected: boolean
  interactive: boolean
  onBegin: (vi: number) => boolean
  onDrag: (d: number) => void
  onEnd: () => void
}) {
  const ref = useRef<Group>(null)
  const placed = useRef(false)
  const target = useRef({ off, instant, driveOff })
  target.current = { off, instant, driveOff }
  // Mounted already won (reload / level revisit): the car is simply gone.
  const goneAtMount = useRef(driveOff)
  const vel = useRef(0)
  const grab = useRef<{ pointerId: number; start: number } | null>(null)
  const hit = useMemo(() => new Vector3(), [])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const t = target.current
    const [x, , z] = originOf(v, t.off)
    if (t.driveOff) {
      if (goneAtMount.current) {
        g.visible = false
        fx.current.droveOff = true
        return
      }
      if (!placed.current) {
        g.position.set(x, 0, z)
        placed.current = true
      }
      const step = Math.min(dt, 0.1)
      vel.current += DRIVE_ACCEL * step
      g.position.x += vel.current * step
      if (g.position.x > DRIVE_GONE - HALF) {
        g.visible = false
        fx.current.droveOff = true
      }
      return
    }
    // Not (or no longer) driving off — e.g. Reset after a win.
    goneAtMount.current = false
    vel.current = 0
    g.visible = true
    // Only the target car owns the drive-off flag (every node runs this).
    if (vi === 0) fx.current.droveOff = false
    if (!placed.current || t.instant) {
      g.position.set(x, 0, z)
      placed.current = true
      return
    }
    const k = 1 - Math.exp(-EASE * Math.min(dt, 0.1))
    g.position.x += (x - g.position.x) * k
    g.position.z += (z - g.position.z) * k
  })

  const along = (e: ThreeEvent<PointerEvent>): number | null =>
    e.ray.intersectPlane(DRAG_PLANE, hit) ? (v.horiz ? hit.x : hit.z) : null

  const release = (e: ThreeEvent<PointerEvent>) => {
    const g = grab.current
    if (!g || e.pointerId !== g.pointerId) return
    grab.current = null
    const t = e.target as unknown as Element
    if (t.hasPointerCapture?.(e.pointerId)) t.releasePointerCapture(e.pointerId)
    onEnd()
  }

  return (
    <group
      ref={ref}
      rotation={[0, v.horiz ? 0 : -Math.PI / 2, 0]}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!interactive || grab.current) return
        const a = along(e)
        if (a === null || !onBegin(vi)) return
        ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
        grab.current = { pointerId: e.pointerId, start: a }
      }}
      onPointerMove={(e) => {
        const g = grab.current
        if (!g || e.pointerId !== g.pointerId) return
        e.stopPropagation()
        const a = along(e)
        if (a !== null) onDrag(a - g.start)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <Vehicle3D
        len={v.len}
        color={vehicleColor(v, vi)}
        selected={selected}
        lightsOn={driveOff}
        target={vi === 0}
      />
      {vi === 0 && <TargetMarker len={v.len} visible={!driveOff && !instant && !hinted} />}
    </group>
  )
}

function Lot3D({ lot, gateOpen }: { lot: Lot; gateOpen: boolean }) {
  const kerbH = 0.2
  const K = 0.25
  const exitZ = EXIT_ROW + 0.5 - HALF
  const lines = []
  for (let k = 1; k < LOT; k++) {
    lines.push(
      <mesh key={`x${k}`} position={[k - HALF, 0.003, 0]}>
        <boxGeometry args={[0.025, 0.006, LOT]} />
        <meshStandardMaterial color="#9aa4ab" roughness={1} />
      </mesh>,
      <mesh key={`z${k}`} position={[0, 0.003, k - HALF]}>
        <boxGeometry args={[LOT, 0.006, 0.025]} />
        <meshStandardMaterial color="#9aa4ab" roughness={1} />
      </mesh>,
    )
  }
  const kerb = (key: string, x: number, z: number, w: number, d: number) => (
    <mesh key={key} position={[x, kerbH / 2, z]}>
      <boxGeometry args={[w, kerbH, d]} />
      <meshStandardMaterial color="#37474f" roughness={0.9} />
    </mesh>
  )
  const edge = HALF + K / 2
  // Right kerb split around the exit gap (the exit row spans z ∈ [exitZ±0.5]).
  const topLen = exitZ - 0.5 + HALF
  const botLen = HALF - (exitZ + 0.5)
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[LOT + 2 * K, 0.1, LOT + 2 * K]} />
        <meshStandardMaterial color="#37474f" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.01, 0]}>
        <boxGeometry args={[LOT, 0.02, LOT]} />
        <meshStandardMaterial color="#5f6b73" roughness={0.95} />
      </mesh>
      {/* the goal lane: a faint red tint along the exit row */}
      <mesh position={[K / 2, 0.004, exitZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LOT + K, 1]} />
        <meshBasicMaterial color={TARGET_COLOR} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {/* the exit gap's floor + a red chevron beyond it */}
      <mesh position={[edge, -0.01, exitZ]}>
        <boxGeometry args={[K, 0.02, 1]} />
        <meshStandardMaterial color="#5f6b73" roughness={0.95} />
      </mesh>
      <mesh position={[HALF + K + 0.18, 0.01, exitZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 3]} />
        <meshStandardMaterial color={TARGET_COLOR} roughness={0.8} />
      </mesh>
      {lines}
      {kerb('t', 0, -edge, LOT + 2 * K, K)}
      {kerb('b', 0, edge, LOT + 2 * K, K)}
      {kerb('l', -edge, 0, K, LOT)}
      {kerb('r1', edge, -HALF + topLen / 2, K, topLen)}
      {kerb('r2', edge, HALF - botLen / 2, K, botLen)}
      <ExitGate open={gateOpen} />
      {lot.walls.map((w) => (
        <mesh key={`w${w}`} position={[(w % LOT) + 0.5 - HALF, 0.25, Math.floor(w / LOT) + 0.5 - HALF]}>
          <boxGeometry args={[0.9, 0.5, 0.9]} />
          <meshStandardMaterial color="#263238" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export default function CarPark3D(props: CarPark3DProps) {
  const { lot, pos, drag, won, selected, onBegin, onDrag, onEnd, levelKey, probeRef, yaw, hint } = props
  const fx = useRef<SceneFx>({ droveOff: false })
  const gateOpen = won || pathClear(lot, pos)
  return (
    <Canvas
      frameloop="always"
      dpr={[1, 1.75]}
      camera={{ fov: 40, position: [0, 9, 7] }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 9, 6]} intensity={1.5} />
      <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#93c5fd" />
      <CameraRig yaw={yaw} />
      <Probe probeRef={probeRef} lot={lot} pos={pos} gateOpen={gateOpen} won={won} fx={fx} hint={hint} />
      {hint && !drag && <HintGhost lot={lot} pos={pos} hint={hint} />}
      <Lot3D lot={lot} gateOpen={gateOpen} />
      <group key={levelKey}>
        {lot.vehicles.map((v, vi) => {
          const dragging = drag?.vi === vi
          const off = pos[vi] + (dragging ? drag.delta : 0)
          return (
            <VehicleNode
              key={v.id}
              v={v}
              vi={vi}
              off={off}
              instant={dragging}
              driveOff={won && vi === 0}
              fx={fx}
              selected={selected === vi && !won}
              interactive={!won}
              hinted={hint?.[0] === vi}
              onBegin={onBegin}
              onDrag={onDrag}
              onEnd={onEnd}
            />
          )
        })}
      </group>
    </Canvas>
  )
}
