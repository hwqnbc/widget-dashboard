import {
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import ReplayIcon from '@mui/icons-material/Replay'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import VideocamIcon from '@mui/icons-material/Videocam'
import type { FlightAnim } from './FlightBinding'
import type { FlightPlan } from './flightPlanModel'
import type { FlightPlanStatus } from './useFlightPlan'

/** Human-readable plan summary: which legs climbed / detoured / blocked. */
function planSummary(plan: FlightPlan, status: FlightPlanStatus): string {
  if (status === 'planning') return 'planning…'
  const parts: string[] = []
  if (plan.climbs > 0) parts.push(`${plan.climbs} climb${plan.climbs > 1 ? 's' : ''}`)
  if (plan.detours > 0) parts.push(`${plan.detours} detour${plan.detours > 1 ? 's' : ''}`)
  if (plan.blocked > 0) parts.push(`${plan.blocked} blocked`)
  const suffix = status === 'error' ? ' · no building data, flying direct' : ''
  return (parts.length > 0 ? parts.join(' · ') : 'clear') + suffix
}

/** Tool-strip controls for the drone flight tool: cruise height, the
 * building-avoidance settings (allow climb + max ceiling), the
 * play/pause/reset animation transport, clear, and the plan readout. */
export default function FlightControl({
  cruise,
  onCruise,
  allowClimb,
  onAllowClimb,
  ceiling,
  onCeiling,
  pointCount,
  km,
  plan,
  planStatus,
  anim,
  follow,
  onFollow,
  onPlay,
  onPause,
  onReset,
  onClear,
}: {
  cruise: number
  onCruise: (m: number) => void
  allowClimb: boolean
  onAllowClimb: (on: boolean) => void
  ceiling: number
  onCeiling: (m: number) => void
  pointCount: number
  km: number
  plan: FlightPlan
  planStatus: FlightPlanStatus
  anim: FlightAnim
  /** Chase-camera follow toggle (persisted). */
  follow: boolean
  onFollow: (on: boolean) => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onClear: () => void
}) {
  const canFly = pointCount >= 2 && plan.blocked === 0 && planStatus !== 'planning'
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        size="small"
        type="number"
        label="Cruise (m)"
        value={cruise}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onCruise(Math.max(10, Math.min(500, Math.round(v))))
        }}
        sx={{ width: 96 }}
        slotProps={{ htmlInput: { 'data-testid': 'map-flight-cruise', min: 10, max: 500 } }}
      />
      <Tooltip title="Allow the route to fly higher over buildings (otherwise it detours around them)">
        <FormControlLabel
          sx={{ mr: 0.5 }}
          control={
            <Switch
              size="small"
              checked={allowClimb}
              onChange={(_, v) => onAllowClimb(v)}
              data-testid="map-flight-climb"
              slotProps={{ input: { 'aria-label': 'Allow climbing over buildings' } }}
            />
          }
          label={<Typography variant="caption">Climb</Typography>}
        />
      </Tooltip>
      {allowClimb && (
        <TextField
          size="small"
          type="number"
          label="Max (m)"
          value={ceiling}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onCeiling(Math.max(20, Math.min(1000, Math.round(v))))
          }}
          sx={{ width: 88 }}
          slotProps={{ htmlInput: { 'data-testid': 'map-flight-ceiling', min: 20, max: 1000 } }}
        />
      )}
      {anim === 'playing' ? (
        <Tooltip title="Pause flight">
          <IconButton size="small" data-testid="map-flight-pause" aria-label="Pause flight" onClick={onPause}>
            <PauseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip
          title={
            plan.blocked > 0
              ? 'A leg is blocked — allow climbing, raise the ceiling, or move a waypoint'
              : 'Fly the route'
          }
        >
          <span>
            <IconButton
              size="small"
              data-testid="map-flight-play"
              aria-label="Fly the route"
              disabled={!canFly}
              onClick={onPlay}
            >
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
      <Tooltip title={follow ? 'Stop following the drone' : 'Follow the drone (3D chase camera)'}>
        <IconButton
          size="small"
          data-testid="map-flight-follow"
          aria-label={follow ? 'Stop following the drone' : 'Follow the drone'}
          color={follow ? 'primary' : 'default'}
          onClick={() => onFollow(!follow)}
        >
          <VideocamIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Back to start">
        <span>
          <IconButton
            size="small"
            data-testid="map-flight-reset"
            aria-label="Back to start"
            disabled={pointCount < 2}
            onClick={onReset}
          >
            <ReplayIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Clear flight plan">
        <span>
          <IconButton
            size="small"
            data-testid="map-flight-clear"
            aria-label="Clear flight plan"
            disabled={pointCount === 0}
            onClick={onClear}
          >
            <DeleteSweepIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" data-testid="map-flight-info">
        {pointCount >= 2
          ? `${km.toFixed(2)} km · ${planSummary(plan, planStatus)}`
          : pointCount === 1
            ? 'Tap the map to add waypoints'
            : 'Tap the map to plant the drone'}
      </Typography>
    </Stack>
  )
}
