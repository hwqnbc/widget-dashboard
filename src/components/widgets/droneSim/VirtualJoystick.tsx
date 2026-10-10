import { useCallback, useEffect, useRef } from 'react'
import { Box, Typography, alpha, useTheme } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { DEADZONE } from './flightModel'

export interface VirtualJoystickProps {
  /** Base circle diameter in px; the hit area is padded beyond it. */
  size: number
  label: string
  testId: string
  /** Normalized -1..1 per axis (deadzone rescaled, y = +1 pushed up); (0,0) on release. */
  onChange: (x: number, y: number) => void
  sx?: SxProps<Theme>
  /**
   * Latching Y axis (an RC throttle stick): on release only X re-centres —
   * Y stays where it was left, and a new touch continues from there (no
   * jump to the finger). Y is linear with no deadzone. Off by default.
   */
  latchY?: boolean
  /**
   * With `latchY`: the latched Y value (-1..1), shared with the owner so a
   * keyboard/gamepad/reset change moves the knob too. The stick writes it
   * while dragging and re-syncs the knob from it while idle.
   */
  latchRef?: { current: number }
}

/**
 * On-screen thumbstick. Each instance captures and follows its own pointer id
 * (`setPointerCapture`), so two sticks track two fingers simultaneously; mouse
 * input flows through the same pointer-event path. The knob is moved with
 * direct style writes and values reach the sim loop through the `onChange`
 * ref-writer — a drag causes zero React renders.
 */
export default function VirtualJoystick({
  size,
  label,
  testId,
  onChange,
  sx,
  latchY = false,
  latchRef,
}: VirtualJoystickProps) {
  const theme = useTheme()
  const hitAreaRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  /** Latched Y offset in px (screen-down positive) and the drag anchor. */
  const latchDyRef = useRef(0)
  const anchorYRef = useRef(0)

  const radius = size / 2
  const knobSize = Math.round(size * 0.42)

  const apply = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current
      const knob = knobRef.current
      if (!base || !knob) return
      const rect = base.getBoundingClientRect()
      let dx = clientX - (rect.left + rect.width / 2)
      if (latchY) {
        // Square travel: X absolute from the centre (with deadzone), Y
        // relative to where the drag started from the latched position.
        dx = Math.max(-radius, Math.min(radius, dx))
        const dy = Math.max(-radius, Math.min(radius, clientY - anchorYRef.current))
        latchDyRef.current = dy
        knob.style.transform = `translate(${dx}px, ${dy}px)`
        let nx = dx / radius
        if (Math.abs(nx) < DEADZONE) nx = 0
        else nx = Math.sign(nx) * Math.min(1, (Math.abs(nx) - DEADZONE) / (1 - DEADZONE))
        const ny = -dy / radius
        if (latchRef) latchRef.current = ny
        onChange(nx, ny)
        return
      }
      let dy = clientY - (rect.top + rect.height / 2)
      const dist = Math.hypot(dx, dy)
      if (dist > radius) {
        dx *= radius / dist
        dy *= radius / dist
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`

      let nx = dx / radius
      let ny = -dy / radius // screen y grows downward; stick up = +1
      const mag = Math.hypot(nx, ny)
      if (mag < DEADZONE) {
        nx = 0
        ny = 0
      } else {
        // Rescale so output is continuous from 0 at the deadzone edge.
        const scaled = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE))
        nx = (nx / mag) * scaled
        ny = (ny / mag) * scaled
      }
      onChange(nx, ny)
    },
    [onChange, radius, latchY, latchRef],
  )

  const releasePointer = useCallback(() => {
    pointerIdRef.current = null
    const knob = knobRef.current
    const keepY = latchY ? latchDyRef.current : 0
    if (knob) {
      knob.style.transition = 'transform 80ms'
      knob.style.transform = `translate(0px, ${keepY}px)`
    }
    onChange(0, latchY ? -keepY / radius : 0)
  }, [onChange, latchY, radius])

  // Latched stick, idle: follow the shared value (keyboard / gamepad /
  // reset may have moved the throttle).
  useEffect(() => {
    if (!latchY || !latchRef) return
    const id = window.setInterval(() => {
      if (pointerIdRef.current !== null) return
      const dy = -latchRef.current * radius
      if (Math.abs(dy - latchDyRef.current) < 0.5) return
      latchDyRef.current = dy
      const knob = knobRef.current
      if (knob) {
        knob.style.transition = 'transform 80ms'
        knob.style.transform = `translate(0px, ${dy}px)`
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [latchY, latchRef, radius])

  // Belt-and-suspenders release: the local pointer handlers below assume the
  // browser always delivers a pointerup/pointercancel/lostpointercapture for
  // the captured pointer, but that's not guaranteed if the tab loses focus
  // mid-drag (blur/visibilitychange are the only events the spec promises in
  // that case) or if a synthetic dispatch gets dropped. Without this, a
  // missed release event sticks the knob forever and the down-handler guard
  // then rejects every future touch on this stick too.
  useEffect(() => {
    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerId === pointerIdRef.current) releasePointer()
    }
    const onWindowPointerCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerIdRef.current) releasePointer()
    }
    const onBlur = () => {
      if (pointerIdRef.current !== null) releasePointer()
    }
    const onVisibilityChange = () => {
      if (document.hidden && pointerIdRef.current !== null) releasePointer()
    }
    window.addEventListener('pointerup', onWindowPointerUp, true)
    window.addEventListener('pointercancel', onWindowPointerCancel, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp, true)
      window.removeEventListener('pointercancel', onWindowPointerCancel, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [releasePointer])

  // Mobile OS gesture arbitration (a long-press callout, or scroll/rubber-band
  // arbitration near the hit area's touch-action boundary) can silently drop
  // pointer capture on real touchscreens without ever firing pointerup,
  // pointercancel, blur, or visibilitychange — none of which the tab-switch
  // fallback above covers, since the tab never loses focus. hasPointerCapture
  // is a synchronous, non-throwing ground-truth check, so polling it needs no
  // event and can't misfire on a legitimate long, stationary hold (capture
  // stays true for the whole duration of a real uninterrupted press).
  useEffect(() => {
    const id = window.setInterval(() => {
      const pid = pointerIdRef.current
      const el = hitAreaRef.current
      if (pid !== null && el && !el.hasPointerCapture(pid)) releasePointer()
    }, 400)
    return () => window.clearInterval(id)
  }, [releasePointer])

  return (
    <Box
      ref={hitAreaRef}
      data-testid={testId}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (pointerIdRef.current !== null) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          return
        }
        pointerIdRef.current = e.pointerId
        const knob = knobRef.current
        if (knob) knob.style.transition = 'none'
        // Latched Y continues from where it was: anchor the drag so the
        // current finger position maps to the current latched offset.
        anchorYRef.current = e.clientY - latchDyRef.current
        apply(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        apply(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        releasePointer()
      }}
      onPointerCancel={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        releasePointer()
      }}
      onLostPointerCapture={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        releasePointer()
      }}
      sx={[
        {
          p: 2, // thumb-friendly hit area beyond the visible circle
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
          touchAction: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: 'pointer',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        ref={baseRef}
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: alpha(theme.palette.common.white, 0.14),
          border: `1px solid ${alpha(theme.palette.common.white, 0.3)}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box
          ref={knobRef}
          sx={{
            width: knobSize,
            height: knobSize,
            borderRadius: '50%',
            bgcolor: alpha(theme.palette.primary.main, 0.9),
            boxShadow: 2,
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: alpha(theme.palette.common.white, 0.8),
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          letterSpacing: 1,
        }}
      >
        {label}
      </Typography>
    </Box>
  )
}
