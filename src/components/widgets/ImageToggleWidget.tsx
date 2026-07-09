import { Box, Button } from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import type { WidgetProps } from '../../registry/widgetRegistry'
import Boy from './characters/Boy'
import ToyFigure from './characters/ToyFigure'

type Character = 'toy' | 'boy'

const LABELS: Record<Character, string> = {
  toy: 'Toy Figure',
  boy: 'Boy',
}

/** Shared styling for each side of the flip card. */
const faceSx = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Hide whichever side is facing away mid-flip.
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  '& > div': { height: '100%' },
  '& svg': { maxHeight: '100%', width: 'auto' },
} as const

/**
 * Shows one of two cartoon SVG characters and morphs between them with a
 * 3D flip on tap. The current choice persists in the widget's redux `data`.
 */
export default function ImageToggleWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const character = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    return inst?.data.character === 'boy' ? 'boy' : 'toy'
  }) as Character

  const other = character === 'toy' ? 'boy' : 'toy'
  // Toy is the front face (0°); Boy is the back face (180°).
  const flipped = character === 'boy'

  const toggle = () =>
    dispatch(updateWidgetData({ id, data: { character: other } }))

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      {/* Tappable flip card — morphs between the two characters. */}
      <Box
        component="button"
        type="button"
        onClick={toggle}
        aria-label={`Switch character (showing ${LABELS[character]})`}
        sx={{
          flexGrow: 1,
          width: '100%',
          minHeight: 0,
          p: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          perspective: '900px',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform .55s cubic-bezier(.4, 0, .2, 1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* front face — Toy Figure */}
          <Box sx={faceSx}>
            <ToyFigure pose="idle" />
          </Box>
          {/* back face — Boy (pre-rotated so it reads correctly once flipped) */}
          <Box sx={{ ...faceSx, transform: 'rotateY(180deg)' }}>
            <Boy pose="idle" />
          </Box>
        </Box>
      </Box>

      <Button
        variant="outlined"
        size="small"
        onClick={toggle}
        startIcon={<SwapHorizIcon />}
      >
        {LABELS[character]}
      </Button>
    </Box>
  )
}
