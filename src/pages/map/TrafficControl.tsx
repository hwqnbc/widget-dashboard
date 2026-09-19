import { useState } from 'react'
import {
  Box,
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
import { checkpointCams, updatedLabel, type TrafficCam } from './trafficModel'

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
 * fetch returns the latest snapshot per camera), the JB↔SG checkpoints
 * quick view, and the status caption. */
export default function TrafficControl({
  count,
  status,
  updatedAt,
  cams,
  onRefresh,
}: {
  count: number
  status: TrafficStatus
  /** ISO time of the last successful load (the caption's "updated"). */
  updatedAt: string
  /** The full camera list (the checkpoint view derives its subset). */
  cams: TrafficCam[]
  onRefresh: () => void
}) {
  const [checkpointsOpen, setCheckpointsOpen] = useState(false)
  const checkpoints = checkpointCams(cams)
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
      <Tooltip title="JB ↔ SG crossing cameras (Causeway + Second Link) in one view">
        <span>
          <Button
            size="small"
            data-testid="map-traffic-checkpoints"
            disabled={checkpoints.length === 0}
            onClick={() => setCheckpointsOpen(true)}
          >
            Checkpoints
          </Button>
        </span>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" data-testid="map-traffic-info">
        {statusLabel(count, status, updatedAt)}
      </Typography>
      <Dialog
        open={checkpointsOpen}
        onClose={() => setCheckpointsOpen(false)}
        maxWidth="md"
        fullWidth
        data-testid="map-checkpoints-dialog"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          JB ↔ SG checkpoints
          <Tooltip title="Refresh snapshots">
            <span>
              <IconButton
                size="small"
                data-testid="map-checkpoints-refresh"
                aria-label="Refresh checkpoint snapshots"
                disabled={status === 'loading'}
                onClick={onRefresh}
                sx={{ ml: 1 }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1.5,
            }}
          >
            {checkpoints.map((cam) => (
              <CheckpointTile key={cam.id} cam={cam} />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            LTA cameras — 2701 looks across the Causeway toward JB, so the
            queue back to Singapore shows on it. Malaysia-side networks have
            no public feed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button data-testid="map-checkpoints-close" onClick={() => setCheckpointsOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

/** One checkpoint camera: label + snapshot with a per-tile error fallback
 * (keyed remount via the parent resets `broken` on a fresh URL). */
function CheckpointTile({ cam }: { cam: TrafficCam & { label: string } }) {
  const [broken, setBroken] = useState(false)
  const captured = new Date(cam.timestamp)
  return (
    <Box data-testid="map-checkpoint-tile" data-id={cam.id}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {cam.label}
      </Typography>
      {broken ? (
        <Typography variant="body2" color="text.secondary">
          Image unavailable — refresh and try again.
        </Typography>
      ) : (
        <img
          key={cam.imageUrl}
          src={cam.imageUrl}
          alt={`${cam.label} camera`}
          data-testid="map-checkpoint-image"
          onError={() => setBroken(true)}
          style={{ width: '100%', borderRadius: 4, display: 'block' }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        {Number.isNaN(captured.getTime()) ? '' : `captured ${captured.toLocaleTimeString()}`}
      </Typography>
    </Box>
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
