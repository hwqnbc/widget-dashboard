import { TextField } from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'

/** A scratchpad whose text is persisted in the widget's redux data. */
export default function NotesWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const text = useWidgetField(id, 'text', '')

  return (
    <TextField
      multiline
      fullWidth
      minRows={3}
      placeholder="Type a note…"
      value={text}
      onChange={(e) =>
        dispatch(updateWidgetData({ id, data: { text: e.target.value } }))
      }
      sx={{ height: '100%', '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
    />
  )
}
