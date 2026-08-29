import { Chip } from '@mui/material'
import WifiTetheringIcon from '@mui/icons-material/WifiTethering'
import type { NetplayLink } from '../../features/netplay/useNetplay'

/**
 * Link status, and the way back into the pairing dialog.
 *
 * Identical in every net-played widget bar its test id, so it lives here
 * rather than being copied per game.
 */
export default function NetplayChip({
  link,
  testId,
  onOpen,
}: {
  link: NetplayLink
  testId: string
  onOpen(): void
}) {
  // A lost link and a never-paired link must not read the same: "Tap to
  // connect" on a board that WAS mid-game hides that the game just died.
  const lost = link.status === 'failed' || (link.status === 'closed' && link.role !== null)
  return (
    <Chip
      size="small"
      icon={<WifiTetheringIcon />}
      data-testid={testId}
      data-status={link.status}
      onClick={onOpen}
      color={
        link.connected
          ? 'success'
          : link.status === 'reconnecting'
            ? 'warning'
            : lost
              ? 'error'
              : 'default'
      }
      variant={link.connected || link.status === 'reconnecting' ? 'filled' : 'outlined'}
      label={
        link.connected
          ? `Linked — you are ${link.seat === 'toy' ? 'Player 1' : 'Player 2'}`
          : link.status === 'reconnecting'
            ? 'Reconnecting…'
            : link.status === 'pairing' || link.status === 'connecting'
              ? 'Pairing…'
              : lost
                ? 'Connection lost — tap to re-pair'
                : 'Tap to connect'
      }
      sx={{ alignSelf: 'center' }}
    />
  )
}
