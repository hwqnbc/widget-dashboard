import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, NativeSelect, Stack, Typography } from '@mui/material'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import WinnerCelebration from '../WinnerCelebration'
import ConfirmDialog from '../ConfirmDialog'
import {
  EXIT_ROW,
  LOT,
  isSolved,
  moveRange,
  parseBoard,
  replay,
  type Move,
  type Vehicle,
} from './carParkModel'
import { LEVELS, TIERS, TIER_LABEL, type Tier } from './carParkLevels'

/** The lot is drawn with a kerb margin around the 6×6 bays. */
const PAD = 0.25
const VIEW = LOT + PAD * 2
/** Below this (in cells) a pointer release is a TAP — it selects the
 * vehicle for the keyboard instead of moving it. */
const TAP_CELLS = 0.2

const TARGET_COLOR = '#e53935'
/** Cars and trucks cycle separate palettes so a truck reads as heavier. */
const CAR_COLORS = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#fdd835', '#6d4c41', '#d81b60']
const TRUCK_COLORS = ['#3949ab', '#00897b', '#546e7a', '#9e9d24']

const NO_MOVES: Move[] = []
const NO_BEST: Record<string, number> = {}
const coerceMoves = (v: unknown): Move[] | undefined =>
  Array.isArray(v) &&
  v.every((m) => Array.isArray(m) && m.length === 2 && m.every((n) => Number.isInteger(n)))
    ? (v as Move[])
    : undefined
const coerceBest = (v: unknown): Record<string, number> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v).every((n) => typeof n === 'number')
    ? (v as Record<string, number>)
    : undefined
const coerceTier = (v: unknown): Tier | undefined =>
  (TIERS as readonly unknown[]).includes(v) ? (v as Tier) : undefined

/** Persisted-best key for a level — `tier:index`, stable because the pack is
 * append-only. */
const levelKey = (tier: Tier, index: number) => `${tier}:${index}`

/** The level after this one: next in the tier, else the next tier's first. */
function nextLevel(tier: Tier, index: number): { tier: Tier; level: number } | null {
  if (index + 1 < LEVELS[tier].length) return { tier, level: index + 1 }
  const t = TIERS.indexOf(tier)
  for (let k = t + 1; k < TIERS.length; k++) if (LEVELS[TIERS[k]].length) return { tier: TIERS[k], level: 0 }
  return null
}

interface Drag {
  vi: number
  pointerId: number
  /** Client coordinate along the vehicle's axis at pointer-down. */
  origin: number
  /** Viewbox units per client pixel. */
  perPx: number
  min: number
  max: number
  /** Live fractional slide — in the ref so a release never reads a stale
   * render's value. */
  delta: number
}

function VehicleShape({ v, color, selected }: { v: Vehicle; color: string; selected: boolean }) {
  const L = v.len
  // Drawn horizontally, nose to the right (+x); a vertical vehicle is the
  // same shape rotated a quarter turn, nose down.
  const body = (
    <g>
      <rect
        x={0.07}
        y={0.1}
        width={L - 0.14}
        height={0.8}
        rx={0.2}
        fill={color}
        stroke={selected ? '#fff' : 'rgba(0,0,0,0.35)'}
        strokeWidth={selected ? 0.07 : 0.03}
      />
      {/* windscreen + rear window */}
      <rect x={L - 0.62} y={0.22} width={0.2} height={0.56} rx={0.06} fill="rgba(20,30,45,0.7)" />
      <rect x={L === 3 ? L - 1.05 : 0.2} y={0.24} width={L === 3 ? 0.08 : 0.14} height={0.52} rx={0.04} fill="rgba(20,30,45,0.55)" />
      {/* headlights */}
      <rect x={L - 0.14} y={0.18} width={0.05} height={0.16} rx={0.02} fill="#fff59d" />
      <rect x={L - 0.14} y={0.66} width={0.05} height={0.16} rx={0.02} fill="#fff59d" />
    </g>
  )
  return v.horiz ? body : <g transform="translate(1 0) rotate(90)">{body}</g>
}

