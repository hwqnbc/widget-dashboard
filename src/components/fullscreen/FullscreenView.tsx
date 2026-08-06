import { useEffect } from 'react'
import { Box, Dialog, IconButton, Stack, Typography } from '@mui/material'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import ScreenRotationIcon from '@mui/icons-material/ScreenRotation'
import { useAppSelector } from '../../app/hooks'
import { widgetMetaByType } from '../../features/widgets/widgetCatalog'
import { useViewport } from '../../hooks/useViewport'

/**
 * The fullscreen overlay for a single widget. Renders a themed, portaled MUI
 * `Dialog` at viewport size (boards scale off their container, so bigger
 * container ⇒ bigger board) whose body is an **empty host**: the board keeps
 * the widget mounted continuously and reparents its live DOM (portal host)
 * into this host via `onHost`, so the running game/canvas is preserved rather
 * than remounted. Shows a rotate hint when the widget declares a
 * `preferredOrientation` the device isn't currently in.
 */
export default function FullscreenView({
  id,
  onClose,
  onHost,
}: {
  id: string | null
  onClose: () => void
  /** Reports the overlay body element (or null when closed) up to the
   * provider, so the board can reparent the live widget into it. */
  onHost: (el: HTMLElement | null) => void
}) {
  const instance = useAppSelector((s) =>
    id ? s.widgets.instances.find((w) => w.id === id) ?? null : null,
  )
  const vp = useViewport()

  // If the open widget was removed, dismiss.
  useEffect(() => {
    if (id && !instance) onClose()
  }, [id, instance, onClose])

  if (!instance) return null

  const meta = widgetMetaByType[instance.type]
  const wantsRotate =
    !!meta.preferredOrientation && vp.orientation !== meta.preferredOrientation

  return (
    <Dialog fullScreen open onClose={onClose}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {meta.title}
          </Typography>
          <IconButton aria-label="Exit full screen" onClick={onClose}>
            <CloseFullscreenIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {/* Empty host — the board reparents the live widget's portal DOM in
           * here (see WidgetBoard's BoardWidget). Callback ref reports it up
           * (and reports null on unmount, so the widget returns to its card). */}
          <Box
            ref={(el: HTMLElement | null) => onHost(el)}
            sx={{ position: 'absolute', inset: 0 }}
          />

          {wantsRotate && (
            <Stack
              data-testid="rotate-hint"
              spacing={1}
              sx={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                bgcolor: 'rgba(0,0,0,0.72)',
                color: '#fff',
                zIndex: 3,
                p: 3,
              }}
            >
              <ScreenRotationIcon sx={{ fontSize: 56 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Rotate your device to {meta.preferredOrientation}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {meta.title} plays best in {meta.preferredOrientation} mode.
              </Typography>
            </Stack>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}
