import { Box, alpha } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'

/**
 * ADS scope toggle — tap to zoom, tap again to unzoom (the mobile-shooter
 * convention: no held finger, so unlike FireButton it needs no pointer
 * capture hardening; a plain click can't get stuck). Sits above the fire
 * button, inside the right thumb's reach.
 */
export default function ScopeButton({
  size,
  zoom,
  onToggle,
  sx,
}: {
  size: number
  zoom: boolean
  onToggle: () => void
  sx?: SxProps<Theme>
}) {
  return (
    <Box
      data-testid="strike-zoom"
      data-zoom={zoom ? 'on' : 'off'}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onToggle}
      sx={[
        {
          p: 1, // thumb-friendly hit area beyond the visible circle
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha(zoom ? '#ffb300' : '#ffffff', zoom ? 0.55 : 0.16),
          border: `2px solid ${alpha('#fff', zoom ? 0.85 : 0.4)}`,
          color: alpha('#fff', 0.95),
          transition: 'background-color 90ms, border-color 90ms',
        }}
      >
        <CenterFocusStrongIcon sx={{ fontSize: size * 0.55 }} />
      </Box>
    </Box>
  )
}
