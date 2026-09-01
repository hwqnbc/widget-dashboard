import { IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import ReplayIcon from '@mui/icons-material/Replay'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import type { FlightAnim } from './FlightBinding'

/** Tool-strip controls for the drone flight tool: cruise height, the
 * play/pause/reset animation transport, clear, and the path length. */
export default function FlightControl({
  cruise,
  onCruise,
  pointCount,
  km,
  anim,
  onPlay,
  onPause,
  onReset,
  onClear,
}: {
  cruise: number
  onCruise: (m: number) => void
  pointCount: number
  km: number
  anim: FlightAnim
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onClear: () => void
}) {
  const canFly = pointCount >= 2
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
      {anim === 'playing' ? (
        <Tooltip title="Pause flight">
          <IconButton size="small" data-testid="map-flight-pause" aria-label="Pause flight" onClick={onPause}>
            <PauseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Fly the route">
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
      <Tooltip title="Back to start">
        <span>
          <IconButton
            size="small"
            data-testid="map-flight-reset"
            aria-label="Back to start"
            disabled={!canFly}
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
        {canFly
          ? `${km.toFixed(2)} km`
          : pointCount === 1
            ? 'Tap the map to add waypoints'
            : 'Tap the map to plant the drone'}
      </Typography>
    </Stack>
  )
}
