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
 * theme so it works offline), `data-view-mode`, `data-tool`,
 * `data-pin-count` and `data-route-*`.
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
import LocationCityIcon from '@mui/icons-material/LocationCity'
import PushPinIcon from '@mui/icons-material/PushPin'
import StraightenIcon from '@mui/icons-material/Straighten'
import SquareFootIcon from '@mui/icons-material/SquareFoot'
import RouteIcon from '@mui/icons-material/Route'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import esriConfig from '@arcgis/core/config'
import EsriMap from '@arcgis/core/Map'
import Basemap from '@arcgis/core/Basemap'
import MapView from '@arcgis/core/views/MapView'
import SceneView from '@arcgis/core/views/SceneView'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import SceneLayer from '@arcgis/core/layers/SceneLayer'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import Polyline from '@arcgis/core/geometry/Polyline'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import type Viewpoint from '@arcgis/core/Viewpoint'
import lightCss from '@arcgis/core/assets/esri/themes/light/main.css?inline'
import darkCss from '@arcgis/core/assets/esri/themes/dark/main.css?inline'
import { nanoid } from '@reduxjs/toolkit'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  addPin,
  clearPins,
  deleteRoute,
  removePin,
  saveRoute,
  setBuildings,
  setViewMode,
  setViewpoint,
  type MapPin,
  type MapViewMode,
  type SavedRoute,
  type SavedViewpoint,
} from '../../features/map/mapSlice'
import ConfirmDialog from '../../components/widgets/ConfirmDialog'
import LocateControl from './LocateControl'
import MeasureBinding from './MeasureControls'
import RouteControl from './RouteControl'
import { useOsrmRoute } from './useOsrmRoute'
import { insertIndexFor, nearestOnPath, pathDistanceThresholdMeters } from './routeGeometry'
import { armDrag, createDragState, dragPointerDown, dragPointerUp, dragStep } from './dragModel'
import type { LonLat, RouteProfile } from './osrm'

/**
 * Esri's legacy basemaps — free, no API key. They sunset in 2028/2029;
 * swap here for `osm` (raster OSM) or CARTO tiles via WebTileLayer then.
 */
export const BASEMAP_BY_MODE = {
  light: 'gray-vector',
  dark: 'dark-gray-vector',
} as const

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
type Tool = 'none' | 'pins' | 'measure-line' | 'measure-area' | 'route'

/** Waypoint list + undo history (every edit pushes the previous list). */
interface RouteEdit {
  points: LonLat[]
  history: LonLat[][]
}

/** Public-OSRM politeness cap; also keeps the URL well under limits. */
const MAX_WAYPOINTS = 25
const ROUTE_HISTORY_LIMIT = 20

/** Where the map opens when nothing is persisted yet: Singapore, city-wide
 * (scale ≈ Web-Mercator zoom 11). */
const DEFAULT_VIEW: SavedViewpoint = { lon: 103.8198, lat: 1.3521, scale: 288895 }

/** Esri's public Living Atlas "OpenStreetMap 3D Buildings" scene layer —
 * free, no API key, global extruded OSM buildings. Renders in 3D only. */
