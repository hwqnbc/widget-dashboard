import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setMode, setSeatAvatar } from '../features/ui/uiSlice'
import { resetLayout } from '../features/widgets/widgetsSlice'
import { AVATAR_CATALOG } from '../features/avatars/avatarCatalog'
import { SEATS, type AvatarId, type Seat } from '../features/avatars/types'
import { useSeatAvatars } from '../features/avatars/useSeatAvatars'
import { avatarVisualById } from '../registry/avatarRegistry'

const SEAT_LABEL: Record<Seat, string> = { toy: 'Player 1', ninja: 'Player 2' }
const other = (seat: Seat): Seat => (seat === 'toy' ? 'ninja' : 'toy')

/** Settings: theme mode, per-player avatars, and a reset-to-default-layout action. */
export default function SettingsPage() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state) => state.ui.mode)
  const seatAvatars = useSeatAvatars()

  // Pick an avatar for a seat. To keep the two players visually distinct, if the
  // chosen avatar already belongs to the other seat we swap them (the other seat
  // inherits this seat's previous avatar) rather than allowing a duplicate.
  const choose = (seat: Seat, avatar: AvatarId | null) => {
    if (!avatar || avatar === seatAvatars[seat]) return
    if (seatAvatars[other(seat)] === avatar) {
      dispatch(setSeatAvatar({ seat: other(seat), avatar: seatAvatars[seat] }))
    }
    dispatch(setSeatAvatar({ seat, avatar }))
  }

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
            Avatars
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Choose the character each player appears as. Their head becomes the
            chip in every game.
          </Typography>
          <Stack spacing={1.5}>
            {SEATS.map((seat) => (
              <Stack
                key={seat}
                direction="row"
                sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 72 }}>
                  {SEAT_LABEL[seat]}
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={seatAvatars[seat]}
                  onChange={(_, v) => choose(seat, v as AvatarId | null)}
                >
                  {AVATAR_CATALOG.map((a) => {
                    const Head = avatarVisualById[a.id].Head
                    return (
                      <ToggleButton
                        key={a.id}
                        value={a.id}
                        sx={{ textTransform: 'none', gap: 0.75, py: 0.4, px: 1 }}
                      >
                        <Box sx={{ width: 22, height: 22, flexShrink: 0 }}>
                          <Head />
                        </Box>
                        {a.name}
                      </ToggleButton>
                    )
                  })}
                </ToggleButtonGroup>
              </Stack>
            ))}
          </Stack>

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
