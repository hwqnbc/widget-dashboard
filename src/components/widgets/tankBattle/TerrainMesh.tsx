import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, Color, Matrix4, PlaneGeometry, Vector3 } from 'three'
import type { InstancedMesh } from 'three'
import type { WorldPalette } from '../droneSim/palettes'
import type { TerrainSpec } from './terrain'
import { TANK_WORLD_HALF, heightAt } from './terrain'

/** Displaced-plane resolution (segments per side). */
const SEGMENTS = 96

/**
 * The battlefield: sky/fog/lights plus ONE displaced plane whose vertices
 * sample the same `heightAt` the physics drives on — rendering and driving
 * can never disagree about the ground. Vertex colours ramp grass → dirt →
 * rock by height and slope (no textures), and the scenery (rocks, trees) is
 * two instanced meshes each. No shadow maps; the tanks carry blob shadows.
 */
export default function TerrainMesh({
  spec,
  palette,
}: {
  spec: TerrainSpec
  palette: WorldPalette
}) {
  const rocksRef = useRef<InstancedMesh>(null)
  const trunksRef = useRef<InstancedMesh>(null)
  const canopiesRef = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(
      TANK_WORLD_HALF * 2,
      TANK_WORLD_HALF * 2,
      SEGMENTS,
      SEGMENTS,
    )
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    const arr = pos.array as Float32Array
    const colors = new Float32Array(pos.count * 3)
    const grass = new Color('#6f9e5f')
    const dirt = new Color('#93805a')
    const rock = new Color('#8a8d90')
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3]
      const z = arr[i * 3 + 2]
      const h = heightAt(spec, x, z)
      arr[i * 3 + 1] = h
      // Slope from neighbouring samples — steep faces read as rock.
      const sx = (heightAt(spec, x + 1, z) - heightAt(spec, x - 1, z)) / 2
      const sz = (heightAt(spec, x, z + 1) - heightAt(spec, x, z - 1)) / 2
      const slope = Math.hypot(sx, sz)
      c.copy(grass)
      c.lerp(dirt, Math.min(1, Math.max(0, h / 9)))
      c.lerp(rock, Math.min(1, Math.max(0, (slope - 0.35) * 2.2)))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    pos.needsUpdate = true
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [spec])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  // Scenery matrices — written once per terrain.
  useLayoutEffect(() => {
    const m = new Matrix4()
    const scale = new Vector3()
    const rocks = rocksRef.current
    if (rocks) {
      spec.rocks.forEach((r, i) => {
        m.makeRotationY(r.rot)
        m.scale(scale.set(r.r, r.r * 0.8, r.r))
        m.setPosition(r.x, heightAt(spec, r.x, r.z) + r.r * 0.25, r.z)
        rocks.setMatrixAt(i, m)
      })
      rocks.instanceMatrix.needsUpdate = true
    }
    const trunks = trunksRef.current
    const canopies = canopiesRef.current
    if (trunks && canopies) {
      spec.trees.forEach((t, i) => {
        const y = heightAt(spec, t.x, t.z)
        m.makeScale(t.s, t.s, t.s)
        m.setPosition(t.x, y + 0.7 * t.s, t.z)
        trunks.setMatrixAt(i, m)
        m.makeScale(t.s, t.s, t.s)
        m.setPosition(t.x, y + 2.1 * t.s, t.z)
        canopies.setMatrixAt(i, m)
      })
      trunks.instanceMatrix.needsUpdate = true
      canopies.instanceMatrix.needsUpdate = true
    }
  }, [spec])

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, 60, 220]} />
      <ambientLight intensity={0.3} />
      <hemisphereLight args={[palette.sky, palette.ground, 0.9]} />
      <directionalLight position={[40, 60, 25]} intensity={palette.sunIntensity} />

      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors />
      </mesh>

      {/* The spawn basin's safe-zone ring lives in TankSafePad (animated). */}
      <instancedMesh
        key={`rocks-${spec.rocks.length}`}
        ref={rocksRef}
        args={[undefined, undefined, spec.rocks.length]}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#7d7f83" flatShading />
      </instancedMesh>

      <instancedMesh
        key={`trunks-${spec.trees.length}`}
        ref={trunksRef}
        args={[undefined, undefined, spec.trees.length]}
      >
        <cylinderGeometry args={[0.16, 0.22, 1.4, 6]} />
        <meshStandardMaterial color="#6d4c33" />
      </instancedMesh>
      <instancedMesh
        key={`canopies-${spec.trees.length}`}
        ref={canopiesRef}
        args={[undefined, undefined, spec.trees.length]}
      >
        <coneGeometry args={[1.1, 2.6, 8]} />
        <meshStandardMaterial color="#3e7042" />
      </instancedMesh>
    </>
  )
}
