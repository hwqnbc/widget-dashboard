import { useState } from 'react'
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import type { FlightMode, Weather } from '../droneSim/flightModel'
import type { AimAssistLevel } from './combatModel'
import type { GyroMode } from './gyroAim'
import { gyroNeedsPermission, gyroSupported, requestGyroPermission } from './gyroAim'

function ToggleRow({
  testId,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  testId: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
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
        checked={checked}
        disabled={disabled}
        onChange={(_, next) => onChange(next)}
      />
    </ListItem>
  )
}

/**
 * Drone Strike settings — the drone sim's grouped-dialog pattern (lesson
 * #36): Combat / Flight / World / Defaults, every row described. The gyro
 * row self-gates: hidden where the sensor API is missing, and on iOS the
 * enable flow runs the permission prompt from the switch tap (the required
 * user gesture).
 */
export default function StrikeSettingsPanel({
  id,
  open,
  onClose,
  autoFire,
  aimAssist,
  gyroAim,
  battery,
  weather,
  richWorld,
  minimap,
  flightMode,
  rateSpeed,
  rateYaw,
  stickExpo,
  turbo,
  onNewWorld,
  onResetDefaults,
}: {
  id: string
  open: boolean
  onClose: () => void
  autoFire: boolean
  aimAssist: AimAssistLevel
  gyroAim: GyroMode
  battery: boolean
  weather: Weather
  richWorld: boolean
  minimap: boolean
  flightMode: FlightMode
  rateSpeed: number
  rateYaw: number
  stickExpo: number
  turbo: boolean
  onNewWorld: () => void
  onResetDefaults: () => void
}) {
  const dispatch = useAppDispatch()
  const set = (data: Record<string, unknown>) =>
    dispatch(updateWidgetData({ id, data }))
  const [gyroDenied, setGyroDenied] = useState(false)

  const setGyroMode = async (next: GyroMode) => {
    if (next === 'off') {
      set({ gyroAim: 'off' })
      return
    }
    // The button tap is the user gesture iOS needs for the sensor prompt.
    if (gyroNeedsPermission()) {
      const verdict = await requestGyroPermission()
      if (verdict !== 'granted') {
        setGyroDenied(true)
        return
      }
    }
    setGyroDenied(false)
    set({ gyroAim: next })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Drone Strike settings</DialogTitle>
      <DialogContent data-testid="strike-settings-panel">
        <List dense subheader={<ListSubheader disableGutters>Combat</ListSubheader>}>
          <ToggleRow
            testId="strike-autofire-toggle"
            label="Auto-fire"
            description="The gun fires by itself while the reticle holds on a target — both thumbs stay on the sticks."
            checked={autoFire}
            onChange={(next) => set({ autoFire: next })}
          />
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="Aim assist"
              secondary="Lock-on cone size and how far bolts bend toward the locked target."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              data-testid="strike-assist"
              value={aimAssist}
              onChange={(_, v) => {
                if (v) set({ aimAssist: v as AimAssistLevel })
              }}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              <ToggleButton value="off" data-testid="strike-assist-off">
                Off
              </ToggleButton>
              <ToggleButton value="mild" data-testid="strike-assist-mild">
                Mild
              </ToggleButton>
              <ToggleButton value="strong" data-testid="strike-assist-strong">
                Strong
              </ToggleButton>
            </ToggleButtonGroup>
          </ListItem>
          {gyroSupported() && (
            <ListItem disableGutters sx={{ py: 0.5 }}>
              <ListItemText
                primary="Gyro fine-aim"
                secondary={
                  gyroDenied
                    ? 'Motion access was denied — allow it in the browser settings and try again.'
                    : 'Tilt the device to nudge the reticle. "Zoom" = only while scoped (the classic scope-gyro).'
                }
                slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
              />
              <ToggleButtonGroup
                size="small"
                exclusive
                data-testid="strike-gyro"
                value={gyroAim}
                onChange={(_, v) => {
                  if (v) void setGyroMode(v as GyroMode)
                }}
                sx={{ ml: 1.5, flexShrink: 0 }}
              >
                <ToggleButton value="off" data-testid="strike-gyro-off">
                  Off
                </ToggleButton>
                <ToggleButton value="zoom" data-testid="strike-gyro-zoom">
                  Zoom
                </ToggleButton>
                <ToggleButton value="always" data-testid="strike-gyro-always">
                  Always
                </ToggleButton>
              </ToggleButtonGroup>
            </ListItem>
          )}
          <ToggleRow
            testId="strike-battery-toggle"
            label="Battery"
            description="Charge drains in flight and carries across waves; land on the spawn pad to recharge. A dead battery auto-descends and can't power the gun."
            checked={battery}
            onChange={(next) => set({ battery: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>Flight</ListSubheader>}>
          <ToggleRow
            testId="strike-mode-toggle"
            label="Acro flight mode"
            description="Real gravity and attitude-based thrust; momentum coasts — and pitching the drone becomes your vertical aim. Off = beginner altitude hold."
            checked={flightMode === 'acro'}
            onChange={(next) => set({ flightMode: next ? 'acro' : 'hold' })}
          />
          <Stack sx={{ px: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {`Max speed ×${rateSpeed.toFixed(1)}`}
            </Typography>
            <Slider
              data-testid="strike-tune-speed"
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
              data-testid="strike-tune-yaw"
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
              data-testid="strike-tune-expo"
              size="small"
              min={0}
              max={0.8}
              step={0.05}
              value={stickExpo}
              onChange={(_, v) => set({ stickExpo: v as number })}
            />
          </Stack>
          <ToggleRow
            testId="strike-tune-turbo"
            label="Turbo"
            description="+40% max speed and yaw rate on top of the sliders — makes dodging return fire easier too."
            checked={turbo}
            onChange={(next) => set({ turbo: next })}
          />
        </List>
        <List dense subheader={<ListSubheader disableGutters>World</ListSubheader>}>
          <ToggleRow
            testId="strike-weather-toggle"
            label="Storm weather"
            description="Gusting wind pushes the drone, rain falls, dusk light — bolts fly true regardless."
            checked={weather === 'storm'}
            onChange={(next) => set({ weather: next ? 'storm' : 'clear' })}
          />
          <ToggleRow
            testId="strike-rich-toggle"
            label="Rich scenery"
            description="Trees, roads with traffic, rooftop details and drifting clouds."
            checked={richWorld}
            onChange={(next) => set({ richWorld: next })}
          />
          <ToggleRow
            testId="strike-minimap-toggle"
            label="Minimap"
            description="Top-down radar with buildings, target blips and your heading."
            checked={minimap}
            onChange={(next) => set({ minimap: next })}
          />
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="New city"
              secondary="Shuffle the buildings into a fresh seeded layout and restart the run from wave 1."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<ShuffleIcon />}
              data-testid="strike-new-world"
              onClick={onNewWorld}
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
              secondary="Restore every setting above to its default. Best score/wave, the camera view and the city seed are kept."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsBackupRestoreIcon />}
              data-testid="strike-settings-reset"
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
