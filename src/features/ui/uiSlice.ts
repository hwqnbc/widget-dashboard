import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AvatarId, Seat, SeatAvatars } from '../avatars/types'
import { DEFAULT_SEAT_AVATARS } from '../avatars/types'

export type ThemeMode = 'light' | 'dark'

export interface UiState {
  mode: ThemeMode
  /** Which avatar each player seat renders as. Defaults to the identity map. */
  avatars: SeatAvatars
}

const initialState: UiState = {
  mode: 'light',
  avatars: { ...DEFAULT_SEAT_AVATARS },
}

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
    setSeatAvatar(state, action: PayloadAction<{ seat: Seat; avatar: AvatarId }>) {
      if (!state.avatars) state.avatars = { ...DEFAULT_SEAT_AVATARS }
      state.avatars[action.payload.seat] = action.payload.avatar
    },
  },
})

export const { toggleMode, setMode, setSeatAvatar } = uiSlice.actions
export default uiSlice.reducer
