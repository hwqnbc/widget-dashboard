import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { Collider, FlightMode, FlightState } from '../droneSim/flightModel'
import { boomClipT, damp } from '../droneSim/flightModel'
import type { AimOffset, StrikeView } from './aimModel'
import { BASE_FOV, ZOOM_FOV, fpvPitchGain } from './aimModel'
import type { AimMode, GimbalState } from './gimbalModel'
import { GIMBAL_PITCH_MAX, GIMBAL_PITCH_MIN } from './gimbalModel'

const UP = new Vector3(0, 1, 0)
const CHASE_OFFSET = new Vector3(0, 2.4, 6)
const FPV_OFFSET = new Vector3(0, 0.06, -0.35)
const CHASE_LAMBDA = 4
const BOOM_MARGIN = 0.4
const MIN_BOOM = 0.8
/** Recoil recovery rate. */
const RECOIL_LAMBDA = 9
/** ADS zoom ease-in/out rate. */
const ZOOM_LAMBDA = 8

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
  zoom,
  flightMode,
  aimMode,
  gimbalRef,
}: {
  view: StrikeView
  flight: FlightState
  aimRef: { current: AimOffset }
  colliders: readonly Collider[]
  /** ADS: ease the fov to the scoped value (FPV only). */
  zoom: boolean
  /** In acro the camera follows the full flight attitude (pitch = aim). */
  flightMode: FlightMode
  /** 'gunner'/'hover' slew the camera with the gimbal; 'gimbal' keeps the
   * camera flight-locked (the reticle moves instead). */
  aimMode: AimMode
  gimbalRef: { current: GimbalState }
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const desired = useRef(new Vector3()).current
  const lookTarget = useRef(new Vector3()).current
  const euler = useRef(new Euler(0, 0, 0, 'YXZ')).current

  useFrame((_, dt) => {
    const aim = aimRef.current
    aim.recoil = damp(aim.recoil, 0, RECOIL_LAMBDA, dt)
    // ADS: ease toward the scoped fov in FPV, back to base otherwise.
    const targetFov = view === 'fp' && zoom ? ZOOM_FOV : BASE_FOV
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = damp(camera.fov, targetFov, ZOOM_LAMBDA, dt)
      if (Math.abs(camera.fov - targetFov) < 0.05) camera.fov = targetFov
      camera.updateProjectionMatrix()
    }
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
    // Gunner/hover: the camera IS the gimbal view (sensor-operator screen);
    // gimbal mode keeps the camera flight-locked and the reticle moves.
    const gimbal = gimbalRef.current
    // Only Gunner/Hover slew the camera; Classic and Reticle keep it
    // flight-locked (Classic's gimbal is 0 anyway).
    const camGimbal = aimMode === 'gunner' || aimMode === 'hover' ? 1 : 0
    const pitch = Math.min(
      GIMBAL_PITCH_MAX,
      Math.max(
        GIMBAL_PITCH_MIN,
        flight.tiltPitch * fpvPitchGain(zoom, flightMode) +
          gimbal.pitch * camGimbal +
          aim.pitch * camGimbal,
      ),
    )
    euler.set(
      pitch + aim.recoil,
      flight.yaw + (gimbal.yaw + aim.yaw) * camGimbal,
      0,
    )
    camera.quaternion.setFromEuler(euler)
  })

  return null
}
