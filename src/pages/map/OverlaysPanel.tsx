import { Fragment, useState } from 'react'
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PentagonIcon from '@mui/icons-material/Pentagon'
import PlaceIcon from '@mui/icons-material/Place'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ConfirmDialog from '../../components/widgets/ConfirmDialog'
import type { MapDrawing, MapOverlay } from '../../features/map/mapSlice'
import type { DrawMode } from './SketchBinding'

const PANEL_WIDTH = 280

const DRAW_HINTS: Record<Exclude<DrawMode, 'none'>, string> = {
  marker: 'Tap the map to plant markers into the active overlay. Esc to finish.',
  polygon: 'Click to add vertices, double-click to finish. Esc cancels.',
}

function drawingLabel(drawing: MapDrawing): string {
  return drawing.kind === 'marker'
    ? `Marker · ${drawing.lat.toFixed(4)}, ${drawing.lon.toFixed(4)}`
    : `Polygon · ${drawing.rings[0]?.length ?? 0} vertices`
}

/** Right-side slide-out panel: layer visibility switches, the draw tools,
 * and the named overlay groups (add / rename / show-hide / delete; the
 * ACTIVE overlay receives new shapes). Positioned inside the map wrapper so
 * it works in fullscreen too. */
export default function OverlaysPanel({
  open,
  is3d,
  buildings,
  onBuildings,
  trees,
  onTrees,
  showPins,
  onShowPins,
  canDraw,
  drawMode,
  onDrawMode,
  overlays,
  activeOverlayId,
  drawings,
  onAddOverlay,
  onRenameOverlay,
  onDeleteOverlay,
  onOverlayVisible,
  onActivateOverlay,
  onDeleteDrawing,
}: {
  open: boolean
  is3d: boolean
  buildings: boolean
  onBuildings: (on: boolean) => void
  trees: boolean
  onTrees: (on: boolean) => void
  showPins: boolean
  onShowPins: (on: boolean) => void
  canDraw: boolean
  drawMode: DrawMode
  onDrawMode: (mode: DrawMode) => void
  overlays: MapOverlay[]
  activeOverlayId: string | null
  drawings: MapDrawing[]
  onAddOverlay: () => void
  onRenameOverlay: (id: string, name: string) => void
  onDeleteOverlay: (id: string) => void
  onOverlayVisible: (id: string, visible: boolean) => void
  onActivateOverlay: (id: string) => void
  onDeleteDrawing: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState<MapOverlay | null>(null)
  const [renaming, setRenaming] = useState<MapOverlay | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const shapesOf = (overlayId: string) => drawings.filter((d) => d.overlayId === overlayId)

  const requestDelete = (overlay: MapOverlay) => {
    if (shapesOf(overlay.id).length === 0) onDeleteOverlay(overlay.id)
    else setConfirmDelete(overlay)
  }

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
        Layers
      </Typography>
      <List dense disablePadding>
        {is3d && overlayRow('3D buildings', buildings, onBuildings, 'map-buildings')}
        {is3d && overlayRow('3D trees', trees, onTrees, 'map-trees')}
        {overlayRow('Pins', showPins, onShowPins, 'map-pins-visible')}
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

      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>
          My overlays
        </Typography>
        <Button size="small" startIcon={<AddIcon />} data-testid="map-overlay-add" onClick={onAddOverlay}>
          New
        </Button>
      </Box>
      {overlays.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No overlays yet — create one, or just start drawing.
        </Typography>
      )}
      <List dense disablePadding>
        {overlays.map((overlay) => {
          const shapes = shapesOf(overlay.id)
          const active = overlay.id === activeOverlayId
          const expanded = expandedId === overlay.id
          return (
            <Fragment key={overlay.id}>
              <ListItem
                data-testid="map-overlay-item"
                data-active={active ? 'yes' : 'no'}
                data-visible={overlay.visible ? 'yes' : 'no'}
                data-count={shapes.length}
                disablePadding
                sx={{
                  borderLeft: 2,
                  borderColor: active ? 'primary.main' : 'transparent',
                  pr: 0,
                }}
              >
                <IconButton
                  size="small"
                  aria-label={expanded ? 'Collapse shapes' : 'Expand shapes'}
                  data-testid="map-overlay-expand"
                  onClick={() => setExpandedId(expanded ? null : overlay.id)}
                >
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
                <ListItemButton
                  data-testid="map-overlay-name"
                  onClick={() => onActivateOverlay(overlay.id)}
                  sx={{ px: 0.5, py: 0.25, minWidth: 0 }}
                >
                  <ListItemText
                    primary={overlay.name}
                    secondary={`${shapes.length} shape${shapes.length === 1 ? '' : 's'}`}
                    slotProps={{
                      primary: { variant: 'body2', noWrap: true, sx: { fontWeight: active ? 700 : 400 } },
                    }}
                  />
                </ListItemButton>
                <Tooltip title={overlay.visible ? 'Hide overlay' : 'Show overlay'}>
                  <IconButton
                    size="small"
                    aria-label={overlay.visible ? 'Hide overlay' : 'Show overlay'}
                    data-testid="map-overlay-eye"
                    onClick={() => onOverlayVisible(overlay.id, !overlay.visible)}
                  >
                    {overlay.visible ? (
                      <VisibilityIcon fontSize="small" />
                    ) : (
                      <VisibilityOffIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Rename overlay">
                  <IconButton
                    size="small"
                    aria-label="Rename overlay"
                    data-testid="map-overlay-rename"
                    onClick={() => {
                      setRenaming(overlay)
                      setRenameValue(overlay.name)
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete overlay">
                  <IconButton
                    size="small"
                    aria-label="Delete overlay"
                    data-testid="map-overlay-delete"
                    onClick={() => requestDelete(overlay)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItem>
              <Collapse in={expanded} unmountOnExit>
                <List dense disablePadding sx={{ pl: 4 }}>
                  {shapes.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No shapes yet.
                    </Typography>
                  )}
                  {shapes.map((drawing) => (
                    <ListItem
                      key={drawing.id}
                      data-testid="map-drawing-item"
                      secondaryAction={
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label="Delete shape"
                          data-testid="map-drawing-delete"
                          onClick={() => onDeleteDrawing(drawing.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      }
                      sx={{ py: 0 }}
                    >
                      <ListItemText
                        primary={drawingLabel(drawing)}
                        slotProps={{ primary: { variant: 'caption' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Fragment>
          )
        })}
      </List>

      <Dialog open={renaming != null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename overlay</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renaming) {
                onRenameOverlay(renaming.id, renameValue)
                setRenaming(null)
              }
            }}
            slotProps={{ htmlInput: { 'data-testid': 'map-overlay-rename-name' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button
            variant="contained"
            data-testid="map-overlay-rename-confirm"
            onClick={() => {
              if (renaming) onRenameOverlay(renaming.id, renameValue)
              setRenaming(null)
            }}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete != null}
        title={`Delete "${confirmDelete?.name ?? ''}"?`}
        message={`This removes the overlay and its ${
          confirmDelete ? shapesOf(confirmDelete.id).length : 0
        } shapes from the map.`}
        confirmLabel="Delete"
        cancelLabel="Keep overlay"
        onConfirm={() => {
          if (confirmDelete) onDeleteOverlay(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </Box>
  )
}
