import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Typography, alpha } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { WeaponId } from './combatModel'
import { WEAPON_IDS } from './combatModel'

/** Vertical drag per selection notch (px). Documented in e2e 129 — suites
 * swipe with generous margins around multiples of this. */
const STEP_PX = 28
/** Below this movement a press counts as a TAP (cycles to the next gun). */
const TAP_SLOP = 6

const WEAPON_LABELS: Record<WeaponId, string> = {
  bolt: 'BOLT',
  laser: 'LASER',
  lob: 'LOB',
  shotgun: 'SHOTGUN',
  homing: 'HOMING',
}

/**
 * The in-game weapon selector — a chip above the fire button showing the
 * equipped gun. **Swipe up/down on it to scroll** through the weapons (one
 * per STEP_PX notch, wrapping, a long swipe scrolls several), **tap** to
 * cycle to the next, **mouse-wheel** over it to step. It inherits the
 * joystick/fire-button pointer-capture hardening (window fallbacks + the
 * capture poll) — a stuck chip pointer would block every future swipe. The
 * wheel listener is attached via ref with `passive: false` (React's onWheel
 * can't preventDefault). During a multi-notch gesture the current selection
 * is tracked in a ref (`selRef`) so rapid notches never race the redux
 * round-trip of the `weapon` prop.
 */
export default function WeaponChip({
  weapon,
  onSelect,
  width,
  sx,
}: {
  weapon: WeaponId
  onSelect: (weapon: WeaponId) => void
  width: number
  sx?: SxProps<Theme>
}) {
  const hitAreaRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const baseYRef = useRef(0)
  const movedRef = useRef(false)
  const selRef = useRef<WeaponId>(weapon)
  const [pressed, setPressed] = useState(false)

  // Keep the gesture-local selection in sync with the outside world (settings
  // panel picks, crate pickups, reset-to-defaults).
  useEffect(() => {
    selRef.current = weapon
  }, [weapon])

  const step = useCallback(
    (dir: 1 | -1) => {
      const idx = WEAPON_IDS.indexOf(selRef.current)
      const next = WEAPON_IDS[(idx + dir + WEAPON_IDS.length) % WEAPON_IDS.length]
      selRef.current = next
      onSelect(next)
    },
    [onSelect],
  )

  const release = useCallback(() => {
    pointerIdRef.current = null
    setPressed(false)
  }, [])

  // Window-level fallbacks: blur/visibilitychange are the only events the
  // spec guarantees when the tab loses focus mid-press (the joystick lesson).
  // NOTE the capture-phase listener fires BEFORE the element's own
  // onPointerUp and clears the pointer id — so the tap-to-cycle decision has
  // to live HERE (pointerup only, never pointercancel), not in the element
  // handler, or it would never run.
  useEffect(() => {
    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return
      if (e.type === 'pointerup' && !movedRef.current) step(1)
      release()
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
  }, [release, step])

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

  // Mouse wheel steps the selection — must be a NON-PASSIVE listener so
  // preventDefault can stop the page/board from scrolling.
  useEffect(() => {
    const el = hitAreaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.deltaY === 0) return
      step(e.deltaY > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [step])

  return (
    <Box
      ref={hitAreaRef}
      data-testid="strike-weapon-chip"
      data-weapon={weapon}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (pointerIdRef.current !== null) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          return
        }
        pointerIdRef.current = e.pointerId
        baseYRef.current = e.clientY
        movedRef.current = false
        setPressed(true)
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointerIdRef.current) return
        let dy = e.clientY - baseYRef.current
        if (Math.abs(dy) > TAP_SLOP) movedRef.current = true
        // One notch per STEP_PX, re-basing so a long swipe keeps scrolling.
        while (dy <= -STEP_PX) {
          step(1) // swipe up = next weapon
          baseYRef.current -= STEP_PX
          dy += STEP_PX
        }
        while (dy >= STEP_PX) {
          step(-1) // swipe down = previous
          baseYRef.current += STEP_PX
          dy -= STEP_PX
        }
      }}
      onPointerUp={(e) => {
        // Normally a no-op: the window capture-phase fallback already handled
        // the tap + release. Kept as a belt-and-suspenders release only.
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
          p: 1, // finger-friendly hit area beyond the visible pill
          touchAction: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: 'ns-resize',
          display: 'grid',
          placeItems: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          width,
          height: 26,
          borderRadius: 1,
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha('#000', pressed ? 0.65 : 0.5),
          border: `1px solid ${alpha('#fff', pressed ? 0.7 : 0.35)}`,
          transition: 'background-color 60ms, border-color 60ms',
        }}
      >
        <Typography
          key={weapon} // remount per gun — replays the change pulse
          variant="caption"
          sx={{
            color: alpha('#fff', 0.95),
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            '@keyframes chipPulse': {
              from: { transform: 'scale(1.25)', color: '#ffd54f' },
              to: { transform: 'scale(1)' },
            },
            animation: 'chipPulse 250ms ease-out',
          }}
        >
          {`▲ ${WEAPON_LABELS[weapon]} ▼`}
        </Typography>
      </Box>
    </Box>
  )
}
