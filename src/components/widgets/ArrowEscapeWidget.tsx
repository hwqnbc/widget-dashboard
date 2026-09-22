import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import {
  ARROW_DIMS,
  DEFAULT_ARROWS_SEED,
  blockerOf,
  generatePuzzle,
  headDir,
  trackOf,
  type Arrow,
  type ArrowsSize,
  type Cell,
} from './arrowsModel'

/** Slide speed, board cells per second — brisk like the ad, readable for a
 * kid. Bump-and-return runs the same speed both ways. */
const SPEED = 16
/** How far past the blocker's near edge the bump appears to reach. */
const BUMP_REACH = 0.4
const FLASH_MS = 450

/** Cheerful line colours cycled by arrow id — mid tones that read on both
 * themes (the ad's all-black lines vanish in dark mode). */
const ARROW_COLORS = [
  '#5c6bc0',
  '#26a69a',
  '#ef6c00',
  '#ab47bc',
  '#ec407a',
  '#66bb6a',
  '#29b6f6',
  '#8d6e63',
]
const FLASH_COLOR = '#e53935'

const NO_REMOVED: number[] = []
const coerceRemoved = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((n) => Number.isInteger(n)) ? (v as number[]) : undefined

type AnimKind = 'exit' | 'bump'
interface Anim {
  kind: AnimKind
  start: number
  /** exit: the full advance to off-board · bump: the forward reach. */
  dist: number
}

/** Point at arc distance `s` along the unit-segment track. */
function pointAt(track: Cell[], s: number): Cell {
  const i = Math.min(Math.max(Math.floor(s), 0), track.length - 2)
  const f = s - i
  return {
    x: track[i].x + (track[i + 1].x - track[i].x) * f,
    y: track[i].y + (track[i + 1].y - track[i].y) * f,
  }
}

/** The snake at advance `a`: the window [a, a+len-1] of its track — the
 * fractional endpoints plus every integer vertex between, so bends travel
 * through the body as it slides. */
function windowPoints(track: Cell[], a: number, len: number): Cell[] {
  const s0 = a
  const s1 = a + len - 1
  const pts: Cell[] = [pointAt(track, s0)]
  for (let i = Math.ceil(s0 + 1e-6); i <= Math.floor(s1 - 1e-6); i++) {
    pts.push(track[i])
  }
  pts.push(pointAt(track, s1))
  return pts
}

const mid = (c: Cell) => `${c.x + 0.5},${c.y + 0.5}`