const OSM_BUILDINGS_ITEM = 'ca0470dbbddb4db28bad74ed39949e25'

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
  const basemapId = BASEMAP_BY_MODE[mode]
  const viewMode = useAppSelector((state) => state.map.viewMode) ?? '2d'
  const pins = useAppSelector((state) => state.map.pins) ?? NO_PINS
  // The persisted "reopen here" viewpoint (kept fresh by the stationary
  // watcher below). The ref lets the view-creation effect read it without
  // re-running on every pan.
  const savedViewpoint = useAppSelector((state) => state.map.viewpoint) ?? null
  const savedViewpointRef = useRef(savedViewpoint)
  savedViewpointRef.current = savedViewpoint
  const savedRoutes = useAppSelector((state) => state.map.savedRoutes) ?? NO_ROUTES
  const buildings = useAppSelector((state) => state.map.buildings) ?? true

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<EsriMap | null>(null)
  const buildingsLayerRef = useRef<SceneLayer | null>(null)
  const pinsLayerRef = useRef<GraphicsLayer | null>(null)
  const routeLayerRef = useRef<GraphicsLayer | null>(null)
  const locateLayerRef = useRef<GraphicsLayer | null>(null)
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
  const [routeEdit, setRouteEdit] = useState<RouteEdit>({ points: [], history: [] })
  const [routeProfile, setRouteProfile] = useState<RouteProfile>('drive')

  // Click dispatch reads the live tool through a ref so the view's click
  // handler (registered once per view) never needs re-registering.
  const toolRef = useRef(tool)
  toolRef.current = tool

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
  const focus = savedViewpoint ?? DEFAULT_VIEW

  // One shared Map (basemap + graphics layers) for both view modes — pins
  // and routes survive the 2D/3D swap because they live on the map, not the
  // view. Ground only matters to the SceneView; world-elevation is the free
  // legacy Esri elevation service (no API key).
  function ensureMap(): EsriMap {
    if (!mapRef.current) {
      pinsLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      routeLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      locateLayerRef.current = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } })
      mapRef.current = new EsriMap({
        basemap: Basemap.fromId(basemapIdRef.current),
        ground: 'world-elevation',
        layers: [routeLayerRef.current, pinsLayerRef.current, locateLayerRef.current],
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
      pinsLayerRef.current = null
      routeLayerRef.current = null
      locateLayerRef.current = null
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
      const saved = savedViewpointRef.current ?? DEFAULT_VIEW
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
      safeDestroy(nextView)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  async function handleViewClick(
    v: AnyView,
    event: { mapPoint: Point | null | undefined; x: number; y: number },
  ) {
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
    }
  }

  // Follow the app theme: swap the injected ArcGIS CSS and the basemap in
  // place — no view re-create.
  useEffect(() => {
    applyArcgisTheme(mode)
    if (basemapIdRef.current !== basemapId && mapRef.current) {
      basemapIdRef.current = basemapId
      mapRef.current.basemap = Basemap.fromId(basemapId)
    }
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

  const route = useOsrmRoute(routeLayerRef, routeEdit.points, routeProfile)
  // The fetched route geometry, readable from the long-lived click handler.
  const routeDataRef = useRef(route)
  routeDataRef.current = route

  const handleTool = (next: Tool | null) => {
    const t = next ?? 'none'
    setTool(t)
    if (t !== 'route') clearRoute()
  }

  return (
    <Box
      data-testid="map-page"
      data-map-status={status}
      data-basemap={basemapId}
      data-view-mode={viewMode}
      data-tool={tool}
      data-pin-count={pins.length}
      data-route-status={route.status}
      data-route-km={route.km ?? ''}
      data-route-points={routeEdit.points.length}
      data-route-profile={routeProfile}
      data-center-lon={focus.lon.toFixed(4)}
      data-center-lat={focus.lat.toFixed(4)}
      data-scale={Math.round(focus.scale)}
      data-saved-routes={savedRoutes.length}
      data-buildings={buildings ? 'on' : 'off'}
      sx={{
        // No 100%-height chain from #root: size against the viewport minus
        // the sticky AppBar (56px at xs, 64px up) and the Container's py.
        height: { xs: 'calc(100vh - 56px - 48px)', sm: 'calc(100vh - 64px - 48px)' },
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
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
        {viewMode === '3d' && (
          <Tooltip title="3D buildings (OpenStreetMap)">
            <ToggleButton
              size="small"
              value="buildings"
              selected={buildings}
              onChange={() => dispatch(setBuildings(!buildings))}
              data-testid="map-buildings"
              aria-label="3D buildings"
            >
              <LocationCityIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
        )}
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
        </ToggleButtonGroup>
        <LocateControl viewRef={viewRef} viewRevision={viewRevision} layerRef={locateLayerRef} />
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
      </Stack>
      <Box sx={{ position: 'relative', flexGrow: 1, borderRadius: 1, overflow: 'hidden' }}>
        <Box ref={containerRef} data-testid="map-container" sx={{ width: '100%', height: '100%' }} />
        {status === 'error' && (
          <Alert
            severity="warning"
            sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 1 }}
          >
            Basemap unreachable — check the network connection. Tools that need
            tiles won&apos;t work until it recovers.
          </Alert>
        )}
      </Box>
      <MeasureBinding viewRef={viewRef} viewRevision={viewRevision} tool={tool} />
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
