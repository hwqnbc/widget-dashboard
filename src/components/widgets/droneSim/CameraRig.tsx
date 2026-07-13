import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import type { Collider, DroneView, FlightState } from './flightModel'
import { OPERATOR, OPERATOR_EYE_HEIGHT, boomClipT, damp } from './flightModel'

const UP = new Vector3(0, 1, 0)
/** Chase camera sits behind/above the drone in its body frame (+Z = behind). */
const CHASE_OFFSET = new Vector3(0, 2.4, 6)
/** FPV camera sits at the nose. */
const FPV_OFFSET = new Vector3(0, 0.06, -0.35)
const CHASE_LAMBDA = 4
const BASE_FOV = 60
/** Boom clamp: stop short of the wall so the near plane (0.1) never clips it,
 * but never pull all the way into the drone. */
const BOOM_MARGIN = 0.4
const MIN_BOOM = 0.8
const BOOM_TICK_MS = 150
/** LOS head turn: quick but human, not servo-rigid. */
const LOS_LOOK_LAMBDA = 10
/** LOS zoom: narrow the fov with distance so the drone stays legible —
 * the "squint/binocular" feel of watching your drone across the park. */
const LOS_FOV_MAX = 65
const LOS_FOV_MIN = 22
const LOS_FOV_LAMBDA = 3

/**
 * Drives the default camera each frame. Third-person is a damped follow —
 * the lag makes yaw and speed readable. First-person is rigid at the nose,
 * matching yaw and a fraction of the visual pitch, never roll (nausea).
 * Line-of-sight plants the eye at the operator figure beside the pad and
 * tracks the drone with damped look + distance zoom.
 */
export default function CameraRig({
  view,
  flight,
  colliders,
  hudRef,
}: {
  view: DroneView
  flight: FlightState
  colliders: readonly Collider[]
  /** HUD element; the rig mirrors the live chase-boom length onto its
   * `data-boom` attribute (throttled), same pattern as DroneRig's telemetry. */
  hudRef: RefObject<HTMLDivElement | null>
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const desired = useRef(new Vector3()).current
  const lookTarget = useRef(new Vector3()).current
  const euler = useRef(new Euler(0, 0, 0, 'YXZ')).current
  const lastBoomWrite = useRef(0)

  useFrame((_, dt) => {
    if (view === 'los') {
      camera.position.set(OPERATOR.x, OPERATOR_EYE_HEIGHT, OPERATOR.z)
      lookTarget.x = damp(lookTarget.x, flight.pos.x, LOS_LOOK_LAMBDA, dt)
      lookTarget.y = damp(lookTarget.y, flight.pos.y, LOS_LOOK_LAMBDA, dt)
      lookTarget.z = damp(lookTarget.z, flight.pos.z, LOS_LOOK_LAMBDA, dt)
      camera.lookAt(lookTarget)
      const dist = Math.hypot(
        flight.pos.x - OPERATOR.x,
        flight.pos.y - OPERATOR_EYE_HEIGHT,
        flight.pos.z - OPERATOR.z,
      )
      const targetFov = Math.min(
        LOS_FOV_MAX,
        Math.max(LOS_FOV_MIN, LOS_FOV_MAX - dist * 0.55),
      )
      camera.fov = damp(camera.fov, targetFov, LOS_FOV_LAMBDA, dt)
      camera.updateProjectionMatrix()
      return
    }
    // Leaving LOS: ease the zoom back to the shared base fov.
    if (Math.abs(camera.fov - BASE_FOV) > 0.01) {
      camera.fov = damp(camera.fov, BASE_FOV, 8, dt)
      if (Math.abs(camera.fov - BASE_FOV) < 0.05) camera.fov = BASE_FOV
      camera.updateProjectionMatrix()
    }
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
      // Wall avoidance: sweep drone -> camera against the building colliders
      // and pull the boom in ahead of the first hit. Clamping the *damped*
      // position guarantees no wall between drone and camera every frame;
      // when the obstruction clears, the damper re-extends the boom itself.
      const bx = camera.position.x - flight.pos.x
      const by = camera.position.y - flight.pos.y
      const bz = camera.position.z - flight.pos.z
      let boom = Math.hypot(bx, by, bz)
      const t = boomClipT(flight.pos, camera.position, colliders)
      if (t < 1 && boom > 0) {
        const clamped = Math.max(MIN_BOOM, t * boom - BOOM_MARGIN)
        const scale = clamped / boom
        camera.position.set(
          flight.pos.x + bx * scale,
          flight.pos.y + by * scale,
          flight.pos.z + bz * scale,
        )
        boom = clamped
      }
      const now = performance.now()
      if (now - lastBoomWrite.current >= BOOM_TICK_MS) {
        lastBoomWrite.current = now
        hudRef.current?.setAttribute('data-boom', boom.toFixed(1))
      }
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
