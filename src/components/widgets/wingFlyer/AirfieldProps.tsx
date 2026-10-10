import { useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { ComponentType } from 'react'
import OperatorFigure from '../droneSim/OperatorFigure'
import type { OperatorState } from '../droneSim/operatorWalk'
import { PILOT, STRIP_Y, approachPath } from './islandLayout'

/** Approach hoop ring radius / tube, metres. */
const HOOP_R = 3.5
const HOOP_TUBE = 0.12

/**
 * The airfield's set dressing: the pilot (Player 1's avatar `Model3D` via
 * the Drone Sim's OperatorFigure, standing at the runway's west end facing
 * along it — the hand launch throws from here) and the approach-guide
 * hoops drawn from `approachPath` for both runway ends (the same data a
 * future auto-land assist will fly).
 */
export default function AirfieldProps({
  operatorModel,
}: {
  operatorModel?: ComponentType<{ action?: string }>
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
  const hoops = useMemo(() => [...approachPath(-1), ...approachPath(1)], [])
  // One instanced draw for every hoop (performance pass: 12 calls → 1).
  const hoopsRef = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = hoopsRef.current
    if (!mesh) return
    const m = new Matrix4()
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const one = new Vector3(1, 1, 1)
    hoops.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new Vector3(p.x, p.y, p.z), q, one)))
    mesh.instanceMatrix.needsUpdate = true
  }, [hoops])

  return (
    <>
      {/* OperatorFigure places itself at ground y = 0 — lift it onto the strip. */}
      <group position-y={STRIP_Y}>
        <OperatorFigure operator={operator} visible model={operatorModel} />
      </group>
      <instancedMesh ref={hoopsRef} args={[undefined, undefined, hoops.length]}>
        <torusGeometry args={[HOOP_R, HOOP_TUBE, 8, 32]} />
        <meshBasicMaterial color="#ffb300" transparent opacity={0.65} depthWrite={false} />
      </instancedMesh>
    </>
  )
}
