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
  return (
    <Chip
      size="small"
      icon={<WifiTetheringIcon />}
      data-testid={testId}
      data-status={link.status}
      onClick={onOpen}
      color={link.connected ? 'success' : 'default'}
      variant={link.connected ? 'filled' : 'outlined'}
      label={
        link.connected
          ? `Linked — you are ${link.seat === 'toy' ? 'Player 1' : 'Player 2'}`
          : link.status === 'pairing' || link.status === 'connecting'
            ? 'Pairing…'
            : 'Tap to connect'
      }
      sx={{ alignSelf: 'center' }}
    />
  )
}
