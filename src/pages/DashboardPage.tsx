import { useState } from 'react'
import { Box, Button, Menu, MenuItem, Stack, Typography, ListItemText } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useAppDispatch } from '../app/hooks'
import { addWidget } from '../features/widgets/widgetsSlice'
import { WIDGET_CATALOG } from '../features/widgets/widgetCatalog'
import type { WidgetType } from '../features/widgets/types'
import WidgetBoard from '../components/WidgetBoard'

/** The main dashboard: an "Add widget" menu plus the widget board. */
export default function DashboardPage() {
  const dispatch = useAppDispatch()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleAdd = (type: WidgetType) => {
    dispatch(addWidget(type))
    setAnchorEl(null)
  }

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Drag widgets by their header, resize from the bottom-right corner.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          Add widget
        </Button>
        <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
          {WIDGET_CATALOG.map((meta) => (
            <MenuItem key={meta.type} onClick={() => handleAdd(meta.type)}>
              <ListItemText primary={meta.title} secondary={meta.description} />
            </MenuItem>
          ))}
        </Menu>
      </Stack>
      <WidgetBoard />
    </Box>
  )
}
