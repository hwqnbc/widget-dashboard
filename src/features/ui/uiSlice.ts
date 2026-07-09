import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ThemeMode = 'light' | 'dark'

export interface UiState {
  mode: ThemeMode
}

const initialState: UiState = { mode: 'light' }

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleMode(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light'
    },
    setMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload
    },
  },
})

export const { toggleMode, setMode } = uiSlice.actions
export default uiSlice.reducer
