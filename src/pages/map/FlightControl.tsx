import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import ReplayIcon from '@mui/icons-material/Replay'
import DeleteIcon from '@mui/icons-material/Delete'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import VideocamIcon from '@mui/icons-material/Videocam'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import BookmarksIcon from '@mui/icons-material/Bookmarks'
import type { SavedFlight } from '../../features/map/mapSlice'
import type { FlightAnim, FlightGroundPoint } from './FlightBinding'
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
 * play/pause/reset animation transport, save/load of named flight plans,
 * clear, and the plan readout. */
export default function FlightControl({
  cruise,
  onCruise,
  allowClimb,
  onAllowClimb,
  ceiling,
  onCeiling,
  points,
  onAltChange,
  km,
  plan,
  planStatus,
  anim,
  follow,
  onFollow,
  savedFlights,
  onSave,
  onLoad,
  onDelete,
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
  /** The planted waypoints (for the per-waypoint altitude list). */
  points: FlightGroundPoint[]
  /** Set (or clear, with undefined) one waypoint's altitude override. */
  onAltChange: (index: number, alt: number | undefined) => void
  km: number
  plan: FlightPlan
  planStatus: FlightPlanStatus
  anim: FlightAnim
  /** Chase-camera follow toggle (persisted). */
  follow: boolean
  onFollow: (on: boolean) => void
  /** Saved flight plans (persisted): save the current one, load or delete. */
  savedFlights: SavedFlight[]
  onSave: (name: string) => void
  onLoad: (flight: SavedFlight) => void
  onDelete: (id: string) => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onClear: () => void
}) {
  const pointCount = points.length
  const canFly = pointCount >= 2 && plan.blocked === 0 && planStatus !== 'planning'
  const [wpAnchor, setWpAnchor] = useState<HTMLElement | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const openSave = () => {
    setSaveName(`Flight ${savedFlights.length + 1}`)
    setSaveOpen(true)
  }
  const confirmSave = () => {
    onSave(saveName)
    setSaveOpen(false)
  }
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
      <Tooltip title="Waypoint altitudes">
        <span>
          <IconButton
            size="small"
            data-testid="map-flight-waypoints"
            aria-label="Waypoint altitudes"
            disabled={pointCount === 0}
            onClick={(e) => setWpAnchor(e.currentTarget)}
          >
            <FormatListNumberedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={wpAnchor != null}
        anchorEl={wpAnchor}
        onClose={() => setWpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Waypoint altitudes (m above ground)
          </Typography>
          {points.map((p, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={1}
              data-testid="map-flight-wp-row"
              sx={{ alignItems: 'center' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 24 }}>
                {i === 0 ? 'D' : String(i)}
              </Typography>
              <TextField
                size="small"
                type="number"
                placeholder={String(cruise)}
                value={p.alt ?? ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    onAltChange(i, undefined)
                    return
                  }
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) onAltChange(i, Math.max(10, Math.min(500, Math.round(v))))
                }}
                sx={{ width: 110 }}
                slotProps={{ htmlInput: { 'data-testid': 'map-flight-wp-alt', min: 10, max: 500 } }}
              />
            </Stack>
          ))}
          <Typography variant="caption" color="text.secondary">
            Blank = fly at cruise ({cruise} m)
          </Typography>
        </Box>
      </Popover>
      <Tooltip title="Save flight plan">
        <span>
          <IconButton
            size="small"
            data-testid="map-flight-save"
            aria-label="Save flight plan"
            disabled={pointCount < 2}
            onClick={openSave}
          >
            <BookmarkAddIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Saved flight plans">
        <span>
          <IconButton
            size="small"
            data-testid="map-flights-open"
            aria-label="Saved flight plans"
            disabled={savedFlights.length === 0}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <BookmarksIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={menuAnchor} open={menuAnchor != null} onClose={() => setMenuAnchor(null)}>
        {savedFlights.map((flight) => (
          <MenuItem
            key={flight.id}
            data-testid="map-flight-item"
            onClick={() => {
              setMenuAnchor(null)
              onLoad(flight)
            }}
          >
            <ListItemText
              primary={flight.name}
              secondary={`${flight.points.length} pts · ${flight.cruise} m`}
            />
            <IconButton
              size="small"
              edge="end"
              aria-label={`Delete ${flight.name}`}
              data-testid="map-flight-delete"
              sx={{ ml: 2 }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(flight.id)
                if (savedFlights.length <= 1) setMenuAnchor(null)
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save flight plan</DialogTitle>
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
            slotProps={{ htmlInput: { 'data-testid': 'map-flight-save-name' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" data-testid="map-flight-save-confirm" onClick={confirmSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
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
