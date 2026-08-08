import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
} from 'three'
import type { Vec3 } from '../droneSim/flightModel'
import type { WeaponSpec } from './combatModel'
import { sampleTrajectory } from './combatModel'

/** Fixed sample budget: 48 pts × 0.08 s covers the lob's full ~3.6 s flight. */
const ARC_PTS = 48
const ARC_DT = 0.08

/** The live aim ray the rig publishes every frame (muzzle origin + fire
 * direction) — shared mutable state, the combat-pool pattern. The body
 * creates it inline (type-only export keeps this file fast-refreshable). */
export interface AimRay {
  origin: Vec3
  dir: Vec3
}

/**
 * Ballistic trajectory hint — a translucent polyline sampled from the SAME
 * integration a live shell flies (`sampleTrajectory`), from the muzzle to the
 * ground/max range. Mounted only while the lob is equipped. Unlike GhostLine
 * (memo-rebuilt on a persisted path), the buffer here is fixed-length and
 * mutated + `setDrawRange`d every frame — the RainField pattern — because the
 * arc follows the aim live. Built imperatively via <primitive> for the same
 * reason as GhostLine (the lowercase <line> JSX collides with the SVG
 * intrinsic). Shows the UNASSISTED ray: aim-assist bend/lead only apply at
 * fire time on a locked target (documented limitation).
 */
export default function TrajectoryArc({ aimRay, weapon }: { aimRay: AimRay; weapon: WeaponSpec }) {
  const { line, positions, attribute } = useMemo(() => {
    const positions = new Float32Array(ARC_PTS * 3)
    const attribute = new Float32BufferAttribute(positions, 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', attribute)
    geometry.setDrawRange(0, 0)
    const material = new LineBasicMaterial({
      color: '#ffd54f',
      transparent: true,
      opacity: 0.5,
    })
    const line = new Line(geometry, material)
    line.frustumCulled = false
    return { line, positions, attribute }
  }, [])

  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
    },
    [line],
  )

  useFrame(() => {
    const n = sampleTrajectory(aimRay.origin, aimRay.dir, weapon, positions, ARC_PTS, ARC_DT)
    attribute.needsUpdate = true
    line.geometry.setDrawRange(0, n)
  })

  return <primitive object={line} />
}
