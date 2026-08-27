import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Box, CircularProgress } from '@mui/material'
import jsQR from 'jsqr'

/**
 * Live camera view that reports the first QR code it reads.
 *
 * Decoding runs on a downscaled copy of the frame — a QR of a ~160-character
 * token is coarse, and full-resolution `getImageData` on a phone costs more
 * than it buys. Scanning every other frame keeps the preview smooth on a
 * tablet that is also rendering a Connect 4 board.
 *
 * Camera failure is expected, not exceptional: permission gets denied, a
 * laptop has no rear camera, a browser blocks it in an iframe. The scanner
 * says so plainly and the caller always offers typing the code instead.
 */
/** Quiet period before an unchanged code is offered to the caller again. */
const REPEAT_MS = 1500

export default function QrScanner({
  onResult,
  height = 220,
}: {
  onResult: (text: string) => void
  height?: number
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // A camera reads the same square 30 times a second. Report each distinct
  // code once, and re-report an unchanged one only after a pause — so a code
  // the caller REJECTED (wrong hop, garbled) can simply be scanned again
  // rather than leaving the scanner permanently deaf.
  const lastText = useRef('')
  const lastAt = useRef(0)
  const report = useRef(onResult)
  report.current = onResult

  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
  }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let tick = 0
    let cancelled = false

    const scan = () => {
      frame = requestAnimationFrame(scan)
      const video = videoRef.current
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return
      if (++tick % 2) return // every other frame is plenty

      const canvas = (canvasRef.current ??= document.createElement('canvas'))
      const scale = Math.min(1, 400 / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      if (!w || !h) return
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
        inversionAttempts: 'dontInvert',
      })
      if (found?.data) {
        const now = performance.now()
        if (found.data !== lastText.current || now - lastAt.current > REPEAT_MS) {
          lastText.current = found.data
          lastAt.current = now
          report.current(found.data)
        }
      }
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot open the camera.')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)
        frame = requestAnimationFrame(scan)
      } catch (e) {
        if (cancelled) return
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Camera blocked — type the code in instead.'
            : 'No camera available — type the code in instead.',
        )
      }
    }
    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (error) {
    return (
      <Alert severity="info" data-testid="qr-scanner-error" sx={{ py: 0.5 }}>
        {error}
      </Alert>
    )
  }

  return (
    <Box
      data-testid="qr-scanner"
      sx={{
        position: 'relative',
        height,
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'common.black',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <video
        ref={setVideo}
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {!ready && <CircularProgress size={28} sx={{ position: 'absolute', color: 'grey.400' }} />}
      {/* Aiming frame — tells a child where to point the camera. */}
      <Box
        sx={{
          position: 'absolute',
          width: '62%',
          aspectRatio: '1 / 1',
          border: '3px solid rgba(255,255,255,0.85)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}
