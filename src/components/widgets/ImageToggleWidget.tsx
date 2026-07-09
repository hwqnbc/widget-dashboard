import type { ComponentType } from 'react'
import { Box, Button } from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import type { WidgetProps } from '../../registry/widgetRegistry'
import Boy from './characters/Boy'
import ToyFigure from './characters/ToyFigure'

type Character = 'toy' | 'boy'

/** Both characters share this prop signature. */
type CharacterComponent = ComponentType<{
  pose?: 'idle' | 'brace'
  facing?: 1 | -1
}>

const CHARACTERS: Record<Character, { label: string; Component: CharacterComponent }> = {
  toy: { label: 'Toy Figure', Component: ToyFigure },
  boy: { label: 'Boy', Component: Boy },
}

/**
 * Shows one of two cartoon SVG characters and toggles between them on tap.
 * The current choice persists in the widget's redux `data`.
 */
export default function ImageToggleWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const character = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    return inst?.data.character === 'boy' ? 'boy' : 'toy'
  }) as Character

  const { label, Component } = CHARACTERS[character]
  const other = character === 'toy' ? 'boy' : 'toy'

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
      {/* Tappable image area — toggles the character. */}
      <Box
        component="button"
        type="button"
        onClick={toggle}
        aria-label={`Switch character (showing ${label})`}
        sx={{
          flexGrow: 1,
          width: '100%',
          minHeight: 0,
          p: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Keep the tall character within the widget instead of overflowing.
          '& > div': { height: '100%' },
          '& svg': { maxHeight: '100%', width: 'auto' },
          transition: 'transform .1s ease',
          '&:active': { transform: 'scale(0.96)' },
        }}
      >
        <Component pose="idle" />
      </Box>

      <Button
        variant="outlined"
        size="small"
        onClick={toggle}
        startIcon={<SwapHorizIcon />}
      >
        {label}
      </Button>
    </Box>
  )
}
