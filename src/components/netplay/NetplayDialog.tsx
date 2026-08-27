import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import QrCode from './QrCode'
import QrScanner from './QrScanner'
import { isCompactToken } from '../../features/netplay/sdpCodec'
import type { NetplayLink } from '../../features/netplay/useNetplay'

/**
 * Pairing flow for two devices on one wifi.
 *
 * The handshake needs two hops (the host's offer out, the guest's reply back),
 * and both are shown the same way: a QR to hold up, a camera to point, and —
 * always — the raw code to read out or paste, because a blocked camera must
 * not be a dead end.
 *
 * The dialog renders from link **status**, never from a step counter. That is
 * what lets one component serve both the two-hop WebRTC handshake and the
 * loopback transport used by the tests, which pairs in a single hop.
 */
export default function NetplayDialog({
  open,
  onClose,
  link,
}: {
  open: boolean
  onClose: () => void
  link: NetplayLink
}) {
  const [entry, setEntry] = useState('')
  const [copied, setCopied] = useState(false)

  // Once the link is up the dialog has nothing left to say — get out of the
  // way of the board.
  useEffect(() => {
    if (link.connected) {
      const t = setTimeout(onClose, 700)
      return () => clearTimeout(t)
    }
  }, [link.connected, onClose])

  const copy = async () => {
    if (!link.token) return
    try {
      await navigator.clipboard.writeText(link.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the code is on screen to read out */
    }
  }

  const submit = (text: string) => {
    const value = text.trim()
    if (!value) return
    // The entry is deliberately NOT cleared: if the code is rejected, a long
    // pasted token would otherwise have to be pasted again.
    if (link.role === 'host') link.submitReply(value)
    else link.join(value)
  }

  /** Camera + paste, used for both hops. */
  const codeEntry = (label: string) => (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <QrScanner onResult={submit} />
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          placeholder="…or type the code"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(entry)
          }}
          slotProps={{ htmlInput: { 'data-testid': 'netplay-code-input' } }}
        />
        <Button
          variant="contained"
          onClick={() => submit(entry)}
          disabled={!entry.trim() || link.busy}
          data-testid="netplay-code-submit"
        >
          Go
        </Button>
      </Stack>
    </Stack>
  )

  /** A token to hold up to the other device. */
  const codeDisplay = (label: string) => (
    <Stack spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" sx={{ fontWeight: 600, alignSelf: 'flex-start' }}>
        {label}
      </Typography>
      {link.token && <QrCode value={link.token} />}
      {link.token && !isCompactToken(link.token) && (
        <Alert severity="warning" sx={{ py: 0, width: '100%' }}>
          This code came out long, so the square is dense — hold the camera
          steady, or type the code instead.
        </Alert>
      )}
      <Box
        data-testid="netplay-token"
        sx={{
          fontFamily: 'monospace',
          fontSize: 11,
          wordBreak: 'break-all',
          maxHeight: 56,
          overflow: 'auto',
          bgcolor: 'action.hover',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          width: '100%',
        }}
      >
        {link.token}
      </Box>
      <Button size="small" onClick={copy}>
        {copied ? 'Copied' : 'Copy code'}
      </Button>
    </Stack>
  )

  const body = () => {
    if (link.connected) {
      return (
        <Alert severity="success" data-testid="netplay-connected">
          Connected — you're playing {link.role === 'host' ? 'Player 1' : 'Player 2'}.
        </Alert>
      )
    }

    if (link.role === null) {
      return (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Play across two devices on the same wifi. One starts the game and
            shows a code; the other scans it.
          </Typography>
          <Button
            variant="contained"
            onClick={link.host}
            data-testid="netplay-host"
            size="large"
          >
            Start a game (Player 1)
          </Button>
          <Divider>or</Divider>
          {codeEntry('Join a game — scan the code on the other device')}
        </Stack>
      )
    }

    if (link.role === 'host') {
      if (!link.token) {
        return (
          <Stack spacing={1} sx={{ alignItems: 'center', py: 3 }}>
            <CircularProgress size={28} />
            <Typography variant="body2">Making a code…</Typography>
          </Stack>
        )
      }
      return (
        <Stack spacing={2}>
          {codeDisplay('1. Show this to the other device')}
          {link.needsReply && (
            <>
              <Divider />
              {codeEntry('2. Now scan the reply code it shows you')}
            </>
          )}
        </Stack>
      )
    }

    // Guest
    if (!link.token) {
      return link.busy ? (
        <Stack spacing={1} sx={{ alignItems: 'center', py: 3 }}>
          <CircularProgress size={28} />
          <Typography variant="body2">Connecting…</Typography>
        </Stack>
      ) : (
        codeEntry('Scan the code on the other device')
      )
    }
    return codeDisplay('Show this reply code back to the first device')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle sx={{ pb: 1 }}>Two devices</DialogTitle>
      <DialogContent data-testid="netplay-dialog">
        <Stack spacing={2}>
          {link.error && (
            <Alert severity="error" data-testid="netplay-error">
              {link.error}
            </Alert>
          )}
          {body()}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {link.role !== null && !link.connected && (
              <Button size="small" onClick={link.disconnect} data-testid="netplay-restart">
                Start over
              </Button>
            )}
            <Button size="small" onClick={onClose} data-testid="netplay-close">
              Close
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
