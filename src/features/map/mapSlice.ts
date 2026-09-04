import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'

export type MapViewMode = '2d' | '3d'

/** OSRM routing profile (the slice owns the type so pages/map can depend on
 * features/map, never the other way around). */
export type RouteProfile = 'walk' | 'bike' | 'drive'

/** A user-dropped map pin (WGS84 lon/lat). */
export interface MapPin {
  id: string
  lon: number
  lat: number
}

/**
 * The last place the user left the map, serializable for redux-persist.
 * `lon/lat/scale` restore either view; the optional camera extras are
 * captured from the 3D view for a faithful globe restore.
 */
export interface SavedViewpoint {
  lon: number
  lat: number
  scale: number
  z?: number
  heading?: number
  tilt?: number
}

/** A named, persisted route: the waypoint list plus its travel profile.
 * Distance/duration are re-fetched from OSRM on load, not stored. */
export interface SavedRoute {
  id: string
  name: string
  profile: RouteProfile
  points: [number, number][]
}

/** One saved flight waypoint (WGS84 + the ground elevation sampled when it
 * was planted; `alt` is this point's cruise override, meters above ground).
 * Structurally identical to pages/map FlightGroundPoint — the slice owns
 * the shape so pages/map can depend on features/map, never the reverse. */
export interface SavedFlightPoint {
  lon: number
  lat: number
  ground: number
  alt?: number
}

/** A named, persisted drone flight: the waypoints plus the settings that
 * shape the plan. The plan itself (climbs/detours) is recomputed on load —
 * building data comes from Overpass, not storage. */
export interface SavedFlight {
  id: string
  name: string
  points: SavedFlightPoint[]
  cruise: number
  allowClimb: boolean
  ceiling: number
}

/** A named, persisted camera view — same shape the viewport memory uses. */
export interface MapBookmark {
  id: string
  name: string
  viewpoint: SavedViewpoint
}

/** A named group of drawn shapes — the unit users add/rename/hide/delete. */
export interface MapOverlay {
  id: string
  name: string
  visible: boolean
}

/** A drawn shape (WGS84): a planted marker or a sketched polygon, living
 * inside one overlay group. */
export type NewMapDrawing =
  | { kind: 'marker'; lon: number; lat: number }
  | { kind: 'polygon'; rings: [number, number][][] }
export type MapDrawing = NewMapDrawing & { id: string; overlayId?: string }

export interface MapState {
  /** 2D flat map (MapView) or 3D globe (SceneView). */
  viewMode: MapViewMode
  pins: MapPin[]
  /** Where to reopen the map; null falls back to the Singapore default. */
  viewpoint: SavedViewpoint | null
  savedRoutes: SavedRoute[]
  /** Show the OSM 3D Buildings scene layer (visible effect in 3D only). */
  buildings: boolean
  /** Show the OSM 3D Trees scene layer (visible effect in 3D only). */
  trees: boolean
  bookmarks: MapBookmark[]
  drawings: MapDrawing[]
  /** The named drawing groups; new shapes land in the active one. */
  overlays: MapOverlay[]
  activeOverlayId: string | null
  /** Pins-layer visibility (the overlays panel's switch). */
  showPins: boolean
  /** Basemap gallery choice: 'auto' follows the app theme; otherwise an id
   * from pages/map basemapCatalog (kept a plain string so the slice never
   * depends on pages/ — the catalog validates and falls back on read). */
  basemap: string
  /** Drone flight tool: cruise height above ground, meters. */
  flightCruise: number
  /** Drone flight: may the planner raise the height over buildings? */
  flightAllowClimb: boolean
  /** Drone flight: max height above ground when climbing, meters. */
  flightCeiling: number
  /** Drone flight: chase-camera follows the drone while it flies. */
  flightFollow: boolean
  savedFlights: SavedFlight[]
}

const initialState: MapState = {
  viewMode: '2d',
  pins: [],
  viewpoint: null,
  savedRoutes: [],
  buildings: true,
  trees: true,
  bookmarks: [],
  drawings: [],
  overlays: [],
  activeOverlayId: null,
  showPins: true,
  basemap: 'auto',
  flightCruise: 60,
  flightAllowClimb: true,
  flightCeiling: 120,
  flightFollow: false,
  savedFlights: [],
}

