import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Typography, alpha } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

/**
 * The trigger. Hold to fire (the sim loop reads `fireHeldRef` every frame and
 * respects the weapon cooldown). A separate pointer capture from the sticks
 * means the right thumb can fly while another finger fires — and it inherits
 * the joystick's full release hardening (window fallbacks + capture polling),
 * because a silently-stuck `fireHeldRef` would empty the gun invisibly.
 */
export default function FireButton({
  size,
  fireHeldRef,
  testId,
  sx,
}: {
  size: number
  fireHeldRef: { current: boolean }
  testId: string
  sx?: SxProps<Theme>
}) {
  const hitAreaRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const [pressed, setPressed] = useState(false)

  const release = useCallback(() => {
    pointerIdRef.current = null
    fireHeldRef.current = false
    setPressed(false)
  }, [fireHeldRef])

  // Window-level fallbacks: blur/visibilitychange are the only events the
  // spec guarantees when the tab loses focus mid-press (the joystick lesson).
  useEffect(() => {
    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerId === pointerIdRef.current) release()
    }
    const onBlur = () => {
      if (pointerIdRef.current !== null) release()
    }
    const onVisibilityChange = () => {
      if (document.hidden && pointerIdRef.current !== null) release()
    }
    window.addEventListener('pointerup', onWindowPointerUp, true)
    window.addEventListener('pointercancel', onWindowPointerUp, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp, true)
      window.removeEventListener('pointercancel', onWindowPointerUp, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      release()
    }
  }, [release])

  // Mobile OS gesture arbitration can drop capture with no event at all —
  // poll the synchronous ground truth (see VirtualJoystick).
  useEffect(() => {
    const id = window.setInterval(() => {
      const pid = pointerIdRef.current
      const el = hitAreaRef.current
      if (pid !== null && el && !el.hasPointerCapture(pid)) release()
    }, 400)
    return () => window.clearInterval(id)
  }, [release])

  return (
    <Box
      ref={hitAreaRef}
      data-testid={testId}
      data-pressed={pressed ? 'true' : 'false'}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (pointerIdRef.current !== null) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          return
        }
        pointerIdRef.current = e.pointerId
        fireHeldRef.current = true
        setPressed(true)
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        release()
      }}
      onPointerCancel={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        release()
      }}
      onLostPointerCapture={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        release()
      }}
      sx={[
        {
          p: 1.5, // finger-friendly hit area beyond the visible circle
          touchAction: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha('#ef5350', pressed ? 0.75 : 0.4),
          border: `2px solid ${alpha('#fff', pressed ? 0.8 : 0.45)}`,
          boxShadow: pressed ? 1 : 3,
          transform: pressed ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 60ms, background-color 60ms',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: alpha('#fff', 0.95),
            fontWeight: 700,
            letterSpacing: 1.5,
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }}
        >
          FIRE
        </Typography>
      </Box>
    </Box>
  )
}
