import { forwardRef } from 'react'
import { Box, alpha } from '@mui/material'

/**
 * Fixed centre reticle — "fly to aim". The sim loop flips `data-lock` (and
 * the amber lock styling via direct style writes) only when the lock state
 * actually changes, so aiming causes zero React renders. The `zoom` prop is
 * a low-frequency toggle: scoped, the ring grows and gains a heavier border
 * (the lock styling stays imperative and composes with it).
 */
const Reticle = forwardRef<HTMLDivElement, { zoom?: boolean; testId?: string }>(
  function Reticle({ zoom = false, testId = 'strike-reticle' }, ref) {
    const d = zoom ? 46 : 34
    return (
      <Box
        ref={ref}
        data-testid={testId}
        data-lock="-1"
        data-zoom={zoom ? 'on' : 'off'}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: d,
          height: d,
          marginTop: `${-d / 2}px`,
          marginLeft: `${-d / 2}px`,
          borderRadius: '50%',
          border: `${zoom ? 3 : 2}px solid ${alpha('#fff', 0.75)}`,
          pointerEvents: 'none',
          transition: 'transform 90ms, border-color 90ms, width 120ms, height 120ms',
          // Centre dot.
          '&::before': {
            content: '""',
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 4,
            height: 4,
            margin: '-2px 0 0 -2px',
            borderRadius: '50%',
            bgcolor: 'currentColor',
          },
          color: alpha('#fff', 0.9),
        }}
      />
    )
  },
)

export default Reticle
