/**
 * The compact "2 Devices" mode control for games whose only play modes are
 * local and online: one icon button, pressed = online. Extracted from Car
 * Park's inline original so every 2-mode widget reads the same and the
 * toolbar row stays narrow — a two-button text group spent a whole row
 * saying what one pressed icon says. Widgets with MORE than two modes (the
 * vs-Computer games, Maze Runner's Solo / 2 Players / 2 Devices) keep their
 * text rows: a binary toggle cannot carry three states.
 *
 * Mode-change POLICY stays in the widget: `onToggle` fires on every tap and
 * the widget decides whether that means switch, confirm-then-switch
 * ("Restart game?" on an in-progress board, "Leave the race?" mid-race), or
 * sync. Like `NetplayChip`, identical everywhere bar the test id.
 */
import { IconButton, Tooltip } from '@mui/material'
import DevicesIcon from '@mui/icons-material/Devices'

export default function NetplayModeToggle({
  online,
  onToggle,
  testId,
  label = '2 Devices',
}: {
  online: boolean
  onToggle(): void
  testId: string
  label?: string
}) {
  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        aria-label={label}
        aria-pressed={online}
        data-testid={testId}
        color={online ? 'primary' : 'default'}
        onClick={onToggle}
        sx={{ flexShrink: 0 }}
      >
        <DevicesIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}
