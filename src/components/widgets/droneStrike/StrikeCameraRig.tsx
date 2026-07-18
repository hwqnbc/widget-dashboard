import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { Collider, FlightState } from '../droneSim/flightModel'
import { boomClipT, damp } from '../droneSim/flightModel'
import type { AimOffset, StrikeView } from './aimModel'
import { FPV_PITCH_GAIN } from './aimModel'

const UP = new Vector3(0, 1, 0)
const CHASE_OFFSET = new Vector3(0, 2.4, 6)
const FPV_OFFSET = new Vector3(0, 0.06, -0.35)
const CHASE_LAMBDA = 4
const BOOM_MARGIN = 0.4
const MIN_BOOM = 0.8
/** Recoil recovery rate. */
const RECOIL_LAMBDA = 9

/**
 * Drives the camera each frame. FPV is rigid at the nose — yaw + a gentle
 * pitch follow + the shared aim offset (gyro + recoil). Third-person is the
 * drone sim's damped chase with the wall-avoiding boom clip.
 */
export default function StrikeCameraRig({
  view,
  flight,
  aimRef,
  colliders,
}: {
  view: StrikeView
  flight: FlightState
  aimRef: { current: AimOffset }
  colliders: readonly Collider[]
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const desired = useRef(new Vector3()).current
  const lookTarget = useRef(new Vector3()).current
  const euler = useRef(new Euler(0, 0, 0, 'YXZ')).current

  useFrame((_, dt) => {
    const aim = aimRef.current
    aim.recoil = damp(aim.recoil, 0, RECOIL_LAMBDA, dt)
    if (view === 'tp') {
      desired.copy(CHASE_OFFSET).applyAxisAngle(UP, flight.yaw)
      desired.x += flight.pos.x
      desired.y += flight.pos.y
      desired.z += flight.pos.z
      camera.position.x = damp(camera.position.x, desired.x, CHASE_LAMBDA, dt)
      camera.position.y = damp(camera.position.y, desired.y, CHASE_LAMBDA, dt)
      camera.position.z = damp(camera.position.z, desired.z, CHASE_LAMBDA, dt)
      // Wall avoidance: sweep drone → camera and pull the boom in ahead of
      // the first building hit (see droneSim/CameraRig for the reasoning).
      const bx = camera.position.x - flight.pos.x
      const by = camera.position.y - flight.pos.y
      const bz = camera.position.z - flight.pos.z
      const boom = Math.hypot(bx, by, bz)
      const t = boomClipT(flight.pos, camera.position, colliders)
      if (t < 1 && boom > 0) {
        const clamped = Math.max(MIN_BOOM, t * boom - BOOM_MARGIN)
        const scale = clamped / boom
        camera.position.set(
          flight.pos.x + bx * scale,
          flight.pos.y + by * scale,
          flight.pos.z + bz * scale,
        )
      }
      lookTarget.set(flight.pos.x, flight.pos.y + 0.5, flight.pos.z)
      camera.lookAt(lookTarget)
      return
    }
    desired.copy(FPV_OFFSET).applyAxisAngle(UP, flight.yaw)
    camera.position.set(
      flight.pos.x + desired.x,
      flight.pos.y + desired.y,
      flight.pos.z + desired.z,
    )
    euler.set(
      flight.tiltPitch * FPV_PITCH_GAIN + aim.pitch + aim.recoil,
      flight.yaw + aim.yaw,
      0,
    )
    camera.quaternion.setFromEuler(euler)
  })

  return null
}
