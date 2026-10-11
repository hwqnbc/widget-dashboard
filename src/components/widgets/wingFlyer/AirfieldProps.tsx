import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ComponentType } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Color, Float32BufferAttribute, Line, LineBasicMaterial, Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import OperatorFigure from '../droneSim/OperatorFigure'
import type { OperatorState } from '../droneSim/operatorWalk'
import { HOOP_RADIUS, PILOT, STRIP_Y, approachPath } from './islandLayout'
import type { WingSim } from './wingSim'

const HOOP_TUBE = 0.14
const COLOR_ACTIVE = new Color('#ffb300')
const COLOR_DIM = new Color('#8a8f99')
const COLOR_PASSED = new Color('#66bb6a')
const COLOR_MISSED = new Color('#9e9e9e')

/**
 * The airfield's set dressing: the pilot (Player 1's avatar `Model3D` via
 * the Drone Sim's OperatorFigure, standing at the runway's west end facing
 * along it — the hand launch throws from here) and the approach guide: the
 * hoops of both runway ends (one instanced draw) plus a faint line joining
 * each end's hoops, so the glide slope reads from a distance. Colours
 * follow the sim's approach state each frame: the active end's hoops are
 * yellow, the other end's dim grey; a hoop you flew through turns green, a
 * missed one grey (a guide, never a test). The lines are built
 * imperatively (lesson #35).
 */
export default function AirfieldProps({
  operatorModel,
  sim,
}: {
  operatorModel?: ComponentType<{ action?: string }>
  sim: WingSim
}) {
  // A standing operator (never walks here): drone-yaw heading −π/2 faces +X.
  const operator = useRef<OperatorState>({
    x: PILOT.x,
    z: PILOT.z,
    heading: -Math.PI / 2,
    pitch: 0,
    mode: 'idle',
    walkPhase: 0,
  })
  // Instances 0..5 = east-landing hoops (end −1), 6..11 = west (end 1).
  const hoops = useMemo(() => [...approachPath(-1), ...approachPath(1)], [])
  const hoopsRef = useRef<InstancedMesh>(null)
  const lineMats = useRef<LineBasicMaterial[]>([])
  const lines = useMemo(() => {
    return ([-1, 1] as const).map((end) => {
      const pts = approachPath(end)
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3))
      const mat = new LineBasicMaterial({ color: COLOR_ACTIVE, transparent: true, opacity: 0.35 })
      return new Line(geo, mat)
    })
  }, [])
  useLayoutEffect(() => {
    lineMats.current = lines.map((l) => l.material as LineBasicMaterial)
    return () => lines.forEach((l) => (l.geometry.dispose(), (l.material as LineBasicMaterial).dispose()))
  }, [lines])

  useLayoutEffect(() => {
    const mesh = hoopsRef.current
    if (!mesh) return
    const m = new Matrix4()
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const one = new Vector3(1, 1, 1)
    hoops.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new Vector3(p.x, p.y, p.z), q, one)))
    mesh.instanceMatrix.needsUpdate = true
    hoops.forEach((_, i) => mesh.setColorAt(i, COLOR_ACTIVE))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [hoops])

  // Live colours from the approach state (12 instances — trivially cheap).
  const lastKey = useRef('')
  useFrame(() => {
    const mesh = hoopsRef.current
    if (!mesh) return
    const ap = sim.approach
    const key = `${ap.end}:${ap.hoops.join('')}`
    if (key === lastKey.current) return
    lastKey.current = key
    for (let i = 0; i < hoops.length; i++) {
      const end = i < 6 ? -1 : 1
      const idx = i % 6
      let c = COLOR_ACTIVE
      if (ap.end !== null && end !== ap.end) c = COLOR_DIM
      else if (ap.end === end && ap.hoops[idx] === 'passed') c = COLOR_PASSED
      else if (ap.end === end && ap.hoops[idx] === 'missed') c = COLOR_MISSED
      mesh.setColorAt(i, c)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    lineMats.current.forEach((mat, k) => {
      const end = k === 0 ? -1 : 1
      mat.color.copy(ap.end !== null && end !== ap.end ? COLOR_DIM : COLOR_ACTIVE)
      mat.opacity = ap.end !== null && end !== ap.end ? 0.15 : 0.35
    })
  })

  return (
    <>
      {/* OperatorFigure places itself at ground y = 0 — lift it onto the strip. */}
      <group position-y={STRIP_Y}>
        <OperatorFigure operator={operator} visible model={operatorModel} />
      </group>
      <instancedMesh ref={hoopsRef} args={[undefined, undefined, hoops.length]}>
        <torusGeometry args={[HOOP_RADIUS, HOOP_TUBE, 8, 32]} />
        <meshBasicMaterial transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
      {lines.map((l, k) => (
        <primitive key={k} object={l} />
      ))}
    </>
  )
}
