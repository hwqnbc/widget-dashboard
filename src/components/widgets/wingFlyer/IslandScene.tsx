import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, Color, Matrix4, PlaneGeometry } from 'three'
import type { InstancedMesh } from 'three'
import type { WorldPalette } from '../droneSim/palettes'
import type { IslandSpec } from './islandLayout'
import { SEA_LEVEL, STRIP, STRIP_Y, WORLD_HALF, islandHeight } from './islandLayout'

/** Terrain mesh extends past the playable square so the sea reaches the fog. */
const MESH_HALF = WORLD_HALF + 140
/** Displaced-plane resolution (segments per side) — ~9 m cells. */
const SEGMENTS = 128
/** Runway paint: centre-line dashes (every 11 m) + a threshold bar at each
 * end — x offset from the strip centre, width (x) and depth (z). */
const RUNWAY_MARKS = [
  ...Array.from({ length: Math.floor((STRIP.length - 20) / 11) }, (_, i) => ({
    x: -STRIP.length / 2 + 12 + i * 11,
    w: 5,
    d: 0.6,
  })),
  { x: -STRIP.length / 2 + 2, w: 1.5, d: STRIP.width - 4 },
  { x: STRIP.length / 2 - 2, w: 1.5, d: STRIP.width - 4 },
]

/** Fog: near/far, metres — also the main performance lever (far plane). */
export const FOG_NEAR = 220
export const FOG_FAR = 760

/**
 * The island: sky, fog, lights, ONE displaced terrain plane sampling the
 * same `islandHeight` the flight model lands on (vertex-coloured sand →
 * grass → rock, no textures), the sea/lake water plane, the airstrip, and
 * instanced town blocks + trees. No shadow maps (the plane carries a blob
 * shadow) — the render budget in docs/wing-flyer.md §6.
 */
export default function IslandScene({ spec, palette }: { spec: IslandSpec; palette: WorldPalette }) {
  const blocksRef = useRef<InstancedMesh>(null)
  const trunksRef = useRef<InstancedMesh>(null)
  const canopiesRef = useRef<InstancedMesh>(null)
  const marksRef = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(MESH_HALF * 2, MESH_HALF * 2, SEGMENTS, SEGMENTS)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.getAttribute('position')
    const arr = pos.array as Float32Array
    const colors = new Float32Array(pos.count * 3)
    const sand = new Color('#d8c99a')
    const grass = new Color(palette.ground)
    const dark = new Color('#4f7a48')
    const rock = new Color('#8a8d90')
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3]
      const z = arr[i * 3 + 2]
      const h = islandHeight(spec, x, z)
      arr[i * 3 + 1] = h
      const sx = (islandHeight(spec, x + 2, z) - islandHeight(spec, x - 2, z)) / 4
      const sz = (islandHeight(spec, x, z + 2) - islandHeight(spec, x, z - 2)) / 4
      const slope = Math.hypot(sx, sz)
      c.copy(grass)
      c.lerp(dark, Math.min(1, Math.max(0, (h - 12) / 30)))
      c.lerp(rock, Math.min(1, Math.max(0, (slope - 0.45) * 2)))
      // Beaches: a sand band just above the water line.
      c.lerp(sand, Math.min(1, Math.max(0, 1 - (h - SEA_LEVEL) / 2.5)))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    pos.needsUpdate = true
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [spec, palette.ground])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const m = new Matrix4()
    const blocks = blocksRef.current
    if (blocks) {
      spec.buildings.forEach((b, i) => {
        m.makeScale(b.hw * 2, b.h, b.hd * 2)
        m.setPosition(b.x, b.y + b.h / 2, b.z)
        blocks.setMatrixAt(i, m)
      })
      blocks.instanceMatrix.needsUpdate = true
    }
    const trunks = trunksRef.current
    const canopies = canopiesRef.current
    if (trunks && canopies) {
      spec.trees.forEach((t, i) => {
        const y = islandHeight(spec, t.x, t.z)
        m.makeScale(t.s * 2, t.s * 2, t.s * 2)
        m.setPosition(t.x, y + 1.4 * t.s, t.z)
        trunks.setMatrixAt(i, m)
        m.makeScale(t.s * 2.2, t.s * 2.2, t.s * 2.2)
        m.setPosition(t.x, y + 4.4 * t.s, t.z)
        canopies.setMatrixAt(i, m)
      })
      trunks.instanceMatrix.needsUpdate = true
      canopies.instanceMatrix.needsUpdate = true
    }
    // Runway paint — centre-line dashes + both threshold bars, one draw.
    const marks = marksRef.current
    if (marks) {
      RUNWAY_MARKS.forEach((mk, i) => {
        m.makeScale(mk.w, 1, mk.d)
        m.setPosition(STRIP.x + mk.x, STRIP_Y + 0.05, STRIP.z)
        marks.setMatrixAt(i, m)
      })
      marks.instanceMatrix.needsUpdate = true
    }
  }, [spec])

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, FOG_NEAR, FOG_FAR]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={[palette.sky, palette.ground, 0.9]} />
      <directionalLight position={[200, 300, 120]} intensity={palette.sunIntensity} />

      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors />
      </mesh>

      {/* Sea + lake: one plane at sea level; the terrain dips under it. */}
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_LEVEL}>
        <planeGeometry args={[MESH_HALF * 4, MESH_HALF * 4]} />
        <meshStandardMaterial color="#3f7fb0" roughness={0.35} />
      </mesh>

      {/* Airstrip: asphalt slab + centre-line dashes. */}
      <group position={[STRIP.x, STRIP_Y, STRIP.z]}>
        <mesh position-y={0.03} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[STRIP.length, STRIP.width]} />
          <meshStandardMaterial color="#55595e" />
        </mesh>
      </group>
      <instancedMesh ref={marksRef} args={[undefined, undefined, RUNWAY_MARKS.length]}>
        <boxGeometry args={[1, 0.02, 1]} />
        <meshBasicMaterial color="#f2f2f2" />
      </instancedMesh>

      <instancedMesh key={`blocks-${spec.buildings.length}`} ref={blocksRef} args={[undefined, undefined, spec.buildings.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={palette.building} />
      </instancedMesh>
      <instancedMesh key={`trunks-${spec.trees.length}`} ref={trunksRef} args={[undefined, undefined, spec.trees.length]}>
        <cylinderGeometry args={[0.16, 0.22, 1.4, 6]} />
        <meshStandardMaterial color="#6d4c33" />
      </instancedMesh>
      <instancedMesh key={`canopies-${spec.trees.length}`} ref={canopiesRef} args={[undefined, undefined, spec.trees.length]}>
        <coneGeometry args={[1.1, 2.6, 7]} />
        <meshStandardMaterial color="#3e7042" />
      </instancedMesh>
    </>
  )
}
