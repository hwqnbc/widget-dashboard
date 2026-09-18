import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { updatedLabel, type TrafficCam } from './trafficModel'

export type TrafficStatus = 'idle' | 'loading' | 'ready' | 'error'

function statusLabel(count: number, status: TrafficStatus, updatedAt: string): string {
  switch (status) {
    case 'loading':
      return 'loading cameras…'
    case 'error':
      return 'cameras unavailable — retry'
    case 'ready':
      return `${count} cameras · ${updatedLabel(updatedAt)} · tap a marker`
    case 'idle':
      return ''
  }
}

/** Tool-strip row for the traffic-camera tool: a refresh button (every
 * fetch returns the latest snapshot per camera) and the status caption. */
export default function TrafficControl({
  count,
  status,
  updatedAt,
  onRefresh,
}: {
  count: number
  status: TrafficStatus
  /** ISO time of the last successful load (the caption's "updated"). */
  updatedAt: string
  onRefresh: () => void
}) {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Tooltip title="Refresh camera locations and images">
        <span>
          <IconButton
            size="small"
            data-testid="map-traffic-refresh"
            aria-label="Refresh traffic cameras"
            disabled={status === 'loading'}
            onClick={onRefresh}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" data-testid="map-traffic-info">
        {statusLabel(count, status, updatedAt)}
      </Typography>
    </Stack>
  )
}

/** The clicked camera's live snapshot in a dialog: image (with a graceful
 * "unavailable" fallback), capture time and coordinates. */
export function TrafficDialog({
  cam,
  onClose,
}: {
  cam: TrafficCam | null
  onClose: () => void
}) {
  const [broken, setBroken] = useState(false)
  const captured = cam ? new Date(cam.timestamp) : null
  return (
    <Dialog
      open={cam != null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="map-traffic-dialog"
      slotProps={{ transition: { onExited: () => setBroken(false) } }}
    >
      <DialogTitle>Camera {cam?.id}</DialogTitle>
      <DialogContent>
        {cam && !broken ? (
          <img
            src={cam.imageUrl}
            alt={`Traffic camera ${cam.id}`}
            data-testid="map-traffic-image"
            onError={() => setBroken(true)}
            style={{ width: '100%', borderRadius: 4, display: 'block' }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Image unavailable — refresh the cameras and try again.
          </Typography>
        )}
        {cam && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {captured && !Number.isNaN(captured.getTime())
              ? `captured ${captured.toLocaleTimeString()} · `
              : ''}
            {cam.lat.toFixed(5)}, {cam.lon.toFixed(5)}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button data-testid="map-traffic-close" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
