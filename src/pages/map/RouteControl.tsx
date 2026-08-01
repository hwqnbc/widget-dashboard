import { Chip, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import UndoIcon from '@mui/icons-material/Undo'
import ClearIcon from '@mui/icons-material/Clear'
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

/** Profile picker, undo, and result chip for the route tool (data: FOSSGIS
 * OSRM). Tap the map to append waypoints, tap a numbered marker to remove
 * it, tap the drawn line to insert a waypoint into that leg. */
export default function RouteControl({
  profile,
  onProfileChange,
  pointCount,
  state,
  canUndo,
  onUndo,
  onClear,
}: {
  profile: RouteProfile
  onProfileChange: (profile: RouteProfile) => void
  pointCount: number
  state: RouteState
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
}) {
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
      <Chip size="small" data-testid="map-route-result" color={state.status === 'ok' ? 'success' : state.status === 'error' ? 'warning' : 'default'} label={resultLabel(state, pointCount)} />
      <Tooltip title="Undo waypoint edit">
        <span>
          <IconButton size="small" data-testid="map-route-undo" aria-label="Undo waypoint edit" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon fontSize="small" />
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
    </>
  )
}
