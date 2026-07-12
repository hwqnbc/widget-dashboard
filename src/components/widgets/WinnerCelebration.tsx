import { Box } from '@mui/material'
import type { Seat } from '../../features/avatars/types'
import { useSeatVisual } from '../../features/avatars/useSeatAvatars'

/**
 * The winner's looping celebration: plays the winning seat's avatar "action"
 * (the Toy does the "6 7"; the Ninja draws and sheathes his sword). Fills and
 * centres within its parent.
 */
export default function WinnerCelebration({ winner }: { winner: Seat }) {
  const { Celebration } = useSeatVisual(winner)
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '& svg': { maxHeight: '100%', width: 'auto' },
      }}
    >
      <Celebration />
    </Box>
  )
}
