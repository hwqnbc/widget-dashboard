import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  Slider,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import type { FlightMode, Weather } from './flightModel'
import { MAX_FOLLOW, MIN_FOLLOW } from './operatorWalk'
import { MAX_GATES, MIN_GATES } from './worldLayout'

function ToggleRow({
  testId,
  stateAttr,
  stateValue,
  label,
  description,
  checked,
  onChange,
}: {
  testId: string
  stateAttr: string
  stateValue: string
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <ListItem disableGutters sx={{ py: 0.5 }}>
      <ListItemText
        primary={label}
        secondary={description}
        slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
      />
      <Switch
        size="small"
        data-testid={testId}
        {...{ [stateAttr]: stateValue }}
        checked={checked}
        onChange={(_, next) => onChange(next)}
      />
    </ListItem>
  )
}

/**
 * All mode toggles and tuning in one described place — the top-right cluster
 * outgrew per-feature icon buttons. Grouped Gameplay / Environment / Tuning /
 * Course; every row carries the same data-testid + state attribute its old
 * icon button had, so the E2E contract is unchanged apart from opening this
 * panel first.
 */
export default function SettingsPanel({
  id,
  open,
  onClose,
  flightMode,
  crashes,
  landing,
  battery,
  weather,
  richWorld,
  minimap,
  rateSpeed,
  rateYaw,
  stickExpo,
  turbo,
  followDist,
  fpvPolish,
  gateCount,
  onGateCount,
  onResetDefaults,
  onNewCourse,
}: {
  id: string
  open: boolean
  onClose: () => void
  flightMode: FlightMode
  crashes: boolean
  landing: boolean
  battery: boolean
  weather: Weather
  richWorld: boolean
  minimap: boolean
  rateSpeed: number
  rateYaw: number
  stickExpo: number
  turbo: boolean
  followDist: number
  fpvPolish: boolean
  gateCount: number
  onGateCount: (n: number) => void
  onResetDefaults: () => void
  onNewCourse: () => void
}) {
  const dispatch = useAppDispatch()
  const set = (data: Record<string, unknown>) =>
    dispatch(updateWidgetData({ id, data }))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Drone Sim settings</DialogTitle>
      <DialogContent data-testid="dronesim-settings-panel">
        <List dense subheader={<ListSubheader disableGutters>Gameplay</ListSubheader>}>
          <ToggleRow
            testId="dronesim-mode-toggle"
            stateAttr="data-mode"
            stateValue={flightMode}
            label="Acro flight mode"
            description="Real gravity and attitude-based thrust; momentum coasts. Off = beginner altitude hold."
            checked={flightMode === 'acro'}
            onChange={(next) => set({ flightMode: next ? 'acro' : 'hold' })}
          />
          <ToggleRow
            testId="dronesim-crash-toggle"
            stateAttr="data-crashes"
            stateValue={crashes ? 'on' : 'off'}
            label="Crash mode"
            description="Hard wall impacts tumble the drone and respawn it on the pad, voiding the lap."
            checked={crashes}
            onChange={(next) => set({ crashes: next })}
          />
          <ToggleRow
            testId="dronesim-landing-toggle"
            stateAttr="data-landing"
            stateValue={landing ? 'on' : 'off'}
            label="Landing challenge"
            description="Score precision touchdowns on the cyan rooftop pads — look for the light beacons."
            checked={landing}
            onChange={(next) => set({ landing: next })}
          />
          <ToggleRow
            testId="dronesim-battery-toggle"
            stateAttr="data-battery"
            stateValue={battery ? 'on' : 'off'}
            label="Battery"
            description="Charge drains in flight; land on the spawn pad (or rooftop pads) to recharge."
            checked={battery}
            onChange={(next) => set({ battery: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>Environment</ListSubheader>}>
          <ToggleRow
            testId="dronesim-weather-toggle"
            stateAttr="data-weather"
            stateValue={weather}
            label="Storm weather"
            description="Gusting wind pushes the drone, rain falls, dusk light."
            checked={weather === 'storm'}
            onChange={(next) => set({ weather: next ? 'storm' : 'clear' })}
          />
          <ToggleRow
            testId="dronesim-rich-toggle"
            stateAttr="data-rich"
            stateValue={richWorld ? 'on' : 'off'}
            label="Rich scenery"
            description="Trees, roads with traffic, rooftop details and drifting clouds."
            checked={richWorld}
            onChange={(next) => set({ richWorld: next })}
          />
          <ToggleRow
            testId="dronesim-minimap-toggle"
            stateAttr="data-minimap"
            stateValue={minimap ? 'on' : 'off'}
            label="Minimap"
            description="Top-down inset with buildings, gates and your heading."
            checked={minimap}
            onChange={(next) => set({ minimap: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>Tuning</ListSubheader>}>
          <Stack sx={{ px: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {`Max speed ×${rateSpeed.toFixed(1)}`}
            </Typography>
            <Slider
              data-testid="dronesim-tune-speed"
              size="small"
              min={0.5}
              max={2}
              step={0.1}
              value={rateSpeed}
              onChange={(_, v) => set({ rateSpeed: v as number })}
            />
            <Typography variant="caption" color="text.secondary">
              {`Yaw rate ×${rateYaw.toFixed(1)}`}
            </Typography>
            <Slider
              data-testid="dronesim-tune-yaw"
              size="small"
              min={0.5}
              max={2}
              step={0.1}
              value={rateYaw}
              onChange={(_, v) => set({ rateYaw: v as number })}
            />
            <Typography variant="caption" color="text.secondary">
              {`Stick expo ${Math.round(stickExpo * 100)}%`}
            </Typography>
            <Slider
              data-testid="dronesim-tune-expo"
              size="small"
              min={0}
              max={0.8}
              step={0.05}
              value={stickExpo}
              onChange={(_, v) => set({ stickExpo: v as number })}
            />
          </Stack>
          <ToggleRow
            testId="dronesim-tune-turbo"
            stateAttr="data-turbo"
            stateValue={turbo ? 'on' : 'off'}
            label="Turbo"
            description="+40% max speed and yaw rate on top of the sliders."
            checked={turbo}
            onChange={(next) => set({ turbo: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>Pilot</ListSubheader>}>
          <Stack sx={{ px: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {`Follow distance: ${followDist} — how far the walking pilot stands back from the drone (larger = less neck-craning under a high hover)`}
            </Typography>
            <Slider
              data-testid="dronesim-follow-dist"
              size="small"
              min={MIN_FOLLOW}
              max={MAX_FOLLOW}
              step={1}
              marks
              value={followDist}
              onChangeCommitted={(_, v) => set({ followDist: v as number })}
            />
          </Stack>
          <ToggleRow
            testId="dronesim-fpv-toggle"
            stateAttr="data-fpv"
            stateValue={fpvPolish ? 'on' : 'off'}
            label="FPV feel"
            description="First person only: camera banks with turns, subtle speed shake, artificial-horizon line."
            checked={fpvPolish}
            onChange={(next) => set({ fpvPolish: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>Course</ListSubheader>}>
          <Stack sx={{ px: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {`Gates per lap: ${gateCount}`}
            </Typography>
            <Slider
              data-testid="dronesim-gate-count"
              size="small"
              min={MIN_GATES}
              max={MAX_GATES}
              step={1}
              marks
              value={gateCount}
              // Committed only — changing lap length rebuilds the course and
              // may need a stats-clearing confirmation; mid-drag would spam it.
              onChangeCommitted={(_, v) => onGateCount(v as number)}
            />
          </Stack>
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="New course"
              secondary="Shuffle the buildings and gates into a fresh seeded layout (clears laps, best time and ghost)."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<ShuffleIcon />}
              data-testid="dronesim-new-course"
              onClick={onNewCourse}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              Shuffle
            </Button>
          </ListItem>
        </List>
        <List dense subheader={<ListSubheader disableGutters>Defaults</ListSubheader>}>
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="Reset settings"
              secondary="Restore every setting above to its default. Records, camera view and the course seed are kept — unless the lap length has to revert, which clears lap stats."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsBackupRestoreIcon />}
              data-testid="dronesim-settings-reset"
              onClick={onResetDefaults}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              Reset
            </Button>
          </ListItem>
        </List>
      </DialogContent>
    </Dialog>
  )
}
