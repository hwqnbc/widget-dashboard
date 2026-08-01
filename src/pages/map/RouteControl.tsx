import { Chip, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import ClearIcon from '@mui/icons-material/Clear'
import type { RouteProfile } from './osrm'
import type { RouteState } from './useOsrmRoute'

const RESULT_LABEL: Record<RouteState['status'], (s: RouteState) => string> = {
  idle: () => 'Tap the map: start point',
  picking: () => 'Tap the map: end point',
  loading: () => 'Routing…',
  ok: (s) => `${s.km} km · ${s.minutes} min`,
  error: () => 'Route unavailable',
}

/** Profile picker + result chip for the route tool (data: FOSSGIS OSRM). */
export default function RouteControl({
  profile,
  onProfileChange,
  pointCount,
  state,
  onClear,
}: {
  profile: RouteProfile
  onProfileChange: (profile: RouteProfile) => void
  pointCount: number
  state: RouteState
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
      <Chip
        size="small"
        data-testid="map-route-result"
        color={state.status === 'ok' ? 'success' : state.status === 'error' ? 'warning' : 'default'}
        label={RESULT_LABEL[state.status](state)}
      />
      {pointCount > 0 && (
        <Tooltip title="Clear route">
          <IconButton size="small" data-testid="map-route-clear" onClick={onClear}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </>
  )
}
