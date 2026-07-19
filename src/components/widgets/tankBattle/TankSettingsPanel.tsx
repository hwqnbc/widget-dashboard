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
import type { Weather } from '../droneSim/flightModel'
import type { GyroMode } from '../droneStrike/gyroAim'
import {
  gyroNeedsPermission,
  gyroSupported,
  requestGyroPermission,
} from '../droneStrike/gyroAim'
import type { AimAssistLevel } from './shellModel'
import type { BattleMode } from './battleLayout'
import type { Roughness } from './terrain'

function ToggleRow({
  testId,
  label,
  description,
  checked,
  onChange,
}: {
  testId: string
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
        checked={checked}
        onChange={(_, next) => onChange(next)}
      />
    </ListItem>
  )
}

/**
 * Tank Battle settings — the grouped-dialog pattern (lesson #36): Battle /
 * Combat / Driving / World / Defaults, every row described. Mode and
 * terrain changes destroy progress, so they route through the body's
 * confirm guard (callbacks) rather than dispatching directly.
 */
export default function TankSettingsPanel({
  id,
  open,
  onClose,
  battleMode,
  onModeChange,
  autoFire,
  autoTurn,
  aimAssist,
  gyroAim,
  weather,
  roughness,
  onRoughnessChange,
  minimap,
  rateSpeed,
  rateTraverse,
  stickExpo,
  onNewWorld,
  onResetDefaults,
}: {
  id: string
  open: boolean
  onClose: () => void
  battleMode: BattleMode
  /** Routed through the body: switching modes restarts the battle. */
  onModeChange: (next: BattleMode) => void
  autoFire: boolean
  autoTurn: boolean
  aimAssist: AimAssistLevel
  gyroAim: GyroMode
  weather: Weather
  roughness: Roughness
  /** Routed through the body: reshaping the terrain restarts the battle. */
  onRoughnessChange: (next: Roughness) => void
  minimap: boolean
  rateSpeed: number
  rateTraverse: number
  stickExpo: number
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
      <DialogTitle sx={{ pb: 0 }}>Tank Battle settings</DialogTitle>
      <DialogContent data-testid="tank-settings-panel">
        <List dense subheader={<ListSubheader disableGutters>Battle</ListSubheader>}>
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="Game mode"
              secondary="Waves: survive escalating packs. Roam: hunt a garrison spread across the whole map, against the clock."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              data-testid="tank-mode"
              value={battleMode}
              onChange={(_, v) => {
                if (v) onModeChange(v as BattleMode)
              }}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              <ToggleButton value="waves" data-testid="tank-mode-waves">
                Waves
              </ToggleButton>
              <ToggleButton value="roam" data-testid="tank-mode-roam">
                Roam
              </ToggleButton>
            </ToggleButtonGroup>
          </ListItem>
        </List>
        <List dense subheader={<ListSubheader disableGutters>Combat</ListSubheader>}>
          <ToggleRow
            testId="tank-autofire-toggle"
            label="Auto-fire"
            description="The cannon fires by itself when the reticle holds a lock and the gun is loaded — both thumbs stay on the sticks."
            checked={autoFire}
            onChange={(next) => set({ autoFire: next })}
          />
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="Aim assist"
              secondary="Lock-on cone size and how far shells bend toward the locked tank."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              data-testid="tank-assist"
              value={aimAssist}
              onChange={(_, v) => {
                if (v) set({ aimAssist: v as AimAssistLevel })
              }}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              <ToggleButton value="off" data-testid="tank-assist-off">
                Off
              </ToggleButton>
              <ToggleButton value="mild" data-testid="tank-assist-mild">
                Mild
              </ToggleButton>
              <ToggleButton value="strong" data-testid="tank-assist-strong">
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
                    : 'Tilt the device to nudge the aim. "Zoom" = only while scoped (the classic scope-gyro).'
                }
                slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
              />
              <ToggleButtonGroup
                size="small"
                exclusive
                data-testid="tank-gyro"
                value={gyroAim}
                onChange={(_, v) => {
                  if (v) void setGyroMode(v as GyroMode)
                }}
                sx={{ ml: 1.5, flexShrink: 0 }}
              >
                <ToggleButton value="off" data-testid="tank-gyro-off">
                  Off
                </ToggleButton>
                <ToggleButton value="zoom" data-testid="tank-gyro-zoom">
                  Zoom
                </ToggleButton>
                <ToggleButton value="always" data-testid="tank-gyro-always">
                  Always
                </ToggleButton>
              </ToggleButtonGroup>
            </ListItem>
          )}
        </List>
        <List dense subheader={<ListSubheader disableGutters>Driving</ListSubheader>}>
          <ToggleRow
            testId="tank-autoturn-toggle"
            label="Auto-turn hull"
            description="While driving forward the hull follows your camera heading — steer with throttle alone. The left stick's X always overrides."
            checked={autoTurn}
            onChange={(next) => set({ autoTurn: next })}
          />
          <Stack sx={{ px: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {`Tank speed ×${rateSpeed.toFixed(1)}`}
            </Typography>
            <Slider
              data-testid="tank-tune-speed"
              size="small"
              min={0.5}
              max={2}
              step={0.1}
              value={rateSpeed}
              onChange={(_, v) => set({ rateSpeed: v as number })}
            />
            <Typography variant="caption" color="text.secondary">
              {`Aim / traverse ×${rateTraverse.toFixed(1)}`}
            </Typography>
            <Slider
              data-testid="tank-tune-traverse"
              size="small"
              min={0.5}
              max={2}
              step={0.1}
              value={rateTraverse}
              onChange={(_, v) => set({ rateTraverse: v as number })}
            />
            <Typography variant="caption" color="text.secondary">
              {`Stick expo ${Math.round(stickExpo * 100)}%`}
            </Typography>
            <Slider
              data-testid="tank-tune-expo"
              size="small"
              min={0}
              max={0.8}
              step={0.05}
              value={stickExpo}
              onChange={(_, v) => set({ stickExpo: v as number })}
            />
          </Stack>
        </List>
        <List dense subheader={<ListSubheader disableGutters>World</ListSubheader>}>
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="Terrain roughness"
              secondary="How dramatic the contour is — gentle plains to rugged ridgelines. Reshaping the land restarts the battle."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              data-testid="tank-roughness"
              value={roughness}
              onChange={(_, v) => {
                if (v) onRoughnessChange(v as Roughness)
              }}
              sx={{ ml: 1.5, flexShrink: 0 }}
            >
              <ToggleButton value="gentle" data-testid="tank-roughness-gentle">
                Gentle
              </ToggleButton>
              <ToggleButton value="rolling" data-testid="tank-roughness-rolling">
                Rolling
              </ToggleButton>
              <ToggleButton value="rugged" data-testid="tank-roughness-rugged">
                Rugged
              </ToggleButton>
            </ToggleButtonGroup>
          </ListItem>
          <ToggleRow
            testId="tank-weather-toggle"
            label="Storm weather"
            description="Rain and a brooding dusk over the battlefield — shells fly true regardless."
            checked={weather === 'storm'}
            onChange={(next) => set({ weather: next ? 'storm' : 'clear' })}
          />
          <ToggleRow
            testId="tank-minimap-toggle"
            label="Minimap"
            description="Top-down tactical map with the contour, enemy blips and your heading."
            checked={minimap}
            onChange={(next) => set({ minimap: next })}
          />
          <ListItem disableGutters sx={{ py: 0.5 }}>
            <ListItemText
              primary="New battlefield"
              secondary="Roll a fresh seeded terrain and restart the battle. Your bests are kept."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<ShuffleIcon />}
              data-testid="tank-new-world"
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
              secondary="Restore every setting above to its default. Bests, the game mode and the terrain seed are kept."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<SettingsBackupRestoreIcon />}
              data-testid="tank-settings-reset"
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
