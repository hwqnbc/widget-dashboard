import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  alpha,
} from '@mui/material'

/** Inline reticle swatch — a small ring in the state's colour. */
function Ring({ color, width = 2 }: { color: string; width?: number }) {
  return (
    <Box
      sx={{
        width: 18,
        height: 18,
        flexShrink: 0,
        borderRadius: '50%',
        border: `${width}px solid ${color}`,
        display: 'inline-block',
        mt: '2px',
        bgcolor: alpha('#37474f', 0.9),
      }}
    />
  )
}

function Row({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1.2} sx={{ alignItems: 'flex-start' }}>
      {swatch}
      <Typography variant="body2">{children}</Typography>
    </Stack>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/**
 * "How to play" — the aiming model is invisible without it (a playtest
 * question proved it; lesson #36's cousin: mechanics with no visible
 * explanation read as broken). Auto-opens once per widget instance
 * (persisted `helpSeen`), reopens any time from the ? button.
 */
export default function TankHelpDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>How to play</DialogTitle>
      <DialogContent data-testid="tank-help-panel">
        <Section title="Drive — left stick (or W S / A D)">
          <Typography variant="body2">
            Push up to roll, down to reverse. While driving forward the hull
            automatically follows wherever you look (auto-turn) — steering
            with the stick&apos;s side axis always overrides.
          </Typography>
        </Section>
        <Section title="Aim — right stick (or arrow keys)">
          <Typography variant="body2">
            Swing your view around: <b>the circle in the centre of the screen
            is your gun sight</b>. Put it on a target — the gun raises or
            lowers itself so the shell lands there, and the turret chases
            your view with a short lag, so give it a beat to catch up.
          </Typography>
        </Section>
        <Section title="The circle tells you when to fire">
          <Stack spacing={0.6}>
            <Row swatch={<Ring color="#ffb300" width={3} />}>
              <b>Amber (enlarged)</b> — locked on an enemy. Fire!
            </Row>
            <Row swatch={<Ring color={alpha('#ffffff', 0.85)} />}>
              <b>White</b> — aimed at open ground; a shell lands on the
              circle.
            </Row>
            <Row swatch={<Ring color={alpha('#9e9e9e', 0.85)} />}>
              <b>Grey</b> — no shot from here (a hill is in the way, or the
              spot is out of reach). Reposition.
            </Row>
          </Stack>
        </Section>
        <Section title="Terrain is cover — for both sides">
          <Typography variant="body2">
            If the circle never turns amber, a ridge is blocking the shot.
            Drive toward the red dots on the minimap until the enemy crests
            into view — and duck behind hills when they shoot back.
          </Typography>
        </Section>
        <Section title="The glowing ring is home">
          <Typography variant="body2">
            The cyan ring at your spawn is a <b>safe zone</b>: inside it
            enemies hold their fire and shells pass over you — but your own
            gun goes offline too. Rest there to <b>repair damage</b>, one
            heart at a time, then roll back out.
          </Typography>
        </Section>
        <Section title="Fire &amp; reload">
          <Typography variant="body2">
            FIRE button, Space or click. Each shot takes a moment to reload —
            the top-left shows <b>RELOADING → GUN READY</b>. The scope button
            zooms 2× for long shots, and settings offer <b>Auto-fire</b>{' '}
            (the gun shoots locked targets by itself).
          </Typography>
        </Section>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          data-testid="tank-help-close"
          onClick={onClose}
          autoFocus
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  )
}
