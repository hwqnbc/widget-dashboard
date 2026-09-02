/**
 * Map page body — owns the ArcGIS map/view lifecycle, the theme-following
 * basemap, and the tool strip (2D/3D, locate, pins, measure, route).
 *
 * HEAVY MODULE: @arcgis/core enters the bundle ONLY through this lazy route
 * chunk. Never re-export anything from here in a barrel (docs/lessons.md #57).
 *
 * Test contract (asserted by e2e/130-map.test.mjs): the root publishes
 * `data-map-status` (loading|ready|error, from view.when — networkidle is
 * meaningless with tile servers), `data-basemap` (render-computed from the
 * gallery choice + theme so it works offline), `data-basemap-choice`,
 * `data-view-mode`, `data-tool`, `data-pin-count` and `data-route-*`.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Divider,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import LayersIcon from '@mui/icons-material/Layers'
import PushPinIcon from '@mui/icons-material/PushPin'
import StraightenIcon from '@mui/icons-material/Straighten'
import SquareFootIcon from '@mui/icons-material/SquareFoot'
import RouteIcon from '@mui/icons-material/Route'
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import esriConfig from '@arcgis/core/config'
import EsriMap from '@arcgis/core/Map'
import Basemap from '@arcgis/core/Basemap'
import MapView from '@arcgis/core/views/MapView'
import SceneView from '@arcgis/core/views/SceneView'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import SceneLayer from '@arcgis/core/layers/SceneLayer'
import WebTileLayer from '@arcgis/core/layers/WebTileLayer'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polygon from '@arcgis/core/geometry/Polygon'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import type Viewpoint from '@arcgis/core/Viewpoint'
import lightCss from '@arcgis/core/assets/esri/themes/light/main.css?inline'
import darkCss from '@arcgis/core/assets/esri/themes/dark/main.css?inline'
import { nanoid } from '@reduxjs/toolkit'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  addDrawing,
  addOverlay,
  addPin,
  adoptOrphanDrawings,
  clearPins,
  deleteBookmark,
  deleteDrawing,
  deleteOverlay,
  deleteRoute,
  removePin,
  renameOverlay,
  saveBookmark,
  saveRoute,
  setActiveOverlay,
  setBasemap,
  setBuildings,
  setFlightAllowClimb,
  setFlightCeiling,
  setFlightCruise,
  setOverlayVisible,
  setShowPins,
  setTrees,
  setViewMode,
  setViewpoint,
  updateDrawingGeometry,
  type MapBookmark,
  type MapDrawing,
  type MapOverlay,
  type MapPin,
  type MapViewMode,
  type NewMapDrawing,
  type SavedRoute,
  type SavedViewpoint,
} from '../../features/map/mapSlice'
import BookmarksControl from './BookmarksControl'
import FlightBinding, { type FlightAnim, type FlightGroundPoint } from './FlightBinding'
import FlightControl from './FlightControl'
import { buildFlightPath } from './flightPathModel'
import { useFlightPlan } from './useFlightPlan'
import ConfirmDialog from '../../components/widgets/ConfirmDialog'
import CoordinateReadout from './CoordinateReadout'
import OverlaysPanel from './OverlaysPanel'
import SketchBinding, { type DrawMode } from './SketchBinding'
import LocateControl from './LocateControl'
import MeasureBinding from './MeasureControls'
import RouteControl from './RouteControl'
import { useOsrmRoute } from './useOsrmRoute'
import { insertIndexFor, nearestOnPath, pathDistanceThresholdMeters } from './routeGeometry'
import { armDrag, createDragState, dragPointerDown, dragPointerUp, dragStep } from './dragModel'
import type { LonLat, RouteProfile } from './osrm'
import {
  basemapDefById,
  CARTO_COPYRIGHT,
  nextBasemapFallback,
  probeTileUrls,
  resolveBasemapId,
} from './basemapCatalog'

/** Gallery id → an ArcGIS Basemap: Esri legacy styles via fromId, the CARTO
 * raster styles via a WebTileLayer basemap (see basemapCatalog for the
 * catalog itself — kept pure so e2e can unit-check the resolver). */
function createBasemap(id: string): Basemap {
  const def = basemapDefById[id]
  if (def?.cartoUrl) {
    return new Basemap({
      title: def.label,
      baseLayers: [
        new WebTileLayer({
          urlTemplate: def.cartoUrl,
          subDomains: ['a', 'b', 'c', 'd'],
          copyright: CARTO_COPYRIGHT,
        }),
      ],
    })
  }
  // fromId types as nullable (unknown ids) — an empty Basemap beats a crash.
  return Basemap.fromId(def?.esriId ?? id) ?? new Basemap({ title: id })
}

const basemapLabel = (id: string) => basemapDefById[id]?.label ?? id

/**
 * Is this basemap actually going to draw tiles? `view.when` resolving says
 * NOTHING about the basemap (a dead one still yields status 'ready' with an
 * empty map — verified), and template-based layers (CARTO, the osm raster)
 * even "load" without touching the network. So: load the basemap (Esri
 * styles/metadata reject here when their CDN is blocked), then no-cors
 * probe a sample tile for the template providers — a rejected fetch means
 * the tile host is unreachable or filtered on this device.
 */
async function basemapReachable(basemap: Basemap, id: string): Promise<boolean> {
  const raced = <T,>(p: Promise<T>) =>
    Promise.race([
      p,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ])
  try {
    // Basemap.load() alone can resolve while its layers are dead (fromId
    // basemaps assemble client-side) — load the base LAYERS: a vector/tiled
    // layer fetches its style/metadata here and rejects when blocked.
    await raced(basemap.load())
    await raced(Promise.all(basemap.baseLayers.toArray().map((layer) => layer.load())))
    for (const url of probeTileUrls(id)) {
      await raced(fetch(url, { mode: 'no-cors', cache: 'no-store' }))
    }
    return true
  } catch {
    return false
  }
}

type BasemapHealth = 'checking' | 'ok' | 'fallback' | 'failed'

// Production keeps the 4.x default: runtime assets (workers, fonts, widget
// locale bundles) come from the ArcGIS CDN, which sidesteps the GitHub Pages
// base path. In dev, serve them from node_modules instead so the page works
// on a CDN-blocked network (missing locale bundles make the view widgets
// throw) — basemap tiles still need the network either way.
if (import.meta.env.DEV) {
  esriConfig.assetsPath = '/node_modules/@arcgis/core/assets'
}

