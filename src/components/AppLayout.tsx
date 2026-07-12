import { AppBar, Box, Button, Container, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import SettingsIcon from '@mui/icons-material/Settings'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import WidgetsIcon from '@mui/icons-material/Widgets'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { toggleMode } from '../features/ui/uiSlice'
import FullscreenProvider from './fullscreen/FullscreenProvider'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <DashboardIcon /> },
  { label: 'Settings', to: '/settings', icon: <SettingsIcon /> },
]

/** App shell: top bar with navigation + theme toggle, and the routed page below. */
export default function AppLayout() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.ui.mode)

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={1}>
        <Toolbar>
          <WidgetsIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
            TestSite
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, ml: 4, flexGrow: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === '/'}
                startIcon={item.icon}
                color="inherit"
                sx={{ '&.active': { bgcolor: 'rgba(255,255,255,0.16)' } }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton color="inherit" onClick={() => dispatch(toggleMode())}>
              {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <FullscreenProvider>
        <Container maxWidth="xl" sx={{ py: 3, flexGrow: 1 }}>
          <Outlet />
        </Container>
      </FullscreenProvider>
    </Box>
  )
}
