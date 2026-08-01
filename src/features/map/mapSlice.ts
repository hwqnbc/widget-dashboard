import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type MapViewMode = '2d' | '3d'

/** A user-dropped map pin (WGS84 lon/lat). */
export interface MapPin {
  id: string
  lon: number
  lat: number
}

export interface MapState {
  /** 2D flat map (MapView) or 3D globe (SceneView). */
  viewMode: MapViewMode
  pins: MapPin[]
}

const initialState: MapState = {
  viewMode: '2d',
  pins: [],
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
  },
})

export const { setViewMode, addPin, removePin, clearPins } = mapSlice.actions
export default mapSlice.reducer