export type AnyView = MapView | SceneView
type MapStatus = 'loading' | 'ready' | 'error'
type Tool = 'none' | 'pins' | 'measure-line' | 'measure-area' | 'route' | 'flight'

/** Waypoint list + undo history (every edit pushes the previous list). */
interface RouteEdit {
  points: LonLat[]
  history: LonLat[][]
}

/** Public-OSRM politeness cap; also keeps the URL well under limits. */
const MAX_WAYPOINTS = 25
/** Flight plans stay small: a drone start + up to 11 waypoints. */
const FLIGHT_MAX_POINTS = 12
const ROUTE_HISTORY_LIMIT = 20

/** Where the map opens when nothing is persisted yet: Singapore, city-wide
 * (scale ≈ Web-Mercator zoom 11). */
const DEFAULT_VIEW: SavedViewpoint = { lon: 103.8198, lat: 1.3521, scale: 288895 }

/** Esri's public Living Atlas "OpenStreetMap 3D Buildings" scene layer —
 * free, no API key, global extruded OSM buildings. Renders in 3D only. */
const OSM_BUILDINGS_ITEM = 'ca0470dbbddb4db28bad74ed39949e25'

/** Sibling layer: "OpenStreetMap 3D Trees (Thematic)" — stylized shapes
 * that match the untextured buildings and stream light. The Realistic
 * variant is item 33383da8a75f4d24b4b6a0d0532abe6e if ever preferred. */
const OSM_TREES_ITEM = 'f75fef56b2d944fe92ef9f7737b4f953'

/** Malformed persisted numbers must never crash the render. */
function isValidViewpoint(vp: SavedViewpoint | null): vp is SavedViewpoint {
  return (
    vp != null &&
    Number.isFinite(vp.lon) &&
    Number.isFinite(vp.lat) &&
    Number.isFinite(vp.scale)
  )
}

/** Snapshot the camera as plain serializable numbers for redux-persist.
 * Null while the view isn't ready (or mid-teardown — ArcGIS getters throw). */
function captureViewpoint(view: AnyView): SavedViewpoint | null {
  try {
    if (!view.ready) return null
    const scale = view.scale
    if (view.type === '3d') {
      const cam = view.camera
      const p = cam?.position
      if (p?.longitude == null || p.latitude == null) return null
      const vp: SavedViewpoint = {
        lon: p.longitude,
        lat: p.latitude,
        scale,
        z: p.z,
        heading: cam.heading,
        tilt: cam.tilt,
      }
      return Number.isFinite(vp.lon) && Number.isFinite(vp.lat) && Number.isFinite(scale) ? vp : null
    }
    const c = view.center
    if (c?.longitude == null || c.latitude == null) return null
    return Number.isFinite(c.longitude) && Number.isFinite(c.latitude) && Number.isFinite(scale)
      ? { lon: c.longitude, lat: c.latitude, scale }
      : null
  } catch {
    return null
  }
}

/** ArcGIS teardown can throw when the view is in a broken state (e.g. its
 * widget assets never loaded offline); never let that reach React. */
function safeDestroy(target: { destroy(): void } | null | undefined) {
  try {
    target?.destroy()
  } catch {
    // already unusable — nothing to release
  }
}

// Stable fallbacks: a fresh `?? []` each render would churn effect
// dependencies (docs/lessons.md — stable fallbacks).
const NO_PINS: MapPin[] = []
const NO_ROUTES: SavedRoute[] = []
const NO_BOOKMARKS: MapBookmark[] = []
const NO_DRAWINGS: MapDrawing[] = []
const NO_OVERLAYS: MapOverlay[] = []

const DRAWING_MARKER_SYMBOL = new SimpleMarkerSymbol({
  style: 'diamond',
  color: '#7b1fa2',
  size: 14,
  outline: { color: 'white', width: 1.5 },
})
const DRAWING_POLYGON_SYMBOL = new SimpleFillSymbol({
  color: [123, 31, 162, 0.18],
  outline: { color: '#7b1fa2', width: 2 },
})

const PIN_SYMBOL = new SimpleMarkerSymbol({
  style: 'circle',
  color: '#5c6bc0', // theme primary
  size: 12,
  outline: { color: 'white', width: 1.5 },
})

/** The ArcGIS theme CSS ships as two separate stylesheets; hold whichever
 * matches the app theme in a single swapped <style> element. */
function applyArcgisTheme(mode: 'light' | 'dark') {
  let el = document.getElementById('arcgis-theme') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'arcgis-theme'
    document.head.appendChild(el)
  }
  el.textContent = mode === 'dark' ? darkCss : lightCss
}

