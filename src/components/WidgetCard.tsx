import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, IconButton, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'

interface WidgetCardProps {
  title: string
  onRemove: () => void
  children: ReactNode
}

/**
 * Card chrome around a widget. The header carries the `widget-drag-handle`
 * class so react-grid-layout only initiates a drag from the header, leaving
 * the body interactive.
 */
export default function WidgetCard({ title, onRemove, children }: WidgetCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <CardHeader
        className="widget-drag-handle"
        avatar={<DragIndicatorIcon fontSize="small" color="action" />}
        title={title}
        // MUI v9 replaced `titleTypographyProps` with the `slotProps` API;
        // the old prop leaks onto the DOM and React warns about it.
        slotProps={{ title: { variant: 'subtitle1', sx: { fontWeight: 600 } } }}
        action={
          <Tooltip title="Remove widget">
            <IconButton
              // `widget-no-drag` tells react-grid-layout not to start a drag
              // from this element, so taps reach the button on touch devices.
              className="widget-no-drag"
              aria-label={`remove ${title} widget`}
              // Stop the drag handler from swallowing the press (mouse + touch).
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onRemove}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
        sx={{
          cursor: 'move',
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiCardHeader-action': { alignSelf: 'center', mt: 0, mr: 0 },
        }}
      />
      <CardContent sx={{ flexGrow: 1, overflow: 'auto', minHeight: 0 }}>
        {children}
      </CardContent>
    </Card>
  )
}
