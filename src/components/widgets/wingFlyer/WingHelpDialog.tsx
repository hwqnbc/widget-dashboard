import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import type { AssistLevel } from './assists'

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
 * "How to fly" — a plane has four controls and can't stop, so the sticks
 * need explaining before the first launch (the Tank Battle help pattern:
 * auto-opens once per widget — persisted `helpSeen` — and the ? button
 * reopens it). The Trainer text says the throttle is automatic, so a young
 * player knows only the right stick matters.
 */
export default function WingHelpDialog({
  open,
  onClose,
  assist,
}: {
  open: boolean
  onClose: () => void
  assist: AssistLevel
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>How to fly</DialogTitle>
      <DialogContent data-testid="wingflyer-help-panel">
        <Section title="Right stick — steer (or arrow keys)">
          <Typography variant="body2">
            Push <b>left/right</b> to bank and turn. <b>Pull back</b> (down) to climb, push forward to dive.
            {assist !== 'acro' && ' Let go and the wings level by themselves.'}
          </Typography>
        </Section>
        <Section title="Left stick — throttle & rudder (or W S / A D)">
          <Typography variant="body2">
            {assist === 'trainer' ? (
              <>
                In <b>Trainer</b> the throttle is <b>automatic</b> (the stick says AUTO): up/down does nothing,
                left/right steers the rudder. Only the right stick matters.
              </>
            ) : (
              <>
                Up/down is the <b>throttle</b> — it stays where you leave it. Too slow and the plane stalls (the
                speed turns amber, then red).
              </>
            )}
          </Typography>
        </Section>
        <Section title="Take off">
          <Typography variant="body2">
            <b>Launch</b> (or Enter) throws the plane from your hand. With the trainer, <b>Runway</b> takes off
            from the strip.
          </Typography>
        </Section>
        <Section title="The goal: take off, fly out, land">
          <Typography variant="body2">
            The line under the arrow ticks off <b>Take off ▸ Fly out 150 m ▸ Land</b>. Fly away from the runway
            until it ticks, then come back and land — on the runway for the bonus mark.
          </Typography>
        </Section>
        <Section title="Landing in 3 steps">
          <Typography variant="body2" component="div">
            <b>1. Line up</b> — the yellow arrow points home; aim for the <b>yellow hoops</b>.
            <br />
            <b>2. Follow the hoops down</b> —{' '}
            {assist === 'trainer'
              ? 'once lined up, let go: the Trainer rides the hoop line down by itself (push forward only to go down faster — it never dives steeply).'
              : 'push the right stick gently forward; it sets how fast you descend, so you can’t over-dip.'}
            {' '}Missed a hoop? Fine — they are a guide, not a test.
            <br />
            <b>3. {assist === 'trainer' ? 'Let go low' : 'Ease back low'}</b> —{' '}
            {assist === 'trainer'
              ? 'under the last hoop keep the sticks released: it flares and settles itself.'
              : 'just above the ground, pull back a little to touch down softly.'}
            {' '}Flat grass works too, from either end of the runway. Hints appear on the way in (Settings → Landing hints).
          </Typography>
        </Section>
        <Section title="In trouble?">
          <Typography variant="body2">
            <b>PANIC</b> (or Space) levels the wings and climbs. The gear button changes the plane, the assist
            and the camera.
          </Typography>
        </Section>
      </DialogContent>
      <DialogActions>
        <Button data-testid="wingflyer-help-close" variant="contained" onClick={onClose}>
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  )
}