export default function CarParkWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()

  const tier = useWidgetField<Tier>(id, 'tier', 'beginner', coerceTier)
  const storedLevel = useWidgetField<number>(id, 'level', 0, (v) =>
    Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined,
  )
  const moves = useWidgetField<Move[]>(id, 'moves', NO_MOVES, coerceMoves)
  const best = useWidgetField<Record<string, number>>(id, 'best', NO_BEST, coerceBest)
  const solved = useWidgetField<number>(id, 'solved', 0)

  const levels = LEVELS[tier]
  const levelIdx = Math.min(storedLevel, Math.max(0, levels.length - 1))
  const level = levels[levelIdx]
  const lot = useMemo(() => parseBoard(level.board), [level.board])
  // The position is DERIVED from the persisted move log; a stale/corrupt
  // log degrades to its valid prefix.
  const { pos, applied } = useMemo(() => replay(lot, moves), [lot, moves])
  const won = isSolved(lot, pos)
  const key = levelKey(tier, levelIdx)
  const myBest = best[key]

  const setGame = (data: Record<string, unknown>) => dispatch(updateWidgetData({ id, data }))

  /** Commit one slide. The win (solve tally + best) is written in the SAME
   * dispatch as the finishing move, so a reload never double-counts it. */
  const commit = (m: Move) => {
    const log = [...moves.slice(0, applied), m]
    const after = replay(lot, log)
    if (after.applied !== log.length) return
    const data: Record<string, unknown> = { moves: log }
    if (isSolved(lot, after.pos)) {
      data.solved = solved + 1
      if (myBest === undefined || log.length < myBest) data.best = { ...best, [key]: log.length }
    }
    setGame(data)
  }

  // ------------------------------------------------------------ dragging
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<{ vi: number; delta: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const startDrag = (e: ReactPointerEvent, vi: number) => {
    if (won || dragRef.current) return
    const svg = svgRef.current
    if (!svg) return
    e.stopPropagation()
    const rect = svg.getBoundingClientRect()
    const v = lot.vehicles[vi]
    const { min, max } = moveRange(lot, pos, vi)
    dragRef.current = {
      vi,
      pointerId: e.pointerId,
      origin: v.horiz ? e.clientX : e.clientY,
      perPx: VIEW / Math.min(rect.width, rect.height),
      min,
      max,
      delta: 0,
    }
    svg.setPointerCapture(e.pointerId)
    setDrag({ vi, delta: 0 })
  }

  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const v = lot.vehicles[d.vi]
    const raw = ((v.horiz ? e.clientX : e.clientY) - d.origin) * d.perPx
    d.delta = Math.min(d.max, Math.max(d.min, raw))
    setDrag({ vi: d.vi, delta: d.delta })
  }

  /** Release — or LOST capture (lessons #39): snap to the nearest bay. */
  const endDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    dragRef.current = null
    const { delta } = d
    setDrag(null)
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    if (Math.abs(delta) < TAP_CELLS) {
      setSelected(d.vi)
      return
    }
    const snapped = Math.round(delta)
    if (snapped !== 0) commit([d.vi, snapped])
  }

  // ------------------------------------------------------------ keyboard
  // Scoped to the focused widget (root onKeyDown), so it never steals keys
  // from the rest of the dashboard. Tap a vehicle to select it; each arrow
  // press slides it one bay (= one move).
  const onKeyDown = (e: KeyboardEvent) => {
    if (won || selected === null || isTypingTarget(e.target)) return
    const v = lot.vehicles[selected]
    const dir =
      e.key === (v.horiz ? 'ArrowRight' : 'ArrowDown') ? 1 : e.key === (v.horiz ? 'ArrowLeft' : 'ArrowUp') ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const { min, max } = moveRange(lot, pos, selected)
    if (dir > 0 ? max >= 1 : min <= -1) commit([selected, dir])
  }

  // ------------------------------------------------------------ controls
  const [pending, setPending] = useState<{ tier: Tier; level: number } | 'reset' | null>(null)
  const inProgress = applied > 0 && !won

  const goTo = (next: { tier: Tier; level: number }) => {
    setSelected(null)
    setGame({ tier: next.tier, level: next.level, moves: [] })
  }
  const requestLevel = (next: { tier: Tier; level: number }) => {
    if (next.tier === tier && next.level === levelIdx) return
    if (inProgress) setPending(next)
    else goTo(next)
  }
  const reset = () => {
    setSelected(null)
    setGame({ moves: [] })
  }
  const undo = () => {
    if (applied > 0 && !won) setGame({ moves: moves.slice(0, applied - 1) })
  }
  const after = nextLevel(tier, levelIdx)

  // ------------------------------------------------------------ render
  const lotColor = '#5f6b73'
  const lineColor = 'rgba(255,255,255,0.35)'

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      tabIndex={0}
      data-testid="carpark-root"
      data-tier={tier}
      data-level={levelIdx}
      data-moves={applied}
      data-par={level.par}
      data-best={myBest ?? ''}
      data-solved={solved}
      data-state={won ? 'won' : 'live'}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 0.5, outline: 'none' }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <NativeSelect
          value={tier}
          onChange={(e) => requestLevel({ tier: e.target.value as Tier, level: 0 })}
          data-testid="carpark-tier"
          inputProps={{ 'aria-label': 'Difficulty' }}
          sx={{ fontSize: 14 }}
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={levelIdx}
          onChange={(e) => requestLevel({ tier, level: parseInt(e.target.value, 10) })}
          data-testid="carpark-level"
          inputProps={{ 'aria-label': 'Level' }}
          sx={{ fontSize: 14 }}
        >
          {levels.map((l, i) => {
            const b = best[levelKey(tier, i)]
            const mark = b === undefined ? '' : b <= l.par ? ' ★' : ' ✓'
            return (
              <option key={i} value={i}>
                {`Level ${i + 1}${mark}`}
              </option>
            )
          })}
        </NativeSelect>
      </Stack>

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
          ref={svgRef}
          data-testid="carpark-board"
          viewBox={`${-PAD} ${-PAD} ${VIEW} ${VIEW}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }}
        >
          {/* kerb + tarmac + bay lines */}
          <rect x={-PAD} y={-PAD} width={VIEW} height={VIEW} rx={0.2} fill="#37474f" />
          <rect x={0} y={0} width={LOT} height={LOT} fill={lotColor} />
          {/* the exit: a gap in the right kerb on the exit row */}
          <rect x={LOT} y={EXIT_ROW} width={PAD} height={1} fill={lotColor} />
          <polygon
            points={`${LOT + 0.04},${EXIT_ROW + 0.35} ${LOT + 0.2},${EXIT_ROW + 0.5} ${LOT + 0.04},${EXIT_ROW + 0.65}`}
            fill={TARGET_COLOR}
            opacity={0.8}
          />
          <g stroke={lineColor} strokeWidth={0.025} strokeDasharray="0.12 0.1">
            {Array.from({ length: LOT - 1 }, (_, k) => (
              <g key={k}>
                <line x1={k + 1} y1={0} x2={k + 1} y2={LOT} />
                <line x1={0} y1={k + 1} x2={LOT} y2={k + 1} />
              </g>
            ))}
          </g>
          {lot.walls.map((w) => (
            <rect
              key={`w${w}`}
              x={(w % LOT) + 0.05}
              y={Math.floor(w / LOT) + 0.05}
              width={0.9}
              height={0.9}
              rx={0.1}
              fill="#263238"
            />
          ))}

          {/* Keyed by level so a level change re-mounts the cars instead of
              transitioning them from the old layout. */}
          <g key={key}>
            {lot.vehicles.map((v, vi) => {
              const dragging = drag?.vi === vi
              // Drag delta is fractional (follows the finger); released cars
              // snap with a short CSS transition. A won target drives OUT.
              const off = pos[vi] + (dragging ? drag.delta : 0)
              const out = won && vi === 0 ? LOT + PAD + 0.5 : off
              const x = v.horiz ? out : v.lane
              const y = v.horiz ? v.lane : out
              const color =
                vi === 0 ? TARGET_COLOR : v.len === 3 ? TRUCK_COLORS[vi % TRUCK_COLORS.length] : CAR_COLORS[vi % CAR_COLORS.length]
              return (
                <g
                  key={v.id}
                  data-vehicle={v.id}
                  data-index={vi}
                  data-row={v.horiz ? v.lane : pos[vi]}
                  data-col={v.horiz ? pos[vi] : v.lane}
                  data-len={v.len}
                  data-horiz={v.horiz ? '1' : '0'}
                  onPointerDown={(e) => startDrag(e, vi)}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                    transition: dragging
                      ? 'none'
                      : won && vi === 0
                        ? 'transform 700ms ease-in'
                        : 'transform 120ms ease-out',
                    cursor: won ? 'default' : v.horiz ? 'ew-resize' : 'ns-resize',
                  }}
                >
                  <VehicleShape v={v} color={color} selected={selected === vi && !won} />
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
              bgcolor: 'rgba(0,0,0,0.4)',
              pointerEvents: 'none',
              animation: 'carpark-in 400ms ease-out 500ms both',
              '@keyframes carpark-in': { from: { opacity: 0 }, to: { opacity: 1 } },
            }}
            data-testid="carpark-won"
          >
            <WinnerCelebration winner="toy" />
            <Typography sx={{ fontWeight: 700, color: 'common.white', textAlign: 'center' }}>
              Out in {applied} moves!
              {applied <= level.par ? ' Par ★' : ` Par is ${level.par}.`}
            </Typography>
          </Box>
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {`Moves ${applied} · Par ${level.par}${myBest !== undefined ? ` · Best ${myBest}` : ''}`}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {won && after && (
            <Button variant="contained" size="small" data-testid="carpark-next" onClick={() => goTo(after)}>
              Next level
            </Button>
          )}
          <Button size="small" data-testid="carpark-undo" disabled={applied === 0 || won} onClick={undo}>
            Undo
          </Button>
          <Button
            size="small"
            data-testid="carpark-reset"
            disabled={applied === 0}
            onClick={() => (inProgress ? setPending('reset') : reset())}
          >
            Reset
          </Button>
        </Stack>
      </Stack>

      <ConfirmDialog
        open={pending !== null}
        title="Start over?"
        message="Your moves on this level will be lost."
        onConfirm={() => {
          if (pending === 'reset') reset()
          else if (pending) goTo(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
