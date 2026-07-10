import { Box, Stack, Typography, keyframes } from '@mui/material'
import ToyHead from './characters/ToyHead'
import NinjaHead from './characters/NinjaHead'

const pulseKf = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
`

/**
 * A small head icon + label used as the current-player turn indicator and the
 * winner label in the game footers.
 */
export default function PlayerBadge({
  mark,
  label,
  pulse = false,
}: {
  mark: 'toy' | 'ninja'
  label: string
  pulse?: boolean
}) {
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
        {mark === 'toy' ? <ToyHead /> : <NinjaHead />}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Stack>
  )
}
