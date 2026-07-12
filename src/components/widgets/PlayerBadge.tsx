import { Box, Stack, Typography, keyframes } from '@mui/material'
import type { Seat } from '../../features/avatars/types'
import { useSeatVisual } from '../../features/avatars/useSeatAvatars'

const pulseKf = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`

/**
 * A small head icon + label used as the current-player turn indicator and the
 * winner label in the game footers. `mark` is a player *seat*; the head shown is
 * whichever avatar that seat currently renders as.
 */
export default function PlayerBadge({
  mark,
  label,
  pulse = false,
}: {
  mark: Seat
  label: string
  pulse?: boolean
}) {
  const { Head } = useSeatVisual(mark)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          width: 26,
          height: 26,
          flexShrink: 0,
          animation: pulse ? `${pulseKf} 1s ease-in-out infinite` : 'none',
        }}
      >
        <Head />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Stack>
  )
}
