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

/** A named, persisted camera view — same shape the viewport memory uses. */
export interface MapBookmark {
  id: string
  name: string
  viewpoint: SavedViewpoint
}

/** A drawn overlay (WGS84): a planted marker or a sketched polygon. */
export type NewMapDrawing =
  | { kind: 'marker'; lon: number; lat: number }
  | { kind: 'polygon'; rings: [number, number][][] }
export type MapDrawing = NewMapDrawing & { id: string }

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
  /** Overlay-layer visibility (the overlays panel's switches). */
  showPins: boolean
  showDrawings: boolean
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
  showPins: true,
  showDrawings: true,
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
      prepare(drawing: NewMapDrawing) {
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
    clearDrawings(state) {
      state.drawings = []
    },
    setShowPins(state, action: PayloadAction<boolean>) {
      state.showPins = action.payload
    },
    setShowDrawings(state, action: PayloadAction<boolean>) {
      state.showDrawings = action.payload
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
  clearDrawings,
  setShowPins,
  setShowDrawings,
} = mapSlice.actions
export default mapSlice.reducer
