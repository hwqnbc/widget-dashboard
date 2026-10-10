import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import type { AirframeId } from './airframes'
import type { AssistLevel } from './assists'

/**
 * Wing Flyer settings (portaled MUI Dialog, the drone/tank pattern): the
 * plane, the assist level and the pitch convention. Every change is applied
 * immediately and persisted by the body (`onChange`).
 */
export default function WingSettingsPanel({
  open,
  onClose,
  airframe,
  assist,
  invertPitch,
  onChange,
}: {
  open: boolean
  onClose: () => void
  airframe: AirframeId
  assist: AssistLevel
  invertPitch: boolean
  onChange: (patch: Record<string, unknown>) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} data-testid="wingflyer-settings-dialog" fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 0 }}>Wing Flyer settings</DialogTitle>
      <DialogContent>
        <List dense subheader={<ListSubheader disableGutters>Aircraft</ListSubheader>}>
          <ListItem disableGutters>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={airframe}
              onChange={(_, v: AirframeId | null) => v && onChange({ airframe: v })}
            >
              <ToggleButton value="trainer" data-testid="wingflyer-airframe-trainer">
                Trainer
              </ToggleButton>
              <ToggleButton value="wing" data-testid="wingflyer-airframe-wing">
                FPV Wing
              </ToggleButton>
            </ToggleButtonGroup>
          </ListItem>
        </List>
        <List dense subheader={<ListSubheader disableGutters>Assist</ListSubheader>}>
          <ListItem disableGutters>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={assist}
              onChange={(_, v: AssistLevel | null) => v && onChange({ assist: v })}
            >
              <ToggleButton value="trainer" data-testid="wingflyer-assist-trainer">
                Trainer
              </ToggleButton>
              <ToggleButton value="normal" data-testid="wingflyer-assist-normal">
                Normal
              </ToggleButton>
              <ToggleButton value="acro" data-testid="wingflyer-assist-acro">
                Acro
              </ToggleButton>
            </ToggleButtonGroup>
          </ListItem>
          <ListItem disableGutters>
            <ListItemText
              secondary={
                assist === 'trainer'
                  ? 'Levels itself when you let go, holds height, throttle is automatic, can’t stall.'
                  : assist === 'normal'
                    ? 'Levels itself when you let go. You control the throttle — it can stall.'
                    : 'Sticks set roll/pitch rate and it holds any attitude — loops, rolls, inverted.'
              }
            />
          </ListItem>
        </List>
        <List dense subheader={<ListSubheader disableGutters>Controls</ListSubheader>}>
          <ListItem disableGutters>
            <ListItemText
              primary="Invert pitch"
              secondary="Off (RC style): pull the right stick back to climb."
              slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { sx: { fontSize: 12 } } }}
            />
            <Switch
              size="small"
              data-testid="wingflyer-invert-pitch"
              checked={invertPitch}
              onChange={(_, next) => onChange({ invertPitch: next })}
            />
          </ListItem>
        </List>
      </DialogContent>
    </Dialog>
  )
}
