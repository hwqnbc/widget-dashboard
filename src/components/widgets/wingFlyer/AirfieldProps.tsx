import { useMemo, useRef } from 'react'
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

  return (
    <>
      {/* OperatorFigure places itself at ground y = 0 — lift it onto the strip. */}
      <group position-y={STRIP_Y}>
        <OperatorFigure operator={operator} visible model={operatorModel} />
      </group>
      {hoops.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[HOOP_R, HOOP_TUBE, 8, 32]} />
          <meshBasicMaterial color="#ffb300" transparent opacity={0.65} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}
