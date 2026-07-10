import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import SixSevenFigure from './characters/SixSevenFigure'
import SwordNinjaFigure from './characters/SwordNinjaFigure'

/** The ninja draws and sheathes on a loop by toggling `drawn` on an interval.
 * Starts sheathed without animating (animate flips on once the loop begins), so
 * there's no draw/sheathe flash on mount. */
function LoopingNinja() {
  const [drawn, setDrawn] = useState(false)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      setActive(true)
      setDrawn((d) => !d)
    }, 1100)
    return () => clearInterval(t)
  }, [])
  return <SwordNinjaFigure drawn={drawn} animate={active} />
}

/**
 * The winner's looping celebration: the Toy does the "6 7", the Ninja draws and
 * sheathes his sword. Fills and centres within its parent.
 */
export default function WinnerCelebration({ winner }: { winner: 'toy' | 'ninja' }) {
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
      {winner === 'toy' ? <SixSevenFigure playing /> : <LoopingNinja />}
    </Box>
  )
}
