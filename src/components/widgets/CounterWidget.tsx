import { Box, Button, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'

/** A click counter whose value is persisted in the widget's redux data. */
export default function CounterWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const count = useWidgetField(id, 'count', 0)

  const setCount = (value: number) =>
    dispatch(updateWidgetData({ id, data: { count: value } }))

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      <Typography variant="h3" component="div">
        {count}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setCount(count - 1)}
          startIcon={<RemoveIcon />}
        >
          Dec
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setCount(count + 1)}
          startIcon={<AddIcon />}
        >
          Inc
        </Button>
        <Button
          color="secondary"
          size="small"
          onClick={() => setCount(0)}
          startIcon={<RestartAltIcon />}
        >
          Reset
        </Button>
      </Stack>
    </Box>
  )
}
