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
import { EXIT_ROW, LOT, type Lot, type Vehicle } from './carParkModel'
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
}

const HALF = LOT / 2
/** Drags intersect a horizontal plane at mid-body height, so the point under
 * the finger stays on the car it grabbed (and e2e can aim exactly). */
const DRAG_Y = 0.3
const DRAG_PLANE = new Plane(new Vector3(0, 1, 0), -DRAG_Y)
/** Where the won target car drives to — well past the exit gap. */
const DRIVE_OUT = LOT + 2.5
const EASE = 16
/** The drive-out eases slower, so it reads as the car pulling away. */
const EASE_OUT = 3
const ELEVATION = (55 * Math.PI) / 180
const LOOK_AT = new Vector3(0, 0, 0.25)

/** World position of a vehicle's rear corner origin at offset `off`. */
function originOf(v: Vehicle, off: number): [number, number, number] {
  return v.horiz ? [off - HALF, 0, v.lane + 0.5 - HALF] : [v.lane + 0.5 - HALF, 0, off - HALF]
}

/** Keep the whole lot (kerb + exit arrow) in frame at any aspect: walk the
 * camera along its fixed view direction until the bounds fill ~94%. */
function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const dir = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION))
    const corners: Vector3[] = []
    for (const x of [-HALF - 0.3, HALF + 0.5])
      for (const z of [-HALF - 0.3, HALF + 0.3]) for (const y of [0, 0.8]) corners.push(new Vector3(x, y, z))
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
    let d = 12
    const p = new Vector3()
    for (let k = 0; k < 6; k++) {
      camera.position.copy(LOOK_AT).addScaledVector(dir, d)
      camera.lookAt(LOOK_AT)
      camera.updateMatrixWorld()
      let m = 0
      for (const c of corners) {
        p.copy(c).project(camera)
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
      }
      d *= m / 0.94
    }
    camera.position.copy(LOOK_AT).addScaledVector(dir, d)
    camera.lookAt(LOOK_AT)
    camera.updateMatrixWorld()
  }, [camera, size.width, size.height])
  return null
}

/** Throttled DOM mirror for e2e (single owner of these attributes, lesson
 * #46): a frame counter, and per vehicle its screen-space TRACK — the
 * projected drag-plane point at every offset its lane allows — so a test
 * can drag a real 3D car to an exact bay. */
function Probe({
  probeRef,
  lot,
  pos,
}: {
  probeRef: RefObject<HTMLElement | null>
  lot: Lot
  pos: readonly number[]
}) {
  const frames = useRef(0)
  const latest = useRef({ lot, pos })
  latest.current = { lot, pos }
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame(() => {
    frames.current += 1
    if (frames.current % 10 !== 0) return
    const el = probeRef.current
    if (!el) return
    el.setAttribute('data-frames', String(frames.current))
    const { lot: l, pos: p } = latest.current
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
  slow,
  selected,
  interactive,
  onBegin,
  onDrag,
  onEnd,
}: {
  v: Vehicle
  vi: number
  off: number
  instant: boolean
  slow: boolean
  selected: boolean
  interactive: boolean
  onBegin: (vi: number) => boolean
  onDrag: (d: number) => void
  onEnd: () => void
}) {
  const ref = useRef<Group>(null)
  const placed = useRef(false)
  const target = useRef({ off, instant, slow })
  target.current = { off, instant, slow }
  const grab = useRef<{ pointerId: number; start: number } | null>(null)
  const hit = useMemo(() => new Vector3(), [])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const [x, , z] = originOf(v, target.current.off)
    if (!placed.current || target.current.instant) {
      g.position.set(x, 0, z)
      placed.current = true
      return
    }
    const k = 1 - Math.exp(-(target.current.slow ? EASE_OUT : EASE) * Math.min(dt, 0.1))
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
      <Vehicle3D len={v.len} color={vehicleColor(v, vi)} selected={selected} />
    </group>
  )
}

function Lot3D({ lot }: { lot: Lot }) {
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
  const { lot, pos, drag, won, selected, onBegin, onDrag, onEnd, levelKey, probeRef } = props
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
      <CameraRig />
      <Probe probeRef={probeRef} lot={lot} pos={pos} />
      <Lot3D lot={lot} />
      <group key={levelKey}>
        {lot.vehicles.map((v, vi) => {
          const dragging = drag?.vi === vi
          const off = won && vi === 0 ? DRIVE_OUT : pos[vi] + (dragging ? drag.delta : 0)
          return (
            <VehicleNode
              key={v.id}
              v={v}
              vi={vi}
              off={off}
              instant={dragging}
              slow={won && vi === 0}
              selected={selected === vi && !won}
              interactive={!won}
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