/** Map-page state (persisted): the 2D/3D choice and the dropped pins. */
const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    setViewMode(state, action: PayloadAction<MapViewMode>) {
      state.viewMode = action.payload
    },
    addPin(state, action: PayloadAction<MapPin>) {
      if (!state.pins) state.pins = []
      state.pins.push(action.payload)
    },
    removePin(state, action: PayloadAction<string>) {
      state.pins = (state.pins ?? []).filter((p) => p.id !== action.payload)
    },
    clearPins(state) {
      state.pins = []
    },
    setViewpoint(state, action: PayloadAction<SavedViewpoint>) {
      state.viewpoint = action.payload
    },
    saveRoute: {
      prepare(route: Omit<SavedRoute, 'id'>) {
        return { payload: { ...route, id: nanoid() } }
      },
      reducer(state, action: PayloadAction<SavedRoute>) {
        if (!state.savedRoutes) state.savedRoutes = []
        state.savedRoutes.push(action.payload)
      },
    },
    deleteRoute(state, action: PayloadAction<string>) {
      state.savedRoutes = (state.savedRoutes ?? []).filter((r) => r.id !== action.payload)
    },
    setBuildings(state, action: PayloadAction<boolean>) {
      state.buildings = action.payload
    },
    setTrees(state, action: PayloadAction<boolean>) {
      state.trees = action.payload
    },
    saveBookmark: {
      prepare(bookmark: Omit<MapBookmark, 'id'>) {
        return { payload: { ...bookmark, id: nanoid() } }
      },
      reducer(state, action: PayloadAction<MapBookmark>) {
        if (!state.bookmarks) state.bookmarks = []
        state.bookmarks.push(action.payload)
      },
    },
    deleteBookmark(state, action: PayloadAction<string>) {
      state.bookmarks = (state.bookmarks ?? []).filter((b) => b.id !== action.payload)
    },
    addDrawing: {
      prepare(drawing: NewMapDrawing & { overlayId: string }) {
        return { payload: { ...drawing, id: nanoid() } }
      },
      reducer(state, action: PayloadAction<MapDrawing>) {
        if (!state.drawings) state.drawings = []
        state.drawings.push(action.payload)
      },
    },
    deleteDrawing(state, action: PayloadAction<string>) {
      state.drawings = (state.drawings ?? []).filter((d) => d.id !== action.payload)
    },
    /** Edit-in-place commit: replace a drawing's geometry, keeping its
     * identity and overlay membership (reshape/move can't change the kind). */
    updateDrawingGeometry(
      state,
      action: PayloadAction<{ id: string; geometry: NewMapDrawing }>,
    ) {
      const i = (state.drawings ?? []).findIndex((d) => d.id === action.payload.id)
      if (i < 0) return
      const { id, overlayId } = state.drawings[i]
      state.drawings[i] = { ...action.payload.geometry, id, overlayId }
    },
    addOverlay: {
      prepare(overlay: Omit<MapOverlay, 'id'>) {
        return { payload: { ...overlay, id: nanoid() } }
      },
      reducer(state, action: PayloadAction<MapOverlay>) {
        if (!state.overlays) state.overlays = []
        state.overlays.push(action.payload)
        state.activeOverlayId = action.payload.id // a new group becomes active
      },
    },
    renameOverlay(state, action: PayloadAction<{ id: string; name: string }>) {
      const overlay = (state.overlays ?? []).find((o) => o.id === action.payload.id)
      if (overlay && action.payload.name.trim()) overlay.name = action.payload.name.trim()
    },
    deleteOverlay(state, action: PayloadAction<string>) {
      state.overlays = (state.overlays ?? []).filter((o) => o.id !== action.payload)
      state.drawings = (state.drawings ?? []).filter((d) => d.overlayId !== action.payload)
      if (state.activeOverlayId === action.payload) {
        state.activeOverlayId = state.overlays[0]?.id ?? null
      }
    },
    setOverlayVisible(state, action: PayloadAction<{ id: string; visible: boolean }>) {
      const overlay = (state.overlays ?? []).find((o) => o.id === action.payload.id)
      if (overlay) overlay.visible = action.payload.visible
    },
    setActiveOverlay(state, action: PayloadAction<string>) {
      if ((state.overlays ?? []).some((o) => o.id === action.payload)) {
        state.activeOverlayId = action.payload
      }
    },
    /** Migration sweep: shapes drawn before overlay groups existed (or whose
     * group vanished) are collected into a new "Imported" overlay. No-op on
     * clean state; dispatched once when the Map page mounts. */
    adoptOrphanDrawings(state) {
      if (!state.overlays) state.overlays = []
      const known = new Set(state.overlays.map((o) => o.id))
      const orphans = (state.drawings ?? []).filter(
        (d) => !d.overlayId || !known.has(d.overlayId),
      )
      if (orphans.length === 0) return
      const overlay: MapOverlay = { id: nanoid(), name: 'Imported', visible: true }
      state.overlays.push(overlay)
      for (const d of orphans) d.overlayId = overlay.id
      state.activeOverlayId ??= overlay.id
    },
    setShowPins(state, action: PayloadAction<boolean>) {
      state.showPins = action.payload
    },
    setBasemap(state, action: PayloadAction<string>) {
      state.basemap = action.payload
    },
    setFlightCruise(state, action: PayloadAction<number>) {
      state.flightCruise = action.payload
    },
    setFlightAllowClimb(state, action: PayloadAction<boolean>) {
      state.flightAllowClimb = action.payload
    },
    setFlightCeiling(state, action: PayloadAction<number>) {
      state.flightCeiling = action.payload
    },
    setFlightFollow(state, action: PayloadAction<boolean>) {
      state.flightFollow = action.payload
    },
    saveFlight: {
      prepare(flight: Omit<SavedFlight, 'id'>) {
        return { payload: { ...flight, id: nanoid() } }
      },
      reducer(state, action: PayloadAction<SavedFlight>) {
        if (!state.savedFlights) state.savedFlights = []
        state.savedFlights.push(action.payload)
      },
    },
    deleteFlight(state, action: PayloadAction<string>) {
      state.savedFlights = (state.savedFlights ?? []).filter((f) => f.id !== action.payload)
    },
  },
})

export const {
  setViewMode,
  addPin,
  removePin,
  clearPins,
  setViewpoint,
  saveRoute,
  deleteRoute,
  setBuildings,
  setTrees,
  saveBookmark,
  deleteBookmark,
  addDrawing,
  deleteDrawing,
  updateDrawingGeometry,
  addOverlay,
  renameOverlay,
  deleteOverlay,
  setOverlayVisible,
  setActiveOverlay,
  adoptOrphanDrawings,
  setShowPins,
  setBasemap,
  setFlightCruise,
  setFlightAllowClimb,
  setFlightCeiling,
  setFlightFollow,
  saveFlight,
  deleteFlight,
} = mapSlice.actions
export default mapSlice.reducer
