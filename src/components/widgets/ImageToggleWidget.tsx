import { Box, Button } from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import Boy from './characters/boy/Boy'
import ToyFigure from './characters/toy/ToyFigure'
import TapStage from './TapStage'

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
  const character = useWidgetField<Character>(id, 'character', 'toy', (v) =>
    v === 'boy' ? 'boy' : 'toy',
  )

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
      <TapStage
        onClick={toggle}
        ariaLabel={`Switch character (showing ${LABELS[character]})`}
        sx={{ flexGrow: 1, height: 'auto', minHeight: 0, perspective: '900px' }}
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
      </TapStage>

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
