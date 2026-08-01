import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type MapViewMode = '2d' | '3d'

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

export interface MapState {
  /** 2D flat map (MapView) or 3D globe (SceneView). */
  viewMode: MapViewMode
  pins: MapPin[]
  /** Where to reopen the map; null falls back to the Singapore default. */
  viewpoint: SavedViewpoint | null
}

const initialState: MapState = {
  viewMode: '2d',
  pins: [],
  viewpoint: null,
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
  },
})

export const { setViewMode, addPin, removePin, clearPins, setViewpoint } = mapSlice.actions
export default mapSlice.reducer
