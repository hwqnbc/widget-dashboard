/**
 * Puppy Rescue — the shelter overlay (one per mode): a counter, the lazy 3D
 * room full of adopted puppies, a per-tier line, and a level grid (tap an
 * unfinished, unlocked level to go and rescue the rest). Opening it marks
 * every adopted puppy as seen, so the ✨ shows each arrival once.
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useAppDispatch } from '../../../app/hooks'
import { markRescueShelterSeen, type PuppyRescueRecords } from '../../../features/records/recordsSlice'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import { LEVELS, MODE_LABEL, TIER_LABEL, levelLabel, recordKey } from './rescueLevels'
import type { Mode } from './rescueModel'
import { PUP_COATS } from './puppyLook'
import { themeById, type ThemeId } from './puppyThemes'
import { popcount, shelterSummary } from './shelterModel'
import type { ShelterPup } from './PuppyShelter3D'

const PuppyShelter3D = lazyWithReload(() => import('./PuppyShelter3D'), 'puppyshelter3d')

export interface PuppyShelterProps {
  mode: Mode
  records: PuppyRescueRecords
  theme: ThemeId
  unlocked: (i: number) => boolean
  onClose: () => void
  /** Jump to level i (an unfinished one, from the grid). */
  onPick: (i: number) => void
}

export default function PuppyShelter({ mode, records, theme: themeId, unlocked, onClose, onPick }: PuppyShelterProps) {
  const dispatch = useAppDispatch()
  const theme = themeById[themeId]
  // Snapshot at open: the ✨s are "new since last time", even after the
  // seen-marks below land.
  const [sum] = useState(() => shelterSummary(records, mode))
  const [view, setView] = useState<'room' | 'levels'>('room')
  useEffect(() => {
    const seen: Record<string, number> = {}
    sum.levels.forEach((l, i) => {
      if (l.fresh) seen[recordKey(mode, LEVELS[i].id)] = l.mask
    })
    if (Object.keys(seen).length) dispatch(markRescueShelterSeen(seen))
  }, [dispatch, mode, sum])
  const pups = useMemo<ShelterPup[]>(() => {
    const out: ShelterPup[] = []
    sum.levels.forEach((l) => {
      for (let j = 0; j < l.n; j++)
        if (l.mask & (1 << j)) out.push({ coat: PUP_COATS[j % PUP_COATS.length], fresh: (l.fresh & (1 << j)) !== 0 })
    })
    return out
  }, [sum])

  return (
    <Box
      data-testid="puppy-shelter"
      data-mode={mode}
      data-adopted={sum.adopted}
      data-total={sum.total}
      data-fresh={sum.fresh}
      data-view={view}
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 0.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 900, flex: 1, minWidth: 0 }} noWrap>
          🏠 {MODE_LABEL[mode]} shelter
        </Typography>
        <Typography data-testid="puppy-shelter-count" variant="subtitle1" sx={{ fontWeight: 900, color: '#f5b301' }}>
          {sum.adopted} / {sum.total}
        </Typography>
        <IconButton size="small" aria-label="Close shelter" data-testid="puppy-shelter-close" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box
        sx={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 1, overflow: 'hidden', bgcolor: theme.surround }}
        data-testid={view === 'room' ? 'puppy-shelter-room' : 'puppy-shelter-grid'}
      >
        {view === 'room' ? (
          <>
            <Suspense
              fallback={
                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              }
            >
              <PuppyShelter3D pups={pups} theme={themeId} />
            </Suspense>
            {sum.adopted === 0 && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <Typography sx={{ px: 2, py: 1, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.55)', color: 'common.white', textAlign: 'center' }}>
                  No puppies yet — rescue some and they'll move in here!
                </Typography>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, overflowY: 'auto', p: 0.75, bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 0.75 }}>
              {sum.levels.map((l, i) => {
                const done = popcount(l.mask) === l.n
                const open = unlocked(i)
                const canGo = !done && open
                return (
                  <Box
                    key={i}
                    role={canGo ? 'button' : undefined}
                    data-testid={`puppy-shelter-level-${i}`}
                    data-adopted={popcount(l.mask)}
                    data-total={l.n}
                    data-locked={open ? '0' : '1'}
                    onClick={canGo ? () => onPick(i) : undefined}
                    sx={{
                      p: 0.6,
                      borderRadius: 1.5,
                      border: '2px solid',
                      borderColor: done ? '#2e7d32' : 'divider',
                      cursor: canGo ? 'pointer' : 'default',
                      opacity: open ? 1 : 0.45,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', lineHeight: 1.2 }} noWrap>
                      {open ? levelLabel(i) : `🔒 ${levelLabel(i)}`}
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: '3px', mt: 0.4 }}>
                      {Array.from({ length: l.n }, (_, j) => (
                        <Box
                          key={j}
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: l.mask & (1 << j) ? PUP_COATS[j % PUP_COATS.length].body : 'rgba(128,128,128,0.25)',
                            border: '1px solid rgba(0,0,0,0.25)',
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
      </Box>

      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography data-testid="puppy-shelter-tiers" variant="caption" sx={{ flex: 1, minWidth: 0, color: 'text.secondary', lineHeight: 1.3 }}>
          {sum.tiers.map((t) => `${TIER_LABEL[t.tier]} ${t.adopted}/${t.total}`).join(' · ')}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          data-testid="puppy-shelter-view"
          onClick={() => setView(view === 'room' ? 'levels' : 'room')}
          sx={{ flexShrink: 0, textTransform: 'none' }}
        >
          {view === 'room' ? 'Levels' : 'Room'}
        </Button>
      </Stack>
    </Box>
  )
}
