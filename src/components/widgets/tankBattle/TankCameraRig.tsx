import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler } from 'three'
import type { PerspectiveCamera } from 'three'
import type { Vec3 } from '../droneSim/flightModel'
import { damp } from '../droneSim/flightModel'
import type { AimOffset } from '../droneStrike/aimModel'
import { BASE_FOV } from '../droneStrike/aimModel'
import type { TerrainSpec } from './terrain'
import { heightAt } from './terrain'
import type { CamAim, TankState } from './tankModel'
import {
  CAM_BOOM,
  CAM_PITCH_MAX,
  CAM_PITCH_MIN,
  CAM_PIVOT_Y,
  camForward,
} from './tankModel'

/** Scoped field of view — a touch tighter than the drone scope (~2.1×). */
export const TANK_ZOOM_FOV = 28
const ZOOM_LAMBDA = 8
const RECOIL_LAMBDA = 7

/**
 * The chase-behind-the-TURRET camera (the tank-game convention: you always
 * look where the gun will converge; hull heading is read from the model and
 * the minimap). Orientation comes straight from the shared aim state
 * (yaw/pitch + gyro offset + recoil), and the eye sits BOOM behind the
 * pivot along that exact direction — so the screen-centre reticle IS the
 * aim ray, with no damping between them to smear it. The boom clamps above
 * the heightfield so a reversing tank can't bury the camera in a hillside.
 */
export default function TankCameraRig({
  tank,
  aim,
  aimOffset,
  terrain,
  zoom,
}: {
  tank: TankState
  aim: CamAim
  aimOffset: { current: AimOffset }
  terrain: TerrainSpec
  zoom: boolean
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const euler = useRef(new Euler(0, 0, 0, 'YXZ')).current
  const fwd = useRef<Vec3>({ x: 0, y: 0, z: -1 }).current

  useFrame((_, dt) => {
    const off = aimOffset.current
    off.recoil = damp(off.recoil, 0, RECOIL_LAMBDA, dt)

    const targetFov = zoom ? TANK_ZOOM_FOV : BASE_FOV
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = damp(camera.fov, targetFov, ZOOM_LAMBDA, dt)
      if (Math.abs(camera.fov - targetFov) < 0.05) camera.fov = targetFov
      camera.updateProjectionMatrix()
    }

    const yaw = aim.yaw + off.yaw
    const pitch = Math.min(
      CAM_PITCH_MAX,
      Math.max(CAM_PITCH_MIN, aim.pitch + off.pitch),
    )
    camForward(yaw, pitch, fwd)

    const px = tank.pos.x
    const py = tank.pos.y + CAM_PIVOT_Y
    const pz = tank.pos.z
    let ex = px - fwd.x * CAM_BOOM
    let ey = py - fwd.y * CAM_BOOM
    let ez = pz - fwd.z * CAM_BOOM

    // Terrain clamp: march eye back toward the pivot until it clears the
    // ground — the heightfield's version of the building boom clip.
    for (let s = 0; s < 6; s++) {
      const ground = heightAt(terrain, ex, ez) + 0.6
      if (ey >= ground) break
      const k = 0.85 - s * 0.1
      ex = px + (ex - px) * k
      ey = py + (ey - py) * k
      ez = pz + (ez - pz) * k
    }
    // Final guarantee even if the march ran out.
    const ground = heightAt(terrain, ex, ez) + 0.5
    if (ey < ground) ey = ground

    camera.position.set(ex, ey, ez)
    euler.set(pitch + off.recoil, yaw, 0)
    camera.quaternion.setFromEuler(euler)
  })

  return null
}
