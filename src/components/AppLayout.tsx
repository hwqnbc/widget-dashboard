import { useState } from 'react'
import {
  AppBar,
  Badge,
  Box,
  Button,
  Container,
  IconButton,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import TerminalIcon from '@mui/icons-material/Terminal'
import MapIcon from '@mui/icons-material/Map'
import SettingsIcon from '@mui/icons-material/Settings'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import WidgetsIcon from '@mui/icons-material/Widgets'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { toggleMode } from '../features/ui/uiSlice'
import ErrorBoundary from './ErrorBoundary'
import ConsoleLogDialog from './ConsoleLogDialog'
import FullscreenProvider from './fullscreen/FullscreenProvider'
import { useConsoleIssueCount } from '../hooks/useConsoleLog'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
  { label: 'Map', to: '/map', icon: <MapIcon /> },
  { label: 'Settings', to: '/settings', icon: <SettingsIcon /> },
]

/** App shell: top bar with navigation + theme toggle, and the routed page below. */
export default function AppLayout() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.ui.mode)
  const location = useLocation()
  const [consoleOpen, setConsoleOpen] = useState(false)
  // A number snapshot: the always-mounted badge re-renders only when the
  // warn/error tally moves, never on ordinary console.log traffic.
  const issues = useConsoleIssueCount()

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={1}>
        <Toolbar>
          <WidgetsIcon sx={{ mr: 1 }} />
          {/* brand text + nav labels collapse at xs — the full row overflows a phone */}
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>
            TestSite
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, ml: { xs: 0.5, sm: 4 }, flexGrow: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === '/'}
                startIcon={item.icon}
                color="inherit"
                aria-label={item.label}
                sx={{
                  minWidth: 0,
                  '&.active': { bgcolor: 'rgba(255,255,255,0.16)' },
                  '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 }, ml: { xs: 0, sm: -0.5 } },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {item.label}
                </Box>
              </Button>
            ))}
          </Box>
          {/* Console viewer — a phone has no dev tools, so this lives in the
              app bar: reachable on every page, and still reachable when the
              page below has fallen back to the error boundary. */}
          <Tooltip title="Console log">
            <IconButton
              color="inherit"
              onClick={() => setConsoleOpen(true)}
              data-testid="console-log-button"
              data-issues={issues}
              aria-label="Open console log"
            >
              <Badge badgeContent={issues} color="error" max={99}>
                <TerminalIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton color="inherit" onClick={() => dispatch(toggleMode())}>
              {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <FullscreenProvider>
        <Container maxWidth="xl" sx={{ py: 3, flexGrow: 1 }}>
          {/* A page crash shows a recoverable card instead of unmounting the
              whole app into a blank page; the app bar stays navigable, and
              the pathname key resets the boundary when the route changes. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </Container>
      </FullscreenProvider>
      <ConsoleLogDialog open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </Box>
  )
}
