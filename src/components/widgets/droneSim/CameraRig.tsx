import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Vector3 } from 'three'
import type { DroneView, FlightState } from './flightModel'
import { damp } from './flightModel'

const UP = new Vector3(0, 1, 0)
/** Chase camera sits behind/above the drone in its body frame (+Z = behind). */
const CHASE_OFFSET = new Vector3(0, 2.4, 6)
/** FPV camera sits at the nose. */
const FPV_OFFSET = new Vector3(0, 0.06, -0.35)
const CHASE_LAMBDA = 4

/**
 * Drives the default camera each frame. Third-person is a damped follow —
 * the lag makes yaw and speed readable. First-person is rigid at the nose,
 * matching yaw and a fraction of the visual pitch, never roll (nausea).
 */
export default function CameraRig({
  view,
  flight,
}: {
  view: DroneView
  flight: FlightState
}) {
  const camera = useThree((s) => s.camera)
  const desired = useRef(new Vector3()).current
  const lookTarget = useRef(new Vector3()).current
  const euler = useRef(new Euler(0, 0, 0, 'YXZ')).current

  useFrame((_, dt) => {
    if (view === 'tp') {
      desired
        .copy(CHASE_OFFSET)
        .applyAxisAngle(UP, flight.yaw)
      desired.x += flight.pos.x
      desired.y += flight.pos.y
      desired.z += flight.pos.z
      camera.position.x = damp(camera.position.x, desired.x, CHASE_LAMBDA, dt)
      camera.position.y = damp(camera.position.y, desired.y, CHASE_LAMBDA, dt)
      camera.position.z = damp(camera.position.z, desired.z, CHASE_LAMBDA, dt)
      lookTarget.set(flight.pos.x, flight.pos.y + 0.5, flight.pos.z)
      camera.lookAt(lookTarget)
    } else {
      desired
        .copy(FPV_OFFSET)
        .applyAxisAngle(UP, flight.yaw)
      camera.position.set(
        flight.pos.x + desired.x,
        flight.pos.y + desired.y,
        flight.pos.z + desired.z,
      )
      euler.set(flight.tiltPitch * 0.6, flight.yaw, 0)
      camera.quaternion.setFromEuler(euler)
    }
  })

  return null
}
