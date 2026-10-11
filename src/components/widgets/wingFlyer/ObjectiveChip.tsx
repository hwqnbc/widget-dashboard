import type { RefObject } from 'react'
import { Box, alpha } from '@mui/material'
import type { ChecklistStep } from './missions'

const ACTIVE = '#ffd54f'
const DONE = '#9ccc65'
const IDLE = alpha('#ffffff', 0.55)

/**
 * The goal line under the home arrow — the mode's checklist (missions.ts
 * `missionChecklist`: Free Flight's Take off ▸ Fly out ▸ Land, or a
 * mission's steps), each ✓ as it completes, the active (first undone)
 * one highlighted. The fly-out step carries a live distance (DOM-written
 * by the rig through `distRef`) and the land step, while active, the hoop
 * tally — the chip itself re-renders only when a step flips.
 */
export default function ObjectiveChip({
  steps,
  distRef,
  flyOutDist,
  hoops,
  count,
}: {
  steps: ChecklistStep[]
  distRef: RefObject<HTMLSpanElement | null>
  flyOutDist: number
  /** Hoop tally shown on the active land step (null = hide). */
  hoops: { passed: number; total: number } | null
  /** Completed runs this session (Free Flight's ×N), 0 = hide. */
  count: number
}) {
  const active = steps.find((s) => !s.done)?.key ?? 'done'
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
      {steps.map((s, i) => (
        <Box key={s.key} component="span" sx={{ display: 'contents' }}>
          {i > 0 && (
            <Box component="span" sx={{ color: IDLE }}>
              ▸
            </Box>
          )}
          <Box
            component="span"
            data-testid={`wingflyer-obj-${s.key}`}
            data-done={s.done ? 'true' : 'false'}
            sx={{
              color: s.done ? DONE : active === s.key ? ACTIVE : IDLE,
              fontWeight: active === s.key ? 700 : 500,
              whiteSpace: 'nowrap',
            }}
          >
            {s.done ? '✓ ' : ''}
            {s.label}
            {s.key === 'flyout' && active === 'flyout' && (
              <Box component="span" ref={distRef} sx={{ ml: 0.5, opacity: 0.9 }}>
                0 / {flyOutDist} m
              </Box>
            )}
            {s.key === 'land' && active === 'land' && hoops && (
              <Box component="span" data-testid="wingflyer-obj-hoops" sx={{ ml: 0.5, opacity: 0.9 }}>
                hoops {hoops.passed}/{hoops.total}
              </Box>
            )}
          </Box>
        </Box>
      ))}
      {count > 0 && (
        <Box component="span" data-testid="wingflyer-obj-count" sx={{ color: DONE, ml: 0.5 }}>
          ×{count}
        </Box>
      )}
    </Box>
  )
}
