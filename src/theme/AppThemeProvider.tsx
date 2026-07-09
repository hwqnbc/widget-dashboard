import { useMemo, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { useAppSelector } from '../app/hooks'
import { buildTheme } from './theme'

/** Wires the MUI theme to the `ui.mode` value held in redux. */
export default function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppSelector((state) => state.ui.mode)
  const theme = useMemo(() => buildTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
