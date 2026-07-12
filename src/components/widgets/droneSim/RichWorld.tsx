import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4 } from 'three'
import type { InstancedMesh } from 'three'
import { WORLD_HALF } from './flightModel'
import type { WorldLayout } from './worldLayout'

const ROAD_WIDTH = 3
const ROAD_COLOR = '#3c4043'
const TRUNK_COLOR = '#6d4c33'
const CANOPY_COLOR = '#3f7d3a'
const CAR_COLORS = ['#e53935', '#fdd835', '#e0e0e0', '#42a5f5']
const CLOUD_DRIFT = 0.8

const tmpMatrix = new Matrix4()
const tmpColor = new Color()

/**
 * The optional scenery layer: roads with moving traffic dots, instanced
 * trees, rooftop details on tall buildings, and slowly drifting clouds.
 * Everything comes pre-generated (seeded) from buildWorldLayout, so a
 * course looks identical on every load; only traffic and clouds animate,
 * each as a single instanced mesh whose matrices update per frame.
 */
export default function RichWorld({ layout }: { layout: WorldLayout }) {
  const { trees, roads, traffic, clouds, roofs, buildings } = layout
  const trunksRef = useRef<InstancedMesh>(null)
  const canopiesRef = useRef<InstancedMesh>(null)
  const roofsRef = useRef<InstancedMesh>(null)
  const trafficRef = useRef<InstancedMesh>(null)
  const cloudsRef = useRef<InstancedMesh>(null)

  // Static instances: trees + roof details, written once per layout.
  useLayoutEffect(() => {
    const trunks = trunksRef.current
    const canopies = canopiesRef.current
    if (trunks && canopies) {
      trees.forEach((t, i) => {
        const trunkH = 0.5 + t.h * 0.25
        tmpMatrix.makeScale(0.18, trunkH, 0.18)
        tmpMatrix.setPosition(t.x, trunkH / 2, t.z)
        trunks.setMatrixAt(i, tmpMatrix)
        tmpMatrix.makeScale(t.r, t.h, t.r)
        tmpMatrix.setPosition(t.x, trunkH + t.h / 2 - 0.1, t.z)
        canopies.setMatrixAt(i, tmpMatrix)
        canopies.setColorAt(i, tmpColor.set(CANOPY_COLOR).multiplyScalar(t.shade))
      })
      trunks.instanceMatrix.needsUpdate = true
      canopies.instanceMatrix.needsUpdate = true
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
    }
    const roofMesh = roofsRef.current
    if (roofMesh) {
      roofs.forEach((r, i) => {
        const b = buildings[r.building]
        if (r.kind === 'antenna') {
          tmpMatrix.makeScale(0.1, 2.4, 0.1)
          tmpMatrix.setPosition(b.x, b.h + 1.2, b.z)
        } else {
          tmpMatrix.makeScale(0.9, 0.9, 0.9)
          tmpMatrix.setPosition(b.x + b.w * 0.2, b.h + 0.45, b.z - b.d * 0.2)
        }
        roofMesh.setMatrixAt(i, tmpMatrix)
      })
      roofMesh.instanceMatrix.needsUpdate = true
    }
    const cars = trafficRef.current
    if (cars) {
      traffic.forEach((c, i) => {
        cars.setColorAt(i, tmpColor.set(CAR_COLORS[Math.floor(c.hue * CAR_COLORS.length)]))
      })
      if (cars.instanceColor) cars.instanceColor.needsUpdate = true
    }
  }, [trees, roofs, traffic, buildings])

  // Animated instances: traffic slides along its road, clouds drift and wrap.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const cars = trafficRef.current
    if (cars) {
      traffic.forEach((c, i) => {
        const span = WORLD_HALF * 2
        const raw = c.offset + c.dir * c.speed * t
        const along = ((raw % span) + span) % span - WORLD_HALF
        const road = roads[c.road]
        const lane = road.at + (c.dir > 0 ? 0.8 : -0.8)
        tmpMatrix.makeScale(0.7, 0.35, 0.7)
        if (road.axis === 'x') tmpMatrix.setPosition(along, 0.25, lane)
        else tmpMatrix.setPosition(lane, 0.25, along)
        cars.setMatrixAt(i, tmpMatrix)
      })
      cars.instanceMatrix.needsUpdate = true
    }
    const puffs = cloudsRef.current
    if (puffs) {
      clouds.forEach((c, i) => {
        const span = 150
        const raw = c.x + 75 + CLOUD_DRIFT * t
        const x = (raw % span) - 75
        for (let p = 0; p < 3; p++) {
          const s = c.scale * (p === 1 ? 1.3 : 0.9)
          tmpMatrix.makeScale(s * 3, s, s * 2)
          tmpMatrix.setPosition(x + (p - 1) * c.scale * 2, c.y + (p === 1 ? 0.4 : 0), c.z + (p - 1) * 0.8)
          puffs.setMatrixAt(i * 3 + p, tmpMatrix)
        }
      })
      puffs.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {roads.map((r, i) => (
        <mesh
          key={i}
          rotation-x={-Math.PI / 2}
          position={r.axis === 'x' ? [0, 0.015, r.at] : [r.at, 0.015, 0]}
        >
          <planeGeometry
            args={
              r.axis === 'x'
                ? [WORLD_HALF * 2, ROAD_WIDTH]
                : [ROAD_WIDTH, WORLD_HALF * 2]
            }
          />
          <meshStandardMaterial color={ROAD_COLOR} />
        </mesh>
      ))}

      <instancedMesh ref={trunksRef} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
      </instancedMesh>
      <instancedMesh ref={canopiesRef} args={[undefined, undefined, trees.length]}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={roofsRef} args={[undefined, undefined, roofs.length]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        <meshStandardMaterial color="#78909c" />
      </instancedMesh>

      <instancedMesh ref={trafficRef} args={[undefined, undefined, traffic.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>

      <instancedMesh ref={cloudsRef} args={[undefined, undefined, clouds.length * 3]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.8} depthWrite={false} />
      </instancedMesh>
    </>
  )
}
