import { useRef, useState } from 'react'
import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import type { AvatarId } from '../../features/avatars/types'
import { AVATAR_IDS } from '../../features/avatars/types'
import { AVATAR_CATALOG, avatarMetaById } from '../../features/avatars/avatarCatalog'
import { avatarVisualById } from '../../registry/avatarRegistry'
import TapStage from './TapStage'

const coerceAvatar = (v: unknown): AvatarId | undefined =>
  typeof v === 'string' && (AVATAR_IDS as string[]).includes(v) ? (v as AvatarId) : undefined

/**
 * A configurable character viewer: pick an avatar and tap to play its action
 * (the toy's "6 7", the ninja's katana draw, …). Reuses the avatar registry, so
 * every present and future avatar's `Action` is available automatically. The
 * selection persists per-widget-instance; the play state is transient.
 */
export default function AvatarActionsWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const avatar = useWidgetField<AvatarId>(id, 'avatar', 'toy', coerceAvatar)
  const [active, setActive] = useState(false)
  // Gates the figure's transition so a freshly selected avatar snaps to its
  // static pose instead of animating on mount.
  const interacted = useRef(false)

  const { Action } = avatarVisualById[avatar]
  const name = avatarMetaById[avatar].name

  const select = (next: AvatarId | null) => {
    if (!next || next === avatar) return
    setActive(false)
    interacted.current = false
    dispatch(updateWidgetData({ id, data: { avatar: next } }))
  }
  const toggle = () => {
    interacted.current = true
    setActive((a) => !a)
  }

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.5 }}
    >
      <Stack direction="row" sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={avatar}
          onChange={(_, v) => select(v as AvatarId | null)}
        >
          {AVATAR_CATALOG.map((a) => {
            const Head = avatarVisualById[a.id].Head
            return (
              <ToggleButton key={a.id} value={a.id} sx={{ textTransform: 'none', gap: 0.5, py: 0.3, px: 0.9 }}>
                <Box sx={{ width: 20, height: 20, flexShrink: 0 }}>
                  <Head />
                </Box>
                {a.name}
              </ToggleButton>
            )
          })}
        </ToggleButtonGroup>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TapStage onClick={toggle} ariaLabel={`${active ? 'Stop' : 'Play'} the ${name} action`}>
          <Action active={active} animate={interacted.current} />
        </TapStage>
      </Box>
    </Box>
  )
}
