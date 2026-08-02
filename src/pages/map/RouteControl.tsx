import { useState } from 'react'
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import UndoIcon from '@mui/icons-material/Undo'
import ClearIcon from '@mui/icons-material/Clear'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import BookmarksIcon from '@mui/icons-material/Bookmarks'
import DeleteIcon from '@mui/icons-material/Delete'
import type { SavedRoute } from '../../features/map/mapSlice'
import type { RouteProfile } from './osrm'
import type { RouteState } from './useOsrmRoute'

function resultLabel(state: RouteState, pointCount: number): string {
  switch (state.status) {
    case 'idle':
      return 'Tap the map: start point'
    case 'picking':
      return 'Tap the map: next point'
    case 'loading':
      return 'Routing…'
    case 'error':
      return 'Route unavailable'
    case 'ok': {
      const pts = pointCount > 2 ? ` · ${pointCount} pts` : ''
      const cap = pointCount >= 25 ? ' (max)' : ''
      return `${state.km} km · ${state.minutes} min${pts}${cap}`
    }
  }
}

/** Profile picker, undo, save/load and result chip for the route tool
 * (data: FOSSGIS OSRM). Tap the map to append waypoints, tap a numbered
 * marker to remove it, tap the drawn line to insert into that leg, drag a
 * marker to move it. */
export default function RouteControl({
  profile,
  onProfileChange,
  pointCount,
  state,
  canUndo,
  onUndo,
  onClear,
  savedRoutes,
  onSave,
  onLoad,
  onDelete,
}: {
  profile: RouteProfile
  onProfileChange: (profile: RouteProfile) => void
  pointCount: number
  state: RouteState
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
  savedRoutes: SavedRoute[]
  onSave: (name: string) => void
  onLoad: (route: SavedRoute) => void
  onDelete: (id: string) => void
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [legsAnchor, setLegsAnchor] = useState<HTMLElement | null>(null)
  const legs = state.status === 'ok' ? (state.legs ?? []) : []

  const openSave = () => {
    setSaveName(`Route ${savedRoutes.length + 1}`)
    setSaveOpen(true)
  }
  const confirmSave = () => {
    onSave(saveName)
    setSaveOpen(false)
  }

  return (
    <>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={profile}
        onChange={(_, v: RouteProfile | null) => {
          if (v) onProfileChange(v)
        }}
        aria-label="Route profile"
      >
        <ToggleButton value="walk" data-testid="map-route-walk" aria-label="Walking">
          <Tooltip title="Walking">
            <DirectionsWalkIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="bike" data-testid="map-route-bike" aria-label="Cycling">
          <Tooltip title="Cycling">
            <DirectionsBikeIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="drive" data-testid="map-route-drive" aria-label="Driving">
          <Tooltip title="Driving">
            <DirectionsCarIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
      <Tooltip title={legs.length > 0 ? 'Per-leg breakdown' : ''}>
        <Chip
          size="small"
          data-testid="map-route-result"
          color={state.status === 'ok' ? 'success' : state.status === 'error' ? 'warning' : 'default'}
          label={resultLabel(state, pointCount)}
          clickable={legs.length > 0}
          onClick={legs.length > 0 ? (e) => setLegsAnchor(e.currentTarget) : undefined}
        />
      </Tooltip>
      <Popover
        open={legsAnchor != null}
        anchorEl={legsAnchor}
        onClose={() => setLegsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <List dense sx={{ minWidth: 200, py: 0.5 }}>
          {legs.map((leg, i) => (
            <ListItem key={i} data-testid="map-route-leg" sx={{ py: 0 }}>
              <ListItemText
                primary={`${i + 1} → ${i + 2}`}
                secondary={`${leg.km} km · ${leg.minutes} min`}
                slotProps={{ primary: { variant: 'body2' } }}
              />
            </ListItem>
          ))}
          <Divider component="li" sx={{ my: 0.5 }} />
          <ListItem sx={{ py: 0 }}>
            <ListItemText
              primary="Total"
              secondary={`${state.km} km · ${state.minutes} min`}
              slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600 } } }}
            />
          </ListItem>
        </List>
      </Popover>
      <Tooltip title="Undo waypoint edit">
        <span>
          <IconButton size="small" data-testid="map-route-undo" aria-label="Undo waypoint edit" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Save route">
        <span>
          <IconButton size="small" data-testid="map-route-save" aria-label="Save route" disabled={pointCount < 2} onClick={openSave}>
            <BookmarkAddIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Saved routes">
        <span>
          <IconButton
            size="small"
            data-testid="map-routes-open"
            aria-label="Saved routes"
            disabled={savedRoutes.length === 0}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <BookmarksIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {pointCount > 0 && (
        <Tooltip title="Clear route">
          <IconButton size="small" data-testid="map-route-clear" aria-label="Clear route" onClick={onClear}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Menu anchorEl={menuAnchor} open={menuAnchor != null} onClose={() => setMenuAnchor(null)}>
        {savedRoutes.map((route) => (
          <MenuItem
            key={route.id}
            data-testid="map-route-item"
            onClick={() => {
              setMenuAnchor(null)
              onLoad(route)
            }}
          >
            <ListItemText
              primary={route.name}
              secondary={`${route.points.length} pts · ${route.profile}`}
            />
            <IconButton
              size="small"
              edge="end"
              aria-label={`Delete ${route.name}`}
              data-testid="map-route-delete"
              sx={{ ml: 2 }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(route.id)
                if (savedRoutes.length <= 1) setMenuAnchor(null)
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save route</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmSave()
            }}
            slotProps={{ htmlInput: { 'data-testid': 'map-route-save-name' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" data-testid="map-route-save-confirm" onClick={confirmSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
