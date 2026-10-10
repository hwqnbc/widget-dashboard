import type { RefObject } from 'react'
import { Box, alpha } from '@mui/material'
import type { ObjectiveSnapshot } from './PlaneRig'

const ACTIVE = '#ffd54f'
const DONE = '#9ccc65'
const IDLE = alpha('#ffffff', 0.55)

/**
 * The Free Flight goal line under the home arrow: Take off ▸ Fly out ▸ Land,
 * each step ✓ as it completes, the active one highlighted, the fly-out step
 * carrying a live distance (DOM-written by the rig through `distRef` — the
 * chip itself re-renders only when a step flips).
 */
export default function ObjectiveChip({
  objective: o,
  distRef,
  flyOutDist,
}: {
  objective: ObjectiveSnapshot
  distRef: RefObject<HTMLSpanElement | null>
  flyOutDist: number
}) {
  const active = !o.takeoff ? 'takeoff' : !o.flyout ? 'flyout' : !o.land ? 'land' : 'done'
  const step = (key: string, done: boolean, label: string, extra?: React.ReactNode) => (
    <Box
      component="span"
      data-testid={`wingflyer-obj-${key}`}
      data-done={done ? 'true' : 'false'}
      sx={{
        color: done ? DONE : active === key ? ACTIVE : IDLE,
        fontWeight: active === key ? 700 : 500,
        whiteSpace: 'nowrap',
      }}
    >
      {done ? '✓ ' : ''}
      {label}
      {extra}
    </Box>
  )
  return (
    <Box
      data-testid="wingflyer-objective"
      data-step={active}
      sx={{
        position: 'absolute',
        top: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.2,
        borderRadius: 1,
        bgcolor: alpha('#000', 0.3),
        fontFamily: 'monospace',
        fontSize: 11,
        pointerEvents: 'none',
      }}
    >
      {step('takeoff', o.takeoff, 'Take off')}
      <Box component="span" sx={{ color: IDLE }}>
        ▸
      </Box>
      {step(
        'flyout',
        o.flyout,
        'Fly out',
        active === 'flyout' ? (
          <Box component="span" ref={distRef} sx={{ ml: 0.5, opacity: 0.9 }}>
            0 / {flyOutDist} m
          </Box>
        ) : null,
      )}
      <Box component="span" sx={{ color: IDLE }}>
        ▸
      </Box>
      {step('land', o.land, o.land && o.runway ? 'Land · Runway!' : 'Land')}
      {o.completed > 0 && (
        <Box component="span" data-testid="wingflyer-obj-count" sx={{ color: DONE, ml: 0.5 }}>
          ×{o.completed}
        </Box>
      )}
    </Box>
  )
}
