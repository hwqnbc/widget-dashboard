import { useState } from 'react'
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import PlaceIcon from '@mui/icons-material/Place'
import PentagonIcon from '@mui/icons-material/Pentagon'
import DeleteIcon from '@mui/icons-material/Delete'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ConfirmDialog from '../../components/widgets/ConfirmDialog'
import type { MapDrawing } from '../../features/map/mapSlice'
import type { DrawMode } from './SketchBinding'

const PANEL_WIDTH = 280

const DRAW_HINTS: Record<Exclude<DrawMode, 'none'>, string> = {
  marker: 'Tap the map to plant markers. Toggle off or press Esc to finish.',
  polygon: 'Click to add vertices; double-click to finish. Esc cancels.',
}

function drawingLabel(drawing: MapDrawing, index: number): string {
  return drawing.kind === 'marker'
    ? `Marker · ${drawing.lat.toFixed(4)}, ${drawing.lon.toFixed(4)}`
    : `Polygon ${index + 1} · ${drawing.rings[0]?.length ?? 0} vertices`
}

/** Right-side slide-out panel: overlay visibility switches, the drawing
 * tools (markers/polygons via SketchBinding) and the drawings list.
 * Positioned inside the map wrapper so it works in fullscreen too. */
export default function OverlaysPanel({
  open,
  is3d,
  buildings,
  onBuildings,
  trees,
  onTrees,
  showPins,
  onShowPins,
  showDrawings,
  onShowDrawings,
  canDraw,
  drawMode,
  onDrawMode,
  drawings,
  onDeleteDrawing,
  onClearDrawings,
}: {
  open: boolean
  is3d: boolean
  buildings: boolean
  onBuildings: (on: boolean) => void
  trees: boolean
  onTrees: (on: boolean) => void
  showPins: boolean
  onShowPins: (on: boolean) => void
  showDrawings: boolean
  onShowDrawings: (on: boolean) => void
  canDraw: boolean
  drawMode: DrawMode
  onDrawMode: (mode: DrawMode) => void
  drawings: MapDrawing[]
  onDeleteDrawing: (id: string) => void
  onClearDrawings: () => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  const overlayRow = (
    label: string,
    checked: boolean,
    onChange: (on: boolean) => void,
    testId: string,
  ) => (
    <ListItem
      secondaryAction={
        <Switch
          size="small"
          edge="end"
          checked={checked}
          onChange={(_, v) => onChange(v)}
          data-testid={testId}
          slotProps={{ input: { 'aria-label': label } }}
        />
      }
      sx={{ py: 0.25 }}
    >
      <ListItemText primary={label} slotProps={{ primary: { variant: 'body2' } }} />
    </ListItem>
  )

  return (
    <Box
      data-testid="map-overlays-panel"
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: PANEL_WIDTH,
        maxWidth: '85%',
        zIndex: 2,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
        overflowY: 'auto',
        p: 1.5,
        transform: open ? 'none' : 'translateX(110%)',
        transition: 'transform 200ms ease',
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Overlays
      </Typography>
      <List dense disablePadding>
        {is3d && overlayRow('3D buildings', buildings, onBuildings, 'map-buildings')}
        {is3d && overlayRow('3D trees', trees, onTrees, 'map-trees')}
        {overlayRow('Pins', showPins, onShowPins, 'map-pins-visible')}
        {overlayRow('Drawings', showDrawings, onShowDrawings, 'map-drawings-visible')}
      </List>

      <Divider sx={{ my: 1 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Draw
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={drawMode === 'none' ? null : drawMode}
        onChange={(_, v: DrawMode | null) => onDrawMode(v ?? 'none')}
        aria-label="Draw tool"
      >
        <ToggleButton
          value="marker"
          data-testid="map-draw-marker"
          aria-label="Plant markers"
          disabled={!canDraw}
        >
          <PlaceIcon fontSize="small" sx={{ mr: 0.5 }} /> Marker
        </ToggleButton>
        <ToggleButton
          value="polygon"
          data-testid="map-draw-polygon"
          aria-label="Draw polygon"
          disabled={!canDraw}
        >
          <PentagonIcon fontSize="small" sx={{ mr: 0.5 }} /> Polygon
        </ToggleButton>
      </ToggleButtonGroup>
      {drawMode !== 'none' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {DRAW_HINTS[drawMode]}
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Drawings ({drawings.length})
        </Typography>
        {drawings.length > 0 && (
          <Tooltip title="Remove all drawings">
            <IconButton
              size="small"
              data-testid="map-drawings-clear"
              onClick={() => setConfirmClear(true)}
            >
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <List dense disablePadding>
        {drawings.map((drawing, i) => (
          <ListItem
            key={drawing.id}
            data-testid="map-drawing-item"
            secondaryAction={
              <IconButton
                size="small"
                edge="end"
                aria-label="Delete drawing"
                data-testid="map-drawing-delete"
                onClick={() => onDeleteDrawing(drawing.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            }
            sx={{ py: 0.25 }}
          >
            <ListItemText
              primary={drawingLabel(drawing, i)}
              slotProps={{ primary: { variant: 'body2' } }}
            />
          </ListItem>
        ))}
      </List>

      <ConfirmDialog
        open={confirmClear}
        title="Remove all drawings?"
        message={`This removes all ${drawings.length} drawn overlays from the map.`}
        confirmLabel="Remove all"
        cancelLabel="Keep drawings"
        onConfirm={() => {
          onClearDrawings()
          setConfirmClear(false)
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </Box>
  )
}
