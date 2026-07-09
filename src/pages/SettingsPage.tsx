import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setMode } from '../features/ui/uiSlice'
import { resetLayout } from '../features/widgets/widgetsSlice'

/** Settings: theme mode toggle and a reset-to-default-layout action. */
export default function SettingsPage() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.ui.mode)

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Settings
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Appearance
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={mode === 'dark'}
                onChange={(e) =>
                  dispatch(setMode(e.target.checked ? 'dark' : 'light'))
                }
              />
            }
            label="Dark mode"
          />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Layout
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Remove all widgets and clear your saved layout, returning to an empty
            dashboard.
          </Typography>
          <Stack direction="row">
            <Button
              variant="outlined"
              color="warning"
              startIcon={<RestartAltIcon />}
              onClick={() => dispatch(resetLayout())}
            >
              Reset layout
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
