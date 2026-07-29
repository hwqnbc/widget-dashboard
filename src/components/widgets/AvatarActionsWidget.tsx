import { Suspense, useState } from 'react'
import {
  Box,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import type { AvatarId } from '../../features/avatars/types'
import { AVATAR_IDS } from '../../features/avatars/types'
import { AVATAR_CATALOG, avatarMetaById } from '../../features/avatars/avatarCatalog'
import { avatarVisualById } from '../../registry/avatarRegistry'

const coerceAvatar = (v: unknown): AvatarId | undefined =>
  typeof v === 'string' && (AVATAR_IDS as string[]).includes(v) ? (v as AvatarId) : undefined

type FigureView = '2d' | '3d'
const coerceFigureView = (v: unknown): FigureView | undefined =>
  v === '2d' || v === '3d' ? v : undefined

/**
 * A configurable character viewer: pick an avatar and flip the Idle/Celebrate
 * toggle to play its celebration — the looping victory animation, uniform
 * across every avatar (so there's no per-avatar inconsistency between one-shot
 * and looping moves). An explicit labelled toggle (not a tap on the figure —
 * an invisible tap surface gave no feedback about what, if anything, it did).
 * Reuses the avatar registry, so every present and future avatar is available
 * automatically. A 2D/3D view toggle swaps the SVG figure for the avatar's
 * lazy three.js `Figure3D`; avatars without one show a "not available"
 * placeholder there, with the celebration toggle disabled (nothing would
 * visibly play). The selection and view persist per-widget-instance; the play
 * state is transient and resets on avatar/view switches.
 */
export default function AvatarActionsWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const avatar = useWidgetField<AvatarId>(id, 'avatar', 'toy', coerceAvatar)
  const view = useWidgetField<FigureView>(id, 'view', '2d', coerceFigureView)
  const [active, setActive] = useState(false)

  const { Head, Figure, Celebration, Figure3D } = avatarVisualById[avatar]
  const name = avatarMetaById[avatar].name
  const unavailable3d = view === '3d' && !Figure3D

  const select = (next: AvatarId | null) => {
    if (!next || next === avatar) return
    setActive(false)
    dispatch(updateWidgetData({ id, data: { avatar: next } }))
  }
  const selectView = (next: FigureView | null) => {
    if (!next || next === view) return
    setActive(false)
    dispatch(updateWidgetData({ id, data: { view: next } }))
  }

  return (
    <Box
      className="widget-no-drag"
      data-testid="avatar-actions"
      data-avatar={avatar}
      data-view={view}
      data-figure3d={Figure3D ? 'available' : 'unavailable'}
      data-playing={active ? 'yes' : 'no'}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.5 }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 0.5,
          columnGap: 1,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v) => selectView(v as FigureView | null)}
          data-testid="avatar-view-toggle"
          aria-label="Figure view"
        >
          <ToggleButton value="2d" sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            2D
          </ToggleButton>
          <ToggleButton value="3d" sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            3D
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={active ? 'celebrate' : 'idle'}
          onChange={(_, v) => {
            if (v) setActive(v === 'celebrate')
          }}
          data-testid="celebration-toggle"
          aria-label="Celebration"
        >
          <ToggleButton value="idle" disabled={unavailable3d} sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            Idle
          </ToggleButton>
          <ToggleButton value="celebrate" disabled={unavailable3d} sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            Celebrate
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={avatar}
          onChange={(_, v) => select(v as AvatarId | null)}
          data-testid="avatar-picker"
          sx={{ flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {AVATAR_CATALOG.map((a) => {
            const PickerHead = avatarVisualById[a.id].Head
            return (
              <ToggleButton key={a.id} value={a.id} sx={{ textTransform: 'none', gap: 0.5, py: 0.3, px: 0.9 }}>
                <Box sx={{ width: 20, height: 20, flexShrink: 0 }}>
                  <PickerHead />
                </Box>
                {a.name}
              </ToggleButton>
            )
          })}
        </ToggleButtonGroup>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {unavailable3d ? (
          <Box
            data-testid="figure3d-unavailable"
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              color: 'text.secondary',
            }}
          >
            <Box sx={{ width: 56, height: 56 }}>
              <Head />
            </Box>
            <Typography variant="body2">{name} has no 3D figure yet</Typography>
          </Box>
        ) : (
          <Box
            data-testid="avatar-stage"
            aria-label={`${name} ${active ? 'celebration' : 'figure'}`}
            sx={{
              height: '100%',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // The figures render a full-width wrapper div whose inline svg
              // is narrower (width:auto below): centre it. TapStage got this
              // for free from <button>'s UA default text-align:center.
              textAlign: 'center',
              '& svg': { maxHeight: '100%', width: 'auto' },
            }}
          >
            {view === '3d' && Figure3D ? (
              <Box data-testid="figure3d-stage" sx={{ width: '100%', height: '100%' }}>
                <Suspense
                  fallback={
                    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                      <CircularProgress size={24} />
                    </Box>
                  }
                >
                  <Figure3D playing={active} />
                </Suspense>
              </Box>
            ) : active ? (
              <Celebration />
            ) : (
              <Figure />
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
