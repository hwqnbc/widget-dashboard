import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { ReactNode } from 'react'

/**
 * A full-size, chrome-less `<button>` that centres its SVG child and scales it
 * to fit. Shared by the tap-to-animate character widgets (Six Seven, Sword
 * Ninja) so they don't each re-declare the same reset styles. Extra `sx` is
 * merged in for variants.
 */
export default function TapStage({
  onClick,
  ariaLabel,
  children,
  sx,
}: {
  onClick: () => void
  ariaLabel: string
  children: ReactNode
  sx?: SxProps<Theme>
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        height: '100%',
        width: '100%',
        p: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '& svg': { maxHeight: '100%', width: 'auto' },
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}
