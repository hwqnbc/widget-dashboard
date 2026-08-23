import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
} from '@mui/material'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import DeleteIcon from '@mui/icons-material/Delete'
import type { MapBookmark } from '../../features/map/mapSlice'

/** Save/jump list for camera-view bookmarks (the RouteControl save/menu
 * pattern). Saving needs a ready view — the parent gates `canSave`. */
export default function BookmarksControl({
  bookmarks,
  canSave,
  onSave,
  onLoad,
  onDelete,
}: {
  bookmarks: MapBookmark[]
  canSave: boolean
  onSave: (name: string) => void
  onLoad: (bookmark: MapBookmark) => void
  onDelete: (id: string) => void
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const openSave = () => {
    setSaveName(`Bookmark ${bookmarks.length + 1}`)
    setSaveOpen(true)
  }
  const confirmSave = () => {
    onSave(saveName)
    setSaveOpen(false)
  }

  return (
    <>
      <Tooltip title="Bookmark this view">
        <span>
          <IconButton
            size="small"
            data-testid="map-bookmark-save"
            aria-label="Bookmark this view"
            disabled={!canSave}
            onClick={openSave}
          >
            <StarBorderIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Bookmarked views">
        <span>
          <IconButton
            size="small"
            data-testid="map-bookmarks-open"
            aria-label="Bookmarked views"
            disabled={bookmarks.length === 0}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <StarIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Menu anchorEl={menuAnchor} open={menuAnchor != null} onClose={() => setMenuAnchor(null)}>
        {bookmarks.map((bookmark) => (
          <MenuItem
            key={bookmark.id}
            data-testid="map-bookmark-item"
            onClick={() => {
              setMenuAnchor(null)
              onLoad(bookmark)
            }}
          >
            <ListItemText
              primary={bookmark.name}
              secondary={
                Number.isFinite(bookmark.viewpoint?.lat) && Number.isFinite(bookmark.viewpoint?.lon)
                  ? `${bookmark.viewpoint.z != null ? '3D' : '2D'} · ${bookmark.viewpoint.lat.toFixed(3)}, ${bookmark.viewpoint.lon.toFixed(3)}`
                  : 'saved view'
              }
            />
            <IconButton
              size="small"
              edge="end"
              aria-label={`Delete ${bookmark.name}`}
              data-testid="map-bookmark-delete"
              sx={{ ml: 2 }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(bookmark.id)
                if (bookmarks.length <= 1) setMenuAnchor(null)
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Bookmark this view</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmSave()
            }}
            slotProps={{ htmlInput: { 'data-testid': 'map-bookmark-save-name' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" data-testid="map-bookmark-save-confirm" onClick={confirmSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
