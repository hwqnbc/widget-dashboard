import { Box, Stack, Typography, keyframes } from '@mui/material'
import type { Seat } from '../../features/avatars/types'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import { useSeatAvatarId } from '../../features/avatars/useSeatAvatars'
import { avatarVisualById } from '../../registry/avatarRegistry'

const popIn = keyframes`
  0%   { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
`

/**
 * A brief "next player's turn" overlay for pass-and-play hand-offs. Fills the
 * (position:relative) board area, dims it, announces the incoming player tinted
 * to their colour, and calls `onSkip` when tapped. The parent auto-dismisses it.
 */
export default function TurnBanner({
  player,
  onSkip,
}: {
  player: Seat
  onSkip: () => void
}) {
  const avatarId = useSeatAvatarId(player)
  const { name, color } = avatarMetaById[avatarId]
  const { Head } = avatarVisualById[avatarId]
  return (
    <Box
      onClick={onSkip}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
        bgcolor: 'rgba(0,0,0,0.5)',
        cursor: 'pointer',
        zIndex: 2,
      }}
    >
      <Stack
        spacing={1}
        sx={{
          alignItems: 'center',
          px: 3,
          py: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: '3px solid',
          borderColor: color,
          boxShadow: 6,
          animation: `${popIn} .2s ease-out`,
        }}
      >
        <Box sx={{ width: 52, height: 52 }}>
          <Head />
        </Box>
        <Typography sx={{ fontWeight: 700, color }}>
          {name}'s turn
        </Typography>
      </Stack>
    </Box>
  )
}