export default function ArrowEscapeWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()

  const seed = useWidgetField<number>(id, 'seed', DEFAULT_ARROWS_SEED, (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined,
  )
  const size = useWidgetField<ArrowsSize>(id, 'size', 'medium', (v) =>
    v === 'small' || v === 'large' ? v : 'medium',
  )
  const removed = useWidgetField<number[]>(id, 'removed', NO_REMOVED, coerceRemoved)
  const taps = useWidgetField<number>(id, 'taps', 0, (v) =>
    typeof v === 'number' ? v : undefined,
  )
  const bumps = useWidgetField<number>(id, 'bumps', 0, (v) =>
    typeof v === 'number' ? v : undefined,
  )
  const solved = useWidgetField<number>(id, 'solved', 0, (v) =>
    typeof v === 'number' ? v : undefined,
  )

  const dims = ARROW_DIMS[size]
  const puzzle = useMemo(
    () => generatePuzzle(seed, dims.cols, dims.rows, dims.count, dims.minLen, dims.maxLen),
    [seed, dims],
  )
  const tracks = useMemo(() => {
    const m = new Map<number, Cell[]>()
    for (const a of puzzle.arrows) m.set(a.id, trackOf(a, puzzle.cols, puzzle.rows))
    return m
  }, [puzzle])

  const removedSet = useMemo(() => new Set(removed), [removed])
  const alive = puzzle.arrows.filter((a) => !removedSet.has(a.id))
  const won = removed.length > 0 && alive.length === 0

  // ---------------------------------------------------------- animation
  // Anim state lives in a ref (per-frame reads), with a counter state that
  // starts/stops the single rAF loop and a tick state that repaints frames.
  const anims = useRef<Map<number, Anim>>(new Map())
  const [animCount, setAnimCount] = useState(0)
  const [, setTick] = useState(0)
  const [flash, setFlash] = useState<number | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef({ removed, solved, total: puzzle.arrows.length })
  stateRef.current = { removed, solved, total: puzzle.arrows.length }

  useEffect(() => {
    if (animCount === 0) return
    let raf = 0
    const frame = () => {
      const now = performance.now()
      let finished = 0
      for (const [aid, anim] of anims.current) {
        const t = (now - anim.start) / 1000
        if (anim.kind === 'exit' && t * SPEED >= anim.dist) {
          anims.current.delete(aid)
          finished++
          const { removed: cur, solved: s, total } = stateRef.current
          const next = [...cur, aid]
          // The clear is counted in the SAME dispatch that removes the last
          // arrow, so a reload can never double-count it.
          dispatch(
            updateWidgetData({
              id,
              data: { removed: next, ...(next.length === total ? { solved: s + 1 } : {}) },
            }),
          )
        } else if (anim.kind === 'bump' && t * SPEED >= anim.dist * 2) {
          anims.current.delete(aid)
          finished++
        }
      }
      if (finished > 0) setAnimCount((c) => c - finished)
      setTick((v) => v + 1)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [animCount, dispatch, id])

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    },
    [],
  )

  /** Advance (cells along the track) an arrow is currently drawn at. */
  const advanceOf = (aid: number): number => {
    const anim = anims.current.get(aid)
    if (!anim) return 0
    const d = ((performance.now() - anim.start) / 1000) * SPEED
    if (anim.kind === 'exit') return Math.min(d, anim.dist)
    // Bump: out to the reach, then straight back.
    return d < anim.dist ? d : Math.max(0, anim.dist * 2 - d)
  }

  // An arrow already flying out no longer blocks anyone — it is leaving.
  const blockingAlive = alive.filter((a) => anims.current.get(a.id)?.kind !== 'exit')

  const setGame = (next: Record<string, unknown>) => dispatch(updateWidgetData({ id, data: next }))

  const tapArrow = (a: Arrow) => {
    if (won || anims.current.has(a.id)) return
    const blk = blockerOf(a, blockingAlive, puzzle.cols, puzzle.rows)
    setGame({ taps: taps + 1, ...(blk ? { bumps: bumps + 1 } : {}) })
    if (blk) {
      anims.current.set(a.id, {
        kind: 'bump',
        start: performance.now(),
        dist: blk.free + BUMP_REACH,
      })
      setFlash(blk.id)
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
    } else {
      const track = tracks.get(a.id)!
      anims.current.set(a.id, {
        kind: 'exit',
        start: performance.now(),
        dist: track.length - a.cells.length,
      })
    }
    setAnimCount((c) => c + 1)
  }

  // ------------------------------------------------------------- controls
  const [pending, setPending] = useState<{ size?: ArrowsSize; reshuffle?: true } | null>(null)
  const inProgress = removed.length > 0 && !won

  const freshPuzzle = (extra: Partial<{ size: ArrowsSize }> = {}) => {
    anims.current.clear()
    setAnimCount(0)
    setFlash(null)
    setGame({
      seed: (Math.random() * 0xffffffff) >>> 0,
      removed: [],
      taps: 0,
      bumps: 0,
      ...extra,
    })
  }
  const requestFresh = (extra: { size?: ArrowsSize } = {}) => {
    if (inProgress) setPending({ ...extra, reshuffle: true })
    else freshPuzzle(extra)
  }
  const changeSize = (next: ArrowsSize | null) => {
    if (next && next !== size) requestFresh({ size: next })
  }

  const clip = `arrows-clip-${id}`

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      data-testid="arrows-root"
      data-size={size}
      data-seed={seed}
      data-total={puzzle.arrows.length}
      data-left={alive.length}
      data-taps={taps}
      data-bumps={bumps}
      data-solved={solved}
      data-state={won ? 'won' : 'live'}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 0.5 }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={size}
        onChange={(_, v) => changeSize(v as ArrowsSize | null)}
        sx={{ alignSelf: 'center' }}
      >
        {(['small', 'medium', 'large'] as const).map((s) => (
          <ToggleButton
            key={s}
            value={s}
            data-testid={`arrows-size-${s}`}
            sx={{ textTransform: 'capitalize', py: 0.25 }}
          >
            {s}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          containerType: 'size',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg
          data-testid="arrows-board"
          viewBox={`0 0 ${puzzle.cols} ${puzzle.rows}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', touchAction: 'manipulation' }}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={0} y={0} width={puzzle.cols} height={puzzle.rows} />
            </clipPath>
          </defs>

          {/* The ad's dot lattice — one dot per cell, theme-following. */}
          <g style={{ color: 'currentcolor' }} opacity={0.18}>
            {Array.from({ length: puzzle.rows }, (_, y) =>
              Array.from({ length: puzzle.cols }, (_, x) => (
                <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.06} fill="currentColor" />
              )),
            )}
          </g>

          <g clipPath={`url(#${clip})`}>
            {alive.map((a) => {
              const track = tracks.get(a.id)!
              const len = a.cells.length
              const adv = advanceOf(a.id)
              const pts = windowPoints(track, adv, len)
              const headPt = pts[pts.length - 1]
              // Head direction from just behind the window's leading end, so
              // the arrowhead swings through bends mid-flight.
              const back = pointAt(track, adv + len - 1 - 0.05)
              const hx = headPt.x - back.x
              const hy = headPt.y - back.y
              const hl = Math.hypot(hx, hy) || 1
              const dx = hx / hl
              const dy = hy / hl
              const cx = headPt.x + 0.5
              const cy = headPt.y + 0.5
              const tip = `${cx + dx * 0.42},${cy + dy * 0.42}`
              const b1 = `${cx - dy * 0.26},${cy + dx * 0.26}`
              const b2 = `${cx + dy * 0.26},${cy - dx * 0.26}`
              const color = flash === a.id ? FLASH_COLOR : ARROW_COLORS[a.id % ARROW_COLORS.length]
              const blocked = blockerOf(a, blockingAlive, puzzle.cols, puzzle.rows) !== null
              const head = a.cells[len - 1]
              const d = `M ${pts.map(mid).join(' L ')}`
              return (
                <g
                  key={a.id}
                  data-arrow={a.id}
                  data-dir={headDir(a)}
                  data-len={len}
                  data-blocked={blocked ? '1' : '0'}
                  data-head={`${head.x},${head.y}`}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.28}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polygon points={`${tip} ${b1} ${b2}`} fill={color} />
                  {/* Fat invisible twin: the tap target, so little fingers
                      don't need to hit a 0.28-cell stroke. */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={0.85}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: won ? 'default' : 'pointer' }}
                    onClick={() => tapArrow(a)}
                  />
                </g>
              )
            })}
          </g>
        </svg>

        {won && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.38)',
              pointerEvents: 'none',
            }}
            data-testid="arrows-cleared"
          >
            <WinnerCelebration winner="toy" />
            <Typography sx={{ fontWeight: 700, color: 'common.white' }}>
              Board cleared!{bumps === 0 ? ' Not a single bump ★' : ''}
            </Typography>
          </Box>
        )}
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {won ? `Solved ×${solved}` : `${alive.length} to go · ${bumps} bump${bumps === 1 ? '' : 's'}`}
        </Typography>
        <Button size="small" data-testid="arrows-new" onClick={() => requestFresh()}>
          New puzzle
        </Button>
      </Stack>

      <ConfirmDialog
        open={pending !== null}
        title="Start over?"
        message="A new puzzle clears the arrows you have already freed."
        onConfirm={() => {
          if (pending) freshPuzzle(pending.size ? { size: pending.size } : {})
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