export default function MapPageBody() {
  const dispatch = useAppDispatch()
  const mode = useTheme().palette.mode
  // Gallery choice ('auto' follows the theme; catalog validates + falls back
  // on unknown persisted values) → the effective basemap id.
  const basemapChoice = useAppSelector((state) => state.map.basemap) ?? 'auto'
  const basemapId = resolveBasemapId(basemapChoice, mode)
  const viewMode = useAppSelector((state) => state.map.viewMode) ?? '2d'
  const pins = useAppSelector((state) => state.map.pins) ?? NO_PINS
  // The persisted "reopen here" viewpoint (kept fresh by the stationary
  // watcher below). The ref lets the view-creation effect read it without
  // re-running on every pan.
  const savedViewpoint = useAppSelector((state) => state.map.viewpoint) ?? null
  const savedViewpointRef = useRef(savedViewpoint)
  savedViewpointRef.current = savedViewpoint
  const savedRoutes = useAppSelector((state) => state.map.savedRoutes) ?? NO_ROUTES
  const bookmarks = useAppSelector((state) => state.map.bookmarks) ?? NO_BOOKMARKS
  const buildings = useAppSelector((state) => state.map.buildings) ?? true
  const trees = useAppSelector((state) => state.map.trees) ?? true
  const drawings = useAppSelector((state) => state.map.drawings) ?? NO_DRAWINGS
  const overlays = useAppSelector((state) => state.map.overlays) ?? NO_OVERLAYS
  const activeOverlayId = useAppSelector((state) => state.map.activeOverlayId) ?? null
  const activeOverlayIdRef = useRef(activeOverlayId)
  activeOverlayIdRef.current = activeOverlayId
  const showPins = useAppSelector((state) => state.map.showPins) ?? true
  const flightCruise = useAppSelector((state) => state.map.flightCruise) ?? 60
  const flightAllowClimb = useAppSelector((state) => state.map.flightAllowClimb) ?? true
  const flightCeiling = useAppSelector((state) => state.map.flightCeiling) ?? 120

  // Sweep any shapes from before overlay groups existed into an "Imported"
  // overlay (no-op on clean state).
  useEffect(() => {
    dispatch(adoptOrphanDrawings())
  }, [dispatch])

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<EsriMap | null>(null)
  const buildingsLayerRef = useRef<SceneLayer | null>(null)
  const treesLayerRef = useRef<SceneLayer | null>(null)
  const pinsLayerRef = useRef<GraphicsLayer | null>(null)
  const routeLayerRef = useRef<GraphicsLayer | null>(null)
  const locateLayerRef = useRef<GraphicsLayer | null>(null)
  const drawingsLayerRef = useRef<GraphicsLayer | null>(null)
  const sketchLayerRef = useRef<GraphicsLayer | null>(null)
  const flightLayerRef = useRef<GraphicsLayer | null>(null)
  const viewpointRef = useRef<Viewpoint | null>(null)
  const basemapIdRef = useRef(basemapId)

  // The live view stays OUT of React state/props: ArcGIS Accessor objects
  // are getter minefields, and React 19's dev-mode render logging deep-walks
  // changed props — reading e.g. `zoom` on a destroyed SceneView throws
  // inside React's commit and takes the whole tree down. Children get the
  // ref (stable identity, never diffed) plus a revision counter to re-run
  // their effects when the view is swapped.
  const viewRef = useRef<AnyView | null>(null)
  const [viewRevision, setViewRevision] = useState(0)
  const [status, setStatus] = useState<MapStatus>('loading')
  const [tool, setTool] = useState<Tool>('none')
  const [confirmClear, setConfirmClear] = useState(false)
  // Transient, like the widget fullscreen system — never persisted. The map
  // goes fullscreen IN PLACE (the root restyles to fixed/inset-0): portaling
  // into an overlay would remount — and so destroy — the live ArcGIS view
  // (lessons.md #72), which is why the widgets' FullscreenProvider isn't
  // reused here.
  const [fullscreen, setFullscreen] = useState(false)
  // Basemap health watchdog (strings only — never ArcGIS objects, #67).
  // `activeBasemapId` is what the map is LIVE-showing (fallbacks included);
  // `data-basemap` stays derived from the persisted choice.
  const [basemapHealth, setBasemapHealth] = useState<BasemapHealth>('checking')
  const [activeBasemapId, setActiveBasemapId] = useState(basemapId)
  const [basemapWarningDismissed, setBasemapWarningDismissed] = useState(false)
  const basemapEpochRef = useRef(0)
  // Overlays panel visibility (transient) + active drawing mode.
  const [panelOpen, setPanelOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [routeEdit, setRouteEdit] = useState<RouteEdit>({ points: [], history: [] })
  const [routeProfile, setRouteProfile] = useState<RouteProfile>('drive')
  // Drone flight plan (transient, like the route waypoints): start + waypoints
  // with their sampled ground elevations, and the animation transport.
  const [flightPoints, setFlightPoints] = useState<FlightGroundPoint[]>([])
  const [flightAnim, setFlightAnim] = useState<FlightAnim>('idle')
  const [flightProgress, setFlightProgress] = useState(0)
  const [flightResetToken, setFlightResetToken] = useState(0)

  // Click dispatch reads the live tool through a ref so the view's click
  // handler (registered once per view) never needs re-registering.
  const toolRef = useRef(tool)
  toolRef.current = tool
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode

  // Drawing and the strip tools are mutually exclusive claimants of map
  // clicks — activating one releases the other. Drawing with no overlay yet
  // auto-creates one (it becomes active in the reducer).
  const handleDrawMode = (mode: DrawMode) => {
    setDrawMode(mode)
    if (mode !== 'none') {
      setTool('none')
      clearRoute()
      if (!activeOverlayIdRef.current) {
        const action = dispatch(addOverlay({ name: 'Overlay 1', visible: true }))
        activeOverlayIdRef.current = action.payload.id
      }
    }
  }

  // A completed sketch lands in the active overlay (guard-creating one if
  // the user deleted it mid-draw).
  const handleDrawingCreated = (drawing: NewMapDrawing) => {
    let overlayId = activeOverlayIdRef.current
    if (!overlayId) {
      const action = dispatch(addOverlay({ name: 'Overlay 1', visible: true }))
      overlayId = action.payload.id
      activeOverlayIdRef.current = overlayId
    }
    dispatch(addDrawing({ ...drawing, overlayId }))
  }

  // Every waypoint edit funnels through here so undo always has the
  // previous list. Pure functional updates — the click handler is async and
  // long-lived, so it must never bake in a stale snapshot.
  const updateRoute = (updater: (points: LonLat[]) => LonLat[]) => {
    setRouteEdit((prev) => {
      const points = updater(prev.points)
      if (points === prev.points) return prev
      return { points, history: [...prev.history.slice(-(ROUTE_HISTORY_LIMIT - 1)), prev.points] }
    })
  }
  const undoRoute = () => {
    setRouteEdit((prev) =>
      prev.history.length === 0
        ? prev
        : { points: prev.history[prev.history.length - 1], history: prev.history.slice(0, -1) },
    )
  }
  const clearRoute = () => updateRoute((points) => (points.length ? [] : points))

  // Drag-to-move waypoints. hitTest is async but drag's stopPropagation
  // must be synchronous, so pointer-down pre-arms the state and the drag
  // handler only consults it. Live movement mutates the two marker
  // graphics; the commit (one OSRM re-fetch, undoable) happens on the drag
  // END step — event ordering rules live in dragModel.ts (pure, unit-tested
  // by the e2e bundle; see lessons.md #71).
  const dragRef = useRef(createDragState())
  const moveWaypointGraphics = (index: number, p: LonLat) => {
    const layer = routeLayerRef.current
    if (!layer) return
    for (const g of layer.graphics.toArray()) {
      if (g.attributes?.waypointIndex === index) {
        g.geometry = new Point({ longitude: p[0], latitude: p[1] })
      }
    }
  }

  const enterFullscreen = () => {
    setFullscreen(true)
    // Best-effort native fullscreen (must run inside the click gesture);
    // iOS Safari / headless reject → caught, the CSS overlay still applies.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    } catch {
      /* unsupported */
    }
  }
  const exitFullscreen = () => {
    setFullscreen(false)
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    } catch {
      /* noop */
    }
  }

  // While fullscreen: Escape exits, and leaving native fullscreen via the
  // browser's own UI keeps the CSS state in sync. Unmount also releases.
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen()
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      } catch {
        /* noop */
      }
    }
  }, [fullscreen])

  const saveBookmarkNow = (name: string) => {
    const view = viewRef.current
    if (!view) return
    const viewpoint = captureViewpoint(view)
    if (!viewpoint) return
    dispatch(
      saveBookmark({ name: name.trim() || `Bookmark ${bookmarks.length + 1}`, viewpoint }),
    )
  }

  const loadBookmark = (bookmark: MapBookmark) => {
    const view = viewRef.current
    if (!view) return
    const vp = bookmark.viewpoint
    try {
      const target =
        vp.z != null && view.type === '3d'
          ? {
              position: { longitude: vp.lon, latitude: vp.lat, z: vp.z },
              heading: vp.heading ?? 0,
              tilt: vp.tilt ?? 0,
            }
          : { center: [vp.lon, vp.lat] as [number, number], scale: vp.scale }
      void (view as MapView).goTo(target).catch(() => {})
    } catch {
      // view not ready — nothing to fly
    }
  }

  const saveCurrentRoute = (name: string) => {
    if (routeEdit.points.length < 2) return
    dispatch(
      saveRoute({
        name: name.trim() || `Route ${savedRoutes.length + 1}`,
        profile: routeProfile,
        points: routeEdit.points,
      }),
    )
  }

  const loadSavedRoute = (route: SavedRoute) => {
    setRouteProfile(route.profile)
    updateRoute(() => route.points.map(([lon, lat]): LonLat => [lon, lat]))
    const view = viewRef.current
    if (!view || route.points.length === 0) return
    try {
      const target =
        route.points.length === 1
          ? new Point({ longitude: route.points[0][0], latitude: route.points[0][1] })
          : new Polyline({ paths: [route.points.map(([lon, lat]) => [lon, lat])] })
      void (view as MapView).goTo(target).catch(() => {})
    } catch {
      // view not ready — the route still loads, just without the fly-to
    }
  }

  // Render-computed viewport contract (persisted value or the Singapore
  // default) — like data-basemap, it asserts in e2e even with no network.
  // Guarded: malformed persisted numbers must never crash the render.
  const focus = isValidViewpoint(savedViewpoint) ? savedViewpoint : DEFAULT_VIEW

  // One shared Map (basemap + graphics layers) for both view modes — pins
  // and routes survive the 2D/3D swap because they live on the map, not the
  // view. Ground only matters to the SceneView; world-elevation is the free
  // legacy Esri elevation service (no API key).
  function ensureMap(): EsriMap {
    // Self-heal: should any teardown path still destroy the shared map (the
    // detach-before-destroy above prevents the known one), rebuild instead
    // of handing a destroyed map to the next view — that renders blank
    // forever. Graphics mirrors repopulate via their own effects.
    if (mapRef.current?.destroyed) {
      console.warn('Map: shared EsriMap was destroyed — rebuilding it')
      mapRef.current = null
      buildingsLayerRef.current = null
      treesLayerRef.current = null
      pinsLayerRef.current = null
      routeLayerRef.current = null
      locateLayerRef.current = null
      drawingsLayerRef.current = null
      sketchLayerRef.current = null
      flightLayerRef.current = null
    }
    if (!mapRef.current) {
      pinsLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      routeLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      locateLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      drawingsLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      // scratch layer for in-progress sketches only — never mirrored
      sketchLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      // flight graphics carry real z values — the one absolute-height layer
      flightLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'absolute-height' } })
      mapRef.current = new EsriMap({
        basemap: createBasemap(basemapIdRef.current),
        ground: 'world-elevation',
        layers: [
          drawingsLayerRef.current,
          routeLayerRef.current,
          pinsLayerRef.current,
          locateLayerRef.current,
          sketchLayerRef.current,
          flightLayerRef.current,
        ],
      })
    }
    return mapRef.current
  }

  // Full teardown on unmount only. destroy() is idempotent, so the view
  // effect's own cleanup destroying the view first is fine.
  useEffect(() => {
    return () => {
      safeDestroy(mapRef.current) // also destroys the layers
      mapRef.current = null
      buildingsLayerRef.current = null
      treesLayerRef.current = null
      pinsLayerRef.current = null
      routeLayerRef.current = null
      locateLayerRef.current = null
      drawingsLayerRef.current = null
      sketchLayerRef.current = null
      flightLayerRef.current = null
      document.getElementById('arcgis-theme')?.remove()
    }
  }, [])

  // Create/destroy the view — once per mount per view mode. StrictMode (dev)
  // runs mount → cleanup → mount; destroy() fully releases the first view and
  // the second creation reuses the same container div (the supported ArcGIS
  // pattern). On a 2D/3D toggle the viewpoint carries over via viewpointRef.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    setStatus('loading')

    // Everything ArcGIS throws (it can, when its assets/tiles are
    // unreachable) must stay out of React's commit phase — a stray exception
    // here unmounts the whole app.
    let nextView: AnyView | null = null
    const handles: { remove(): void }[] = []
    try {
      const map = ensureMap()
      // Where to open: the in-session carry-over (2D/3D toggle) is exact,
      // else the persisted last viewpoint, else the Singapore default.
      const carried = viewpointRef.current
      const saved = isValidViewpoint(savedViewpointRef.current)
        ? savedViewpointRef.current
        : DEFAULT_VIEW
      if (viewMode === '3d') {
        const props: __esri.SceneViewProperties = { container, map }
        if (carried) props.viewpoint = carried
        else if (saved.z != null) {
          props.camera = {
            position: { longitude: saved.lon, latitude: saved.lat, z: saved.z },
            heading: saved.heading ?? 0,
            tilt: saved.tilt ?? 0,
          }
        } else {
          props.center = [saved.lon, saved.lat]
          props.scale = saved.scale
        }
        nextView = new SceneView(props)
      } else {
        const props: __esri.MapViewProperties = { container, map }
        if (carried) props.viewpoint = carried
        else {
          props.center = [saved.lon, saved.lat]
          props.scale = saved.scale
        }
        nextView = new MapView(props)
      }

      nextView.when(
        () => {
          if (!disposed) setStatus('ready')
        },
        () => {
          // Typically the basemap fetch failing (offline / blocked CDN).
          if (!disposed) setStatus('error')
        },
      )

      const created = nextView
      handles.push(
        (created as MapView).on('click', (event) => {
          void handleViewClick(created, event)
        }),
      )
      // Persist the viewpoint whenever the camera comes to rest — this is
      // what survives a browser close, not just a page unmount.
      handles.push(
        (created as MapView).watch('stationary', (stationary: boolean) => {
          if (!stationary) return
          const vp = captureViewpoint(created)
          if (vp) dispatch(setViewpoint(vp))
        }),
      )
      // Drag-to-move waypoints: pointer-down arms the candidate (hitTest is
      // async; drag's stopPropagation below must be synchronous), pointer-up
      // disarms, drag moves the marker live and commits on release.
      handles.push(
        (created as MapView).on('pointer-down', (event) => {
          dragPointerDown(dragRef.current) // never leak a lost gesture's arm
          if (toolRef.current !== 'route') return
          void created
            .hitTest({ x: event.x, y: event.y })
            .then((hit) => {
              const wp = hit.results.find(
                (r) =>
                  r.type === 'graphic' &&
                  r.layer === routeLayerRef.current &&
                  typeof r.graphic.attributes?.waypointIndex === 'number',
              )
              armDrag(
                dragRef.current,
                wp && wp.type === 'graphic'
                  ? (wp.graphic.attributes.waypointIndex as number)
                  : null,
              )
            })
            .catch(() => armDrag(dragRef.current, null))
        }),
      )
      handles.push(
        (created as MapView).on('pointer-up', () => {
          // Disarms clicks only — an active drag's commit belongs to the
          // drag END step, and pointer-up can arrive BEFORE it.
          dragPointerUp(dragRef.current)
        }),
      )
      handles.push(
        (created as MapView).on('drag', (event) => {
          if (dragRef.current.index == null || toolRef.current !== 'route') return
          event.stopPropagation() // the waypoint moves, not the map
          const mp = created.toMap({ x: event.x, y: event.y })
          const p: LonLat | null =
            mp?.longitude != null && mp.latitude != null ? [mp.longitude, mp.latitude] : null
          const commit = dragStep(dragRef.current, event.action, p)
          if (commit) {
            updateRoute((points) =>
              points.map((pt, i) => (i === commit.index ? commit.pos : pt)),
            )
          } else if (p && dragRef.current.index != null) {
            moveWaypointGraphics(dragRef.current.index, p)
          }
        }),
      )
      viewRef.current = created
      setViewRevision((r) => r + 1)
    } catch {
      setStatus('error')
    }

    return () => {
      disposed = true
      try {
        for (const h of handles) h.remove()
        // Only carry the camera over from a view that actually initialised —
        // a half-built viewpoint makes the next view's constructor throw.
        if (nextView?.ready) {
          viewpointRef.current = nextView.viewpoint?.clone() ?? viewpointRef.current
          // Final position (covers leaving the page mid-gesture).
          const vp = captureViewpoint(nextView)
          if (vp) dispatch(setViewpoint(vp))
        }
      } catch {
        // keep the previous viewpoint
      }
      viewRef.current = null
      // DETACH the shared map before destroying the view: in 4.x
      // `view.destroy()` destroys `view.map` (View.js ends destroy() with
      // `this.map = destroyMaybe(this.map)`), so without this the FIRST
      // 2D/3D toggle killed the basemap, ground and every graphics layer —
      // the next view then warned "map is already destroyed" and rendered
      // blank forever (the real face of the phone's "tiles don't load").
      try {
        if (nextView) nextView.map = null
      } catch {
        // view already broken — destroy is best-effort anyway
      }
      safeDestroy(nextView)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  async function handleViewClick(
    v: AnyView,
    event: { mapPoint: Point | null | undefined; x: number; y: number },
  ) {
    if (drawModeRef.current !== 'none') return // SketchViewModel owns clicks
    const activeTool = toolRef.current
    if (activeTool === 'pins') {
      // Clicking an existing pin removes it; empty ground adds one.
      const hit = await v.hitTest({ x: event.x, y: event.y })
      const pinHit = hit.results.find(
        (r) =>
          r.type === 'graphic' &&
          r.layer === pinsLayerRef.current &&
          typeof r.graphic.attributes?.pinId === 'string',
      )
      if (pinHit && pinHit.type === 'graphic') {
        dispatch(removePin(pinHit.graphic.attributes.pinId as string))
      } else if (event.mapPoint?.longitude != null && event.mapPoint.latitude != null) {
        dispatch(
          addPin({
            id: nanoid(),
            lon: event.mapPoint.longitude,
            lat: event.mapPoint.latitude,
          }),
        )
      }
    } else if (activeTool === 'route') {
      if (event.mapPoint?.longitude == null || event.mapPoint.latitude == null) return
      const p: LonLat = [event.mapPoint.longitude, event.mapPoint.latitude]

      // 1. Clicking a waypoint marker (or its number label) removes it.
      const hit = await v.hitTest({ x: event.x, y: event.y })
      const wpHit = hit.results.find(
        (r) =>
          r.type === 'graphic' &&
          r.layer === routeLayerRef.current &&
          typeof r.graphic.attributes?.waypointIndex === 'number',
      )
      if (wpHit && wpHit.type === 'graphic') {
        const index = wpHit.graphic.attributes.waypointIndex as number
        updateRoute((points) => points.filter((_, i) => i !== index))
        return
      }

      // 2. Clicking on/near the route line inserts a waypoint into the leg
      //    it landed on (pure math over the fetched geometry).
      const data = routeDataRef.current
      if (data?.path && data.snapped && data.snapped.length >= 2) {
        const near = nearestOnPath(data.path, p)
        if (near && near.distMeters <= pathDistanceThresholdMeters(v.scale)) {
          const at = insertIndexFor(data.path, data.snapped, p)
          updateRoute((points) =>
            points.length >= MAX_WAYPOINTS
              ? points
              : [...points.slice(0, at), p, ...points.slice(at)],
          )
          return
        }
      }

      // 3. Anywhere else: append as the new destination.
      updateRoute((points) => (points.length >= MAX_WAYPOINTS ? points : [...points, p]))
    } else if (activeTool === 'flight') {
      if (event.mapPoint?.longitude == null || event.mapPoint.latitude == null) return

      // Clicking a flight marker removes it; anywhere else plants the drone
      // (first click) or appends a waypoint.
      const hit = await v.hitTest({ x: event.x, y: event.y })
      const fHit = hit.results.find(
        (r) =>
          r.type === 'graphic' &&
          r.layer === flightLayerRef.current &&
          typeof r.graphic.attributes?.flightIndex === 'number',
      )
      if (fHit && fHit.type === 'graphic') {
        const index = fHit.graphic.attributes.flightIndex as number
        setFlightPoints((points) => points.filter((_, i) => i !== index))
        return
      }
      const lon = event.mapPoint.longitude
      const lat = event.mapPoint.latitude
      const ground = await groundElevationAt(lon, lat)
      setFlightPoints((points) =>
        points.length >= FLIGHT_MAX_POINTS ? points : [...points, { lon, lat, ground }],
      )
    }
  }

  /** Ground elevation for a flight point, meters — from the free
   * world-elevation ground already on the map. Offline (or slow) the sample
   * falls back to 0 so the tool keeps working with heights above sea level
   * treated as heights above ground. */
  async function groundElevationAt(lon: number, lat: number): Promise<number> {
    try {
      const ground = mapRef.current?.ground
      if (!ground) return 0
      const result = await Promise.race([
        ground.queryElevation(new Point({ longitude: lon, latitude: lat })),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ])
      const z = (result.geometry as Point).z
      return typeof z === 'number' && Number.isFinite(z) ? z : 0
    } catch {
      return 0
    }
  }

  // Follow the app theme and the gallery choice — and watch the basemap's
  // HEALTH. Swap the injected ArcGIS CSS and the basemap in place (no view
  // re-create), then verify the chosen basemap can actually draw
  // (basemapReachable). On failure walk the provider-diverse fallback
  // ladder (OSMF → CARTO → Esri) so a device that blocks one tile CDN still
  // gets a map, and surface a banner naming what failed. The persisted
  // choice and `data-basemap` never change — only the map's live basemap.
  useEffect(() => {
    applyArcgisTheme(mode)
    const epoch = ++basemapEpochRef.current
    setBasemapHealth('checking')
    setActiveBasemapId(basemapId)
    setBasemapWarningDismissed(false)
    const tried: string[] = []
    const applyAndCheck = async (id: string, isFallback: boolean) => {
      const map = mapRef.current
      if (!map || epoch !== basemapEpochRef.current) return
      try {
        if (basemapIdRef.current !== id || !map.basemap) {
          map.basemap = createBasemap(id)
          basemapIdRef.current = id
        }
      } catch (e) {
        console.warn('Basemap create failed', e)
      }
      setActiveBasemapId(id)
      const ok = map.basemap ? await basemapReachable(map.basemap, id) : false
      if (epoch !== basemapEpochRef.current) return
      if (ok) {
        setBasemapHealth(isFallback ? 'fallback' : 'ok')
        return
      }
      tried.push(id)
      const next = nextBasemapFallback(basemapId, tried)
      if (next) {
        setBasemapHealth('fallback')
        void applyAndCheck(next, true)
      } else {
        setBasemapHealth('failed')
      }
    }
    void applyAndCheck(basemapId, false)
  }, [mode, basemapId])

  // OSM 3D Buildings: created lazily the first time the 3D view wants them
  // (public Living Atlas item, no key), then just driven via visibility. The
  // layer lives on the shared map; the 2D MapView simply doesn't render it.
  useEffect(() => {
    if (viewMode === '3d' && buildings && !buildingsLayerRef.current && mapRef.current) {
      try {
        const layer = new SceneLayer({ portalItem: { id: OSM_BUILDINGS_ITEM } })
        buildingsLayerRef.current = layer
        mapRef.current.add(layer)
      } catch {
        // offline/blocked CDN — 3D still works, just without buildings
      }
    }
    if (buildingsLayerRef.current) buildingsLayerRef.current.visible = buildings
  }, [buildings, viewMode])

  // Same lazily-created/visibility-driven pattern for the OSM 3D Trees.
  useEffect(() => {
    if (viewMode === '3d' && trees && !treesLayerRef.current && mapRef.current) {
      try {
        const layer = new SceneLayer({ portalItem: { id: OSM_TREES_ITEM } })
        treesLayerRef.current = layer
        mapRef.current.add(layer)
      } catch {
        // offline/blocked CDN — 3D still works, just without trees
      }
    }
    if (treesLayerRef.current) treesLayerRef.current.visible = trees
  }, [trees, viewMode])

  // Mirror the persisted pins onto the graphics layer.
  useEffect(() => {
    const layer = pinsLayerRef.current
    if (!layer) return
    layer.removeAll()
    layer.addMany(
      pins.map(
        (pin) =>
          new Graphic({
            geometry: new Point({ longitude: pin.lon, latitude: pin.lat }),
            symbol: PIN_SYMBOL,
            attributes: { pinId: pin.id },
          }),
      ),
    )
  }, [pins])

  // Mirror the persisted drawings onto their layer — only shapes whose
  // overlay group is visible render.
  useEffect(() => {
    const layer = drawingsLayerRef.current
    if (!layer) return
    const visibleIds = new Set(overlays.filter((o) => o.visible).map((o) => o.id))
    layer.removeAll()
    layer.addMany(
      drawings
        .filter(
          (d) =>
            d.overlayId != null &&
            visibleIds.has(d.overlayId) &&
            // never build ArcGIS geometry from malformed persisted entries
            (d.kind === 'marker'
              ? Number.isFinite(d.lon) && Number.isFinite(d.lat)
              : (d.rings?.[0]?.length ?? 0) >= 3),
        )
        .map((d) =>
          d.kind === 'marker'
            ? new Graphic({
                geometry: new Point({ longitude: d.lon, latitude: d.lat }),
                symbol: DRAWING_MARKER_SYMBOL,
                attributes: { drawingId: d.id },
              })
            : new Graphic({
                geometry: new Polygon({ rings: d.rings.map((r) => r.map(([x, y]) => [x, y])) }),
                symbol: DRAWING_POLYGON_SYMBOL,
                attributes: { drawingId: d.id },
              }),
        ),
    )
  }, [drawings, overlays])

  // Pins-layer visibility follows the panel switch.
  useEffect(() => {
    if (pinsLayerRef.current) pinsLayerRef.current.visible = showPins
  }, [showPins])

  const route = useOsrmRoute(routeLayerRef, routeEdit.points, routeProfile)
  // The fetched route geometry, readable from the long-lived click handler.
  const routeDataRef = useRef(route)
  routeDataRef.current = route

  const handleTool = (next: Tool | null) => {
    const t = next ?? 'none'
    setTool(t)
    if (t !== 'route') clearRoute()
    if (t !== 'none') setDrawMode('none')
  }

  // The building-aware plan (Overpass-fed; falls back to direct legs when
  // the service is unreachable). Length is pure math over the planned path;
  // a blocked plan reports the straight-line length instead.
  const { plan: flightPlan, status: flightPlanStatus } = useFlightPlan(
    flightPoints,
    flightCruise,
    flightAllowClimb,
    flightCeiling,
  )
  const flightKm =
    buildFlightPath(
      flightPlan.path.length >= 2
        ? flightPlan.path
        : flightPoints.map((p) => ({ lon: p.lon, lat: p.lat, z: p.ground + flightCruise })),
    ).total / 1000

  // The flight tool is 3D-only: switching to 2D releases it (and pauses any
  // running animation); the absolute-height graphics only show in 3D.
  useEffect(() => {
    if (viewMode !== '3d') {
      setTool((t) => (t === 'flight' ? 'none' : t))
      setFlightAnim((a) => (a === 'playing' ? 'paused' : a))
    }
    if (flightLayerRef.current) flightLayerRef.current.visible = viewMode === '3d'
  }, [viewMode])

  return (
    <Box
      data-testid="map-page"
      data-map-status={status}
      data-basemap={basemapId}
      data-basemap-choice={basemapChoice}
      data-view-mode={viewMode}
      data-tool={tool}
      data-pin-count={pins.length}
      data-route-status={route.status}
      data-route-km={route.km ?? ''}
      data-route-points={routeEdit.points.length}
      data-route-legs={route.legs?.length ?? 0}
      data-route-profile={routeProfile}
      data-center-lon={focus.lon.toFixed(4)}
      data-center-lat={focus.lat.toFixed(4)}
      data-scale={Math.round(focus.scale)}
      data-saved-routes={savedRoutes.length}
      data-bookmarks={bookmarks.length}
      data-buildings={buildings ? 'on' : 'off'}
      data-trees={trees ? 'on' : 'off'}
      data-fullscreen={fullscreen ? 'on' : 'off'}
      data-panel={panelOpen ? 'open' : 'closed'}
      data-draw-mode={drawMode}
      data-drawings={drawings.length}
      data-overlays={overlays.length}
      data-active-overlay={activeOverlayId ?? ''}
      data-visible-drawings={
        drawings.filter((d) => overlays.some((o) => o.id === d.overlayId && o.visible)).length
      }
      data-pins-visible={showPins ? 'on' : 'off'}
      data-basemap-active={activeBasemapId}
      data-basemap-health={basemapHealth}
      data-flight-points={flightPoints.length}
      data-flight-anim={flightAnim}
      data-flight-km={flightPoints.length >= 2 ? flightKm.toFixed(2) : ''}
      data-flight-cruise={flightCruise}
      data-flight-status={flightPlanStatus}
      data-flight-climbs={flightPlan.climbs}
      data-flight-detours={flightPlan.detours}
      data-flight-blocked={flightPlan.blocked}
      data-drone-t={flightProgress.toFixed(3)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        ...(fullscreen
          ? {
              // In-place fullscreen: same DOM, fixed over the app shell —
              // the live ArcGIS view just resizes with its container.
              position: 'fixed',
              inset: 0,
              zIndex: (theme) => theme.zIndex.modal,
              bgcolor: 'background.default',
              p: 1,
            }
          : {
              // No 100%-height chain from #root: size against the viewport
              // minus the sticky AppBar (56px at xs, 64px up) + Container py.
              height: { xs: 'calc(100vh - 56px - 48px)', sm: 'calc(100vh - 64px - 48px)' },
              minHeight: 400,
            }),
      }}
    >
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, v: MapViewMode | null) => {
            if (v) dispatch(setViewMode(v))
          }}
          aria-label="View mode"
        >
          <ToggleButton value="2d" data-testid="map-mode-2d">
            2D
          </ToggleButton>
          <ToggleButton value="3d" data-testid="map-mode-3d">
            3D
          </ToggleButton>
        </ToggleButtonGroup>
        <Divider orientation="vertical" flexItem />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tool}
          onChange={(_, v: Tool | null) => handleTool(v)}
          aria-label="Map tool"
        >
          <ToggleButton value="pins" data-testid="map-tool-pins" aria-label="Drop pins">
            <Tooltip title="Drop pins (tap a pin to remove it)">
              <PushPinIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="measure-line" data-testid="map-tool-measure-line" aria-label="Measure distance">
            <Tooltip title="Measure distance">
              <StraightenIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="measure-area" data-testid="map-tool-measure-area" aria-label="Measure area">
            <Tooltip title="Measure area">
              <SquareFootIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="route" data-testid="map-tool-route" aria-label="Route distance">
            <Tooltip title="Route distance (walk / bike / drive)">
              <RouteIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton
            value="flight"
            data-testid="map-tool-flight"
            aria-label="Drone flight"
            disabled={viewMode !== '3d'}
          >
            <Tooltip title={viewMode === '3d' ? 'Drone flight (plant, add waypoints, fly)' : 'Drone flight — switch to 3D'}>
              <FlightTakeoffIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <LocateControl viewRef={viewRef} viewRevision={viewRevision} layerRef={locateLayerRef} />
        <BookmarksControl
          bookmarks={bookmarks}
          canSave={status === 'ready'}
          onSave={saveBookmarkNow}
          onLoad={loadBookmark}
          onDelete={(id) => dispatch(deleteBookmark(id))}
        />
        {tool === 'pins' && pins.length > 0 && (
          <Tooltip title="Remove all pins">
            <IconButton
              size="small"
              data-testid="map-pins-clear"
              onClick={() => setConfirmClear(true)}
            >
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {tool === 'route' && (
          <RouteControl
            profile={routeProfile}
            onProfileChange={setRouteProfile}
            pointCount={routeEdit.points.length}
            state={route}
            canUndo={routeEdit.history.length > 0}
            onUndo={undoRoute}
            onClear={clearRoute}
            savedRoutes={savedRoutes}
            onSave={saveCurrentRoute}
            onLoad={loadSavedRoute}
            onDelete={(id) => dispatch(deleteRoute(id))}
          />
        )}
        {tool === 'flight' && (
          <FlightControl
            cruise={flightCruise}
            onCruise={(m) => dispatch(setFlightCruise(m))}
            allowClimb={flightAllowClimb}
            onAllowClimb={(on) => dispatch(setFlightAllowClimb(on))}
            ceiling={flightCeiling}
            onCeiling={(m) => dispatch(setFlightCeiling(m))}
            pointCount={flightPoints.length}
            km={flightKm}
            plan={flightPlan}
            planStatus={flightPlanStatus}
            anim={flightAnim}
            onPlay={() => setFlightAnim('playing')}
            onPause={() => setFlightAnim('paused')}
            onReset={() => {
              setFlightAnim('idle')
              setFlightProgress(0)
              setFlightResetToken((n) => n + 1)
            }}
            onClear={() => setFlightPoints([])}
          />
        )}
        <Tooltip title={fullscreen ? 'Exit full screen' : 'Full screen'}>
          <IconButton
            size="small"
            data-testid="map-fullscreen"
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={fullscreen ? exitFullscreen : enterFullscreen}
            sx={{ ml: 'auto' }}
          >
            {fullscreen ? (
              <FullscreenExitIcon fontSize="small" />
            ) : (
              <FullscreenIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ position: 'relative', flexGrow: 1, borderRadius: 1, overflow: 'hidden' }}>
        <Box ref={containerRef} data-testid="map-container" sx={{ width: '100%', height: '100%' }} />
        <CoordinateReadout viewRef={viewRef} viewRevision={viewRevision} />
        <Tooltip title={panelOpen ? 'Close overlays' : 'Overlays'}>
          <IconButton
            size="small"
            data-testid="map-overlays-toggle"
            aria-label={panelOpen ? 'Close overlays' : 'Overlays'}
            onClick={() => setPanelOpen((open) => !open)}
            sx={{
              position: 'absolute',
              top: 8,
              right: panelOpen ? 288 : 8,
              zIndex: 3,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              transition: 'right 200ms ease',
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <LayersIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <OverlaysPanel
          open={panelOpen}
          basemap={basemapChoice}
          onBasemap={(id) => dispatch(setBasemap(id))}
          is3d={viewMode === '3d'}
          buildings={buildings}
          onBuildings={(on) => dispatch(setBuildings(on))}
          trees={trees}
          onTrees={(on) => dispatch(setTrees(on))}
          showPins={showPins}
          onShowPins={(on) => dispatch(setShowPins(on))}
          canDraw={status === 'ready'}
          drawMode={drawMode}
          onDrawMode={handleDrawMode}
          overlays={overlays}
          activeOverlayId={activeOverlayId}
          drawings={drawings}
          onAddOverlay={() => dispatch(addOverlay({ name: `Overlay ${overlays.length + 1}`, visible: true }))}
          onRenameOverlay={(id, name) => dispatch(renameOverlay({ id, name }))}
          onDeleteOverlay={(id) => dispatch(deleteOverlay(id))}
          onOverlayVisible={(id, visible) => dispatch(setOverlayVisible({ id, visible }))}
          onActivateOverlay={(id) => dispatch(setActiveOverlay(id))}
          onDeleteDrawing={(id) => dispatch(deleteDrawing(id))}
        />
        {status === 'error' && (
          <Alert
            severity="warning"
            sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 1 }}
          >
            Basemap unreachable — check the network connection. Tools that need
            tiles won&apos;t work until it recovers.
          </Alert>
        )}
        {status !== 'error' &&
          (basemapHealth === 'fallback' || basemapHealth === 'failed') &&
          !basemapWarningDismissed && (
            <Alert
              severity="warning"
              data-testid="map-basemap-warning"
              onClose={() => setBasemapWarningDismissed(true)}
              // zIndex 1: BELOW the overlays panel (2) and its toggle (3),
              // so an open panel paints over the banner instead of the
              // banner intercepting the gallery tiles' clicks.
              sx={{ position: 'absolute', top: 8, left: 8, right: 56, zIndex: 1 }}
            >
              {basemapHealth === 'fallback'
                ? `Basemap "${basemapLabel(basemapId)}" isn't loading on this network — showing "${basemapLabel(activeBasemapId)}" instead. A content blocker or private DNS on this device may be filtering map tile servers.`
                : 'No basemap tile server is reachable — check the connection, or a content blocker / private DNS filtering map tiles on this device.'}
            </Alert>
          )}
      </Box>
      <MeasureBinding viewRef={viewRef} viewRevision={viewRevision} tool={tool} />
      <FlightBinding
        layerRef={flightLayerRef}
        points={flightPoints}
        cruise={flightCruise}
        plan={flightPlan}
        anim={flightAnim}
        resetToken={flightResetToken}
        onAnimChange={setFlightAnim}
        onProgress={setFlightProgress}
      />
      <SketchBinding
        viewRef={viewRef}
        viewRevision={viewRevision}
        sketchLayerRef={sketchLayerRef}
        drawingsLayerRef={drawingsLayerRef}
        drawMode={drawMode}
        onCreated={handleDrawingCreated}
        onUpdated={(id, geometry) => dispatch(updateDrawingGeometry({ id, geometry }))}
        onModeEnd={() => setDrawMode('none')}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Remove all pins?"
        message={`This removes all ${pins.length} dropped pins from the map.`}
        confirmLabel="Remove all"
        cancelLabel="Keep pins"
        onConfirm={() => {
          dispatch(clearPins())
          setConfirmClear(false)
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </Box>
  )
}
