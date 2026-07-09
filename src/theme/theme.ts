import { createTheme, type Theme } from '@mui/material/styles'
import type { ThemeMode } from '../features/ui/uiSlice'

/** Build the MUI theme for the given color mode. */
export function buildTheme(mode: ThemeMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#5c6bc0' },
      secondary: { main: '#26a69a' },
      ...(mode === 'light'
        ? { background: { default: '#f4f5f7', paper: '#ffffff' } }
        : { background: { default: '#121212', paper: '#1e1e1e' } }),
    },
    shape: { borderRadius: 10 },
  })
}
