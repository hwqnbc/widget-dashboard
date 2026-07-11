import { Box, Stack, Typography, keyframes } from '@mui/material'
import ToyHead from './characters/ToyHead'
import NinjaHead from './characters/NinjaHead'
import { PLAYER_COLOR } from './playerColors'

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
  player: 'toy' | 'ninja'
  onSkip: () => void
}) {
  const color = PLAYER_COLOR[player]
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
          {player === 'toy' ? <ToyHead /> : <NinjaHead />}
        </Box>
        <Typography sx={{ fontWeight: 700, color }}>
          {player === 'toy' ? 'Toy' : 'Ninja'}'s turn
        </Typography>
      </Stack>
    </Box>
  )
}
