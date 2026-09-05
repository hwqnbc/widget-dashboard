import { useEffect, useMemo, useRef, type RefObject } from 'react'
import Camera from '@arcgis/core/Camera'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import TextSymbol from '@arcgis/core/symbols/TextSymbol'
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D'
import ObjectSymbol3DLayer from '@arcgis/core/symbols/ObjectSymbol3DLayer'
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import {
  buildFlightPath,
  chaseCamera,
  sampleFlight,
  type FlightPath,
  type FlightSample,
} from './flightPathModel'
import type { FlightPlan, LegMode } from './flightPlanModel'
import type { AnyView } from './MapPageBody'

/** A planted flight waypoint: position + the sampled ground elevation
 * (0 when the elevation service is unreachable). `alt` overrides the
 * global cruise height for THIS waypoint (meters above ground); absent =
 * fly at cruise. */
export interface FlightGroundPoint {
  lon: number
  lat: number
  ground: number
  alt?: number
}

export type FlightAnim = 'idle' | 'playing' | 'paused' | 'done'

/** Default drone speed along the path, m/s (the live value is the persisted
 * `flightSpeed` setting, passed in as the `speed` prop). */
export const DEFAULT_FLIGHT_SPEED = 20

/** Publish animation progress to the parent at most this often — the loop
 * itself never touches React state per tick. */
const PROGRESS_PUBLISH_MS = 250

/** Per-mode leg colors: the plan should be readable at a glance — blue
 * flies straight, green climbed, orange went around, red couldn't fly. */
const LEG_SYMBOLS: Record<LegMode, SimpleLineSymbol> = {
  direct: new SimpleLineSymbol({ color: [25, 118, 210, 0.9], width: 3 }),
  climb: new SimpleLineSymbol({ color: [46, 125, 50, 0.9], width: 3 }),
  detour: new SimpleLineSymbol({ color: [239, 108, 0, 0.9], width: 3 }),
  blocked: new SimpleLineSymbol({ color: [211, 47, 47, 0.9], width: 3, style: 'dash' }),
}
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
  viewRef,
  viewRevision,
  points,
  cruise,
  speed,
  plan,
  anim,
  follow,
  onFollowRelease,
  resetToken,
  onAnimChange,
  onProgress,
}: {
  layerRef: RefObject<GraphicsLayer | null>
  viewRef: RefObject<AnyView | null>
  viewRevision: number
  points: FlightGroundPoint[]
  cruise: number
  /** Drone speed along the path, m/s — effective live, mid-flight. */
  speed: number
  /** The building-aware plan (per-leg modes + the flyable path). */
  plan: FlightPlan
  anim: FlightAnim
  /** Chase-camera follows the drone (3D view only). */
  follow: boolean
  /** A manual navigation gesture released the chase-cam (turn follow off). */
  onFollowRelease: () => void
  /** Bumping this parks the drone back at the start with progress 0. */
  resetToken: number
  onAnimChange: (anim: FlightAnim) => void
  onProgress: (t: number) => void
}) {
  // The drone flies the PLANNED path (climbs and detours included); it is
  // empty while a leg is blocked, which parks the drone at the start.
  const path: FlightPath = useMemo(() => buildFlightPath(plan.path), [plan])
  const pathRef = useRef(path)
  pathRef.current = path

  const droneRef = useRef<Graphic | null>(null)
  const distRef = useRef(0)
  const followRef = useRef(follow)
  followRef.current = follow
  // The loop reads speed through a ref so a mid-flight change takes effect
  // on the next tick without restarting the [anim] effect.
  const speedRef = useRef(speed)
  speedRef.current = speed

  // Chase-cam write: direct camera assignment each tick (a per-tick goTo
  // would queue animations), 3D only, guarded — the view can be
  // mid-teardown when a swap lands during a tick.
  const placeCamera = (sample: FlightSample) => {
    const view = viewRef.current
    if (!view || view.type !== '3d') return
    try {
      const cam = chaseCamera(sample)
      view.camera = new Camera({
        position: new Point({ longitude: cam.lon, latitude: cam.lat, z: cam.z }),
        heading: cam.headingDeg,
        tilt: cam.tiltDeg,
      })
    } catch {
      /* view mid-teardown — skip this frame */
    }
  }

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
      const z = p.ground + (p.alt ?? cruise)
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

    // Planned legs under the markers, one line per leg colored by its mode
    // (collection order = draw order).
    for (const leg of plan.legs) {
      layer.graphics.add(
        new Graphic({
          geometry: new Polyline({
            hasZ: true,
            paths: [leg.path.map((p) => [p.lon, p.lat, p.z])],
          }),
          symbol: LEG_SYMBOLS[leg.mode],
        }),
        0,
      )
    }

    // Park the drone at the planned start — or on the first marker while
    // the plan is empty (single point, or a blocked leg).
    const start = path.points[0] ?? {
      lon: points[0].lon,
      lat: points[0].lat,
      z: points[0].ground + (points[0].alt ?? cruise),
    }
    const drone = new Graphic({
      geometry: new Point({ longitude: start.lon, latitude: start.lat, z: start.z }),
      symbol: droneSymbol(),
    })
    droneRef.current = drone
    layer.add(drone)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- path derives from plan; onProgress/onAnimChange are stable handlers
  }, [layerRef, points, cruise, plan])

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

  // Toggling follow on (or replanning / swapping views while on) snaps the
  // camera to the drone right away — feedback before Play is pressed.
  useEffect(() => {
    if (!follow) return
    const s = sampleFlight(pathRef.current, distRef.current)
    if (s) placeCamera(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snap on toggle/plan/view swap only
  }, [follow, plan, viewRevision])

  // Any manual navigation gesture takes the camera back: while following,
  // watch the view for drags (touch pan/pinch and mouse alike), wheel
  // zooms, double-click zooms and the navigation keys, and release follow
  // on the first one. Observation only — nothing is stopped or swallowed;
  // plain clicks stay waypoint interactions and do NOT release.
  useEffect(() => {
    const view = viewRef.current
    if (!follow || !view) return
    const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-'])
    const handles: { remove(): void }[] = []
    try {
      handles.push(
        view.on('drag', () => onFollowRelease()),
        view.on('mouse-wheel', () => onFollowRelease()),
        view.on('double-click', () => onFollowRelease()),
        view.on('key-down', (e: { key: string }) => {
          if (NAV_KEYS.has(e.key)) onFollowRelease()
        }),
      )
    } catch {
      /* view mid-teardown — no handles to release */
    }
    return () => {
      for (const h of handles) {
        try {
          h.remove()
        } catch {
          /* already gone */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm on toggle/view swap; the callback is a stable dispatch
  }, [follow, viewRevision])

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
      distRef.current += speedRef.current * dt
      const s = sampleFlight(flightPath, distRef.current)
      if (!s || !droneRef.current) return
      droneRef.current.geometry = new Point({ longitude: s.lon, latitude: s.lat, z: s.z })
      if (followRef.current) placeCamera(s)
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
