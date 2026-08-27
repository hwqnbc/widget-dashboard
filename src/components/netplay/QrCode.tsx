import { useMemo } from 'react'
import { Box } from '@mui/material'
import { encode } from 'uqr'

/**
 * A pairing token drawn as a QR code.
 *
 * Always dark-on-white regardless of the app theme: an inverted QR is legal
 * and many scanners cope, but plenty of phone cameras don't, and a code that
 * fails to scan in a dark kitchen is a broken feature. The white plate is part
 * of the code, not decoration — it doubles as the quiet zone.
 *
 * Rendered as ONE `<path>` rather than a rect per module. A version-9 code is
 * ~2800 modules; that many React elements is a visible hitch on a tablet.
 */
export default function QrCode({ value, size = 232 }: { value: string; size?: number }) {
  const { d, span } = useMemo(() => {
    // Level M survives a smudged screen or an off-angle scan; the tokens are
    // small enough that the extra redundancy costs no meaningful density.
    const qr = encode(value, { ecc: 'M', border: 2 })
    let path = ''
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.data[y][x]) path += `M${x} ${y}h1v1h-1z`
      }
    }
    return { d: path, span: qr.size }
  }, [value])

  return (
    <Box
      sx={{
        width: size,
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        bgcolor: '#fff',
        borderRadius: 1,
        p: 0.5,
        boxShadow: 1,
      }}
    >
      <svg
        viewBox={`0 0 ${span} ${span}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        role="img"
        aria-label="Pairing code"
        data-testid="qr-code"
        data-modules={span}
      >
        <path d={d} fill="#000" />
      </svg>
    </Box>
  )
}
