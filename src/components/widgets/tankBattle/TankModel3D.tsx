import { forwardRef } from 'react'
import type { Group } from 'three'
import type { TankColors } from './tankColors'

/**
 * A primitive-built tank, the DroneModel way: hull box between two track
 * boxes, and a `turretRef` group (dome + barrel) the rig rotates
 * independently of the hull — the barrel is a child `barrelRef` group so
 * elevation pivots at the mantlet. The caller owns all posing:
 * outer group = position + hullYaw + terrain pitch/roll, turretRef.rotation.y
 * = traverse (relative to hull), barrelRef.rotation.x = −elevation.
 * `scale` bulks up the heavies.
 */
const TankModel3D = forwardRef<
  Group,
  {
    colors: TankColors
    turretRef?: React.Ref<Group>
    barrelRef?: React.Ref<Group>
    scale?: number
  }
>(function TankModel3D({ colors, turretRef, barrelRef, scale = 1 }, ref) {
  return (
    <group ref={ref} scale={scale}>
      {/* tracks */}
      <mesh position={[-1.05, 0.42, 0]}>
        <boxGeometry args={[0.55, 0.75, 3.7]} />
        <meshStandardMaterial color={colors.track} />
      </mesh>
      <mesh position={[1.05, 0.42, 0]}>
        <boxGeometry args={[0.55, 0.75, 3.7]} />
        <meshStandardMaterial color={colors.track} />
      </mesh>
      {/* hull */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[1.9, 0.65, 3.3]} />
        <meshStandardMaterial color={colors.hull} />
      </mesh>
      {/* glacis hint — a nose wedge marking -Z as forward */}
      <mesh position={[0, 0.78, -1.75]} rotation-x={0.5}>
        <boxGeometry args={[1.7, 0.5, 0.5]} />
        <meshStandardMaterial color={colors.hull} />
      </mesh>
      {/* turret + barrel */}
      <group ref={turretRef} position={[0, 1.28, 0.15]}>
        <mesh>
          <cylinderGeometry args={[0.85, 1.0, 0.55, 12]} />
          <meshStandardMaterial color={colors.turret} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.5, 0.18, 0.7]} />
          <meshStandardMaterial color={colors.turret} />
        </mesh>
        <group ref={barrelRef} position={[0, 0.12, -0.6]}>
          {/* barrel points -Z; pivot sits at the mantlet */}
          <mesh position={[0, 0, -1.15]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.11, 2.3, 10]} />
            <meshStandardMaterial color={colors.track} />
          </mesh>
          <mesh position={[0, 0, -2.28]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.13, 0.13, 0.35, 10]} />
            <meshStandardMaterial color={colors.track} />
          </mesh>
        </group>
      </group>
    </group>
  )
})

export default TankModel3D
