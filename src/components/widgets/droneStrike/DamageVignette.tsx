import { forwardRef } from 'react'
import { Box } from '@mui/material'

/**
 * Damage feedback: a red vignette around the screen edge. At rest it is
 * invisible (or a faint constant edge while on the last heart); a player
 * hit flashes it via `flashVignette` — imperative style writes from the
 * hit path, like the sim's horizon overlay, so taking fire never
 * re-renders React. `data-flash` counts the flashes (the e2e-observable
 * side of the effect).
 */
const DamageVignette = forwardRef<HTMLDivElement, { lowHp: boolean; testId?: string }>(
  function DamageVignette({ lowHp, testId = 'strike-damage' }, ref) {
    return (
      <Box
        ref={ref}
        data-testid={testId}
        data-flash="0"
        data-low-hp={lowHp ? 'on' : 'off'}
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 60px 18px rgba(229, 57, 53, 0.6)',
          // Resting opacity — flashVignette returns here after each hit.
          opacity: lowHp ? 0.3 : 0,
          transition: 'opacity 600ms ease-out',
        }}
      />
    )
  },
)

export default DamageVignette
