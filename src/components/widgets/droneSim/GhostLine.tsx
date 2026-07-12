import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
} from 'three'

/**
 * The best lap's flight path as a translucent line. Built imperatively and
 * mounted via <primitive> because the lowercase <line> JSX element collides
 * with the SVG intrinsic in TypeScript. Re-created only when a new best lap
 * is persisted.
 */
export default function GhostLine({
  path,
  color,
}: {
  /** Flat [x0, y0, z0, x1, y1, z1, …] triples from the persisted best run. */
  path: readonly number[]
  color: string
}) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(Float32Array.from(path), 3),
    )
    const material = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
    })
    return new Line(geometry, material)
  }, [path, color])

  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
    },
    [line],
  )

  if (path.length < 6) return null
  return <primitive object={line} />
}
