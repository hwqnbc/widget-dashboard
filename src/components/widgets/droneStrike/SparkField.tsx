import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Points } from 'three'
import type { SparkPool } from './sparkModel'
import { stepSparks } from './sparkModel'

const sparkVertex = /* glsl */ `
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float uSize;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Size-attenuated, shrinking as it fades (a dying ember).
    gl_PointSize = uSize * (0.4 + 0.6 * alpha) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const sparkFragment = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    if (vAlpha <= 0.0) discard;
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vTint, vAlpha * soft);
  }
`

/**
 * Renders the shared `SparkPool` (muzzle flashes + impact showers) as ONE
 * `<points>` draw call — the EnemyRockets contrail recipe: pool arrays ARE the
 * geometry attributes (mutate + flag needsUpdate, zero per-frame allocation),
 * a tiny inline shader fades/shrinks per particle (`PointsMaterial` can't fade
 * per-vertex), and a custom `tint` attribute carries per-particle colour (the
 * name avoids three's built-in vertex-color plumbing). The rig SPAWNS bursts
 * (fire site + hit events); this component owns aging/physics via
 * `stepSparks` in its own useFrame — the same split EnemyRockets uses.
 */
export default function SparkField({ sparks }: { sparks: SparkPool }) {
  const pointsRef = useRef<Points>(null)
  const uniforms = useMemo(() => ({ uSize: { value: 0.55 } }), [])

  useFrame((_, dt) => {
    stepSparks(sparks, dt)
    const geo = pointsRef.current?.geometry
    if (geo) {
      geo.attributes.position.needsUpdate = true
      geo.attributes.alpha.needsUpdate = true
      geo.attributes.tint.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[sparks.pos, 3]} />
        <bufferAttribute attach="attributes-alpha" args={[sparks.alpha, 1]} />
        <bufferAttribute attach="attributes-tint" args={[sparks.color, 3]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={sparkVertex}
        fragmentShader={sparkFragment}
        transparent
        depthWrite={false}
      />
    </points>
  )
}
