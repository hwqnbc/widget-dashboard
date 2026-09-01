import { useEffect, useMemo, useRef, type RefObject } from 'react'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import TextSymbol from '@arcgis/core/symbols/TextSymbol'
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D'
import ObjectSymbol3DLayer from '@arcgis/core/symbols/ObjectSymbol3DLayer'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import { buildFlightPath, sampleFlight, type FlightPath } from './flightPathModel'

/** A planted flight waypoint: position + the sampled ground elevation
 * (0 when the elevation service is unreachable). */
export interface FlightGroundPoint {
  lon: number
  lat: number
  ground: number
}

export type FlightAnim = 'idle' | 'playing' | 'paused' | 'done'

/** Drone cruise speed along the path, m/s (a speed setting is backlog). */
export const FLIGHT_SPEED = 20

/** Publish animation progress to the parent at most this often — the loop
 * itself never touches React state per tick. */
const PROGRESS_PUBLISH_MS = 250

const PATH_SYMBOL = new SimpleLineSymbol({ color: [25, 118, 210, 0.9], width: 3 })
const TETHER_SYMBOL = new SimpleLineSymbol({
  color: [25, 118, 210, 0.5],
  width: 1,
  style: 'dash',
})

/** A quadcopter silhouette from ArcGIS primitives (no glTF asset): a flat
 * body puck, four rotor spheres on the diagonals, a beacon on top. All
 * parts are rotation-symmetric enough that the drone needs NO per-frame
 * heading update — only its geometry moves (symbols are immutable, and
 * re-assigning one per tick would rebuild WebGL resources every frame). */
function droneSymbol(): PointSymbol3D {
  const rotor = (x: number, y: number) =>
    new ObjectSymbol3DLayer({
      resource: { primitive: 'sphere' },
      width: 2.4,
      depth: 2.4,
      height: 0.8,
      material: { color: '#37474f' },
      anchor: 'relative',
      anchorPosition: { x, y, z: 0 },
    })
  return new PointSymbol3D({
    symbolLayers: [
      new ObjectSymbol3DLayer({
        resource: { primitive: 'cylinder' },
        width: 5,
        depth: 5,
        height: 1.2,
        material: { color: '#263238' },
      }),
      rotor(1.1, 1.1),
      rotor(-1.1, 1.1),
      rotor(1.1, -1.1),
      rotor(-1.1, -1.1),
      new ObjectSymbol3DLayer({
        resource: { primitive: 'sphere' },
        width: 1.6,
        depth: 1.6,
        height: 1.6,
        material: { color: '#ffb300' },
        anchor: 'bottom',
      }),
    ],
  })
}

/**
 * Owns every graphic of the drone flight tool on its absolute-height layer:
 * numbered waypoint markers with ground tethers, the 3D path line, and the
 * animated drone. The animation loop advances distance by wall-clock dt on
 * a plain interval (never rAF-gated logic, lessons.md #73) and mutates the
 * drone graphic's geometry directly — React state is only touched through
 * the throttled onProgress and the terminal onAnimChange('done').
 */
export default function FlightBinding({
  layerRef,
  points,
  cruise,
  anim,
  resetToken,
  onAnimChange,
  onProgress,
}: {
  layerRef: RefObject<GraphicsLayer | null>
  points: FlightGroundPoint[]
  cruise: number
  anim: FlightAnim
  /** Bumping this parks the drone back at the start with progress 0. */
  resetToken: number
  onAnimChange: (anim: FlightAnim) => void
  onProgress: (t: number) => void
}) {
  const path: FlightPath = useMemo(
    () => buildFlightPath(points.map((p) => ({ lon: p.lon, lat: p.lat, z: p.ground + cruise }))),
    [points, cruise],
  )
  const pathRef = useRef(path)
  pathRef.current = path

  const droneRef = useRef<Graphic | null>(null)
  const distRef = useRef(0)

  // Rebuild the layer's graphics whenever the plan changes; the drone parks
  // at the start and any running animation resets to idle.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.removeAll()
    droneRef.current = null
    distRef.current = 0
    onProgress(0)
    onAnimChange('idle')
    if (points.length === 0) return

    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const z = p.ground + cruise
      const geometry = new Point({ longitude: p.lon, latitude: p.lat, z })
      const attributes = { flightIndex: i }
      layer.add(
        new Graphic({
          geometry: new Polyline({
            hasZ: true,
            paths: [
              [
                [p.lon, p.lat, p.ground],
                [p.lon, p.lat, z],
              ],
            ],
          }),
          symbol: TETHER_SYMBOL,
        }),
      )
      layer.add(
        new Graphic({
          geometry,
          attributes,
          symbol: new SimpleMarkerSymbol({
            style: 'circle',
            color: i === 0 ? '#2e7d32' : '#1976d2',
            size: 14,
            outline: { color: 'white', width: 1.5 },
          }),
        }),
      )
      layer.add(
        new Graphic({
          geometry,
          attributes,
          symbol: new TextSymbol({
            text: i === 0 ? 'D' : String(i),
            color: 'white',
            font: { size: 8, weight: 'bold' },
            verticalAlignment: 'middle',
          }),
        }),
      )
    }

    if (points.length >= 2) {
      // line under the markers (collection order = draw order)
      layer.graphics.add(
        new Graphic({
          geometry: new Polyline({
            hasZ: true,
            paths: [path.points.map((p) => [p.lon, p.lat, p.z])],
          }),
          symbol: PATH_SYMBOL,
        }),
        0,
      )
    }

    const start = path.points[0]
    const drone = new Graphic({
      geometry: new Point({ longitude: start.lon, latitude: start.lat, z: start.z }),
      symbol: droneSymbol(),
    })
    droneRef.current = drone
    layer.add(drone)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- path derives from points+cruise; onProgress/onAnimChange are stable handlers
  }, [layerRef, points, cruise])

  // External reset: park at the start.
  useEffect(() => {
    if (resetToken === 0) return
    distRef.current = 0
    onProgress(0)
    const start = pathRef.current.points[0]
    if (droneRef.current && start) {
      droneRef.current.geometry = new Point({ longitude: start.lon, latitude: start.lat, z: start.z })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the token only
  }, [resetToken])

  // The animation loop — runs only while playing.
  useEffect(() => {
    if (anim !== 'playing') return
    // Replaying a finished flight starts over.
    if (distRef.current >= pathRef.current.total) distRef.current = 0
    let last = performance.now()
    let published = 0
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const flightPath = pathRef.current
      distRef.current += FLIGHT_SPEED * dt
      const s = sampleFlight(flightPath, distRef.current)
      if (!s || !droneRef.current) return
      droneRef.current.geometry = new Point({ longitude: s.lon, latitude: s.lat, z: s.z })
      const t = flightPath.total > 0 ? Math.min(distRef.current / flightPath.total, 1) : 1
      if (s.done) {
        onProgress(1)
        onAnimChange('done')
      } else if (now - published >= PROGRESS_PUBLISH_MS) {
        published = now
        onProgress(t)
      }
    }, 33)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop keys on play state only; path/handlers read through refs
  }, [anim])

  return null
}
