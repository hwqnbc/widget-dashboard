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
        titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
        action={
          <Tooltip title="Remove widget">
            <IconButton
              size="small"
              aria-label={`remove ${title} widget`}
              // Stop the drag handler from swallowing the click.
              onMouseDown={(e) => e.stopPropagation()}
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
