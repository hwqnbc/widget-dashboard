import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  NativeSelect,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import LightbulbIcon from '@mui/icons-material/LightbulbOutlined'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import { usePresentation } from '../../fullscreen/presentation'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import WinnerCelebration from '../WinnerCelebration'
import ConfirmDialog from '../ConfirmDialog'
import {
  EXIT_ROW,
  LOT,
  hint as solveHint,
  isSolved,
  moveRange,
  parseBoard,
  replay,
  type Move,
  type Vehicle,
} from './carParkModel'
import { LEVELS, TIERS, TIER_LABEL, type Tier } from './carParkLevels'
import { TARGET_COLOR, TARGET_STRIPE, TARGET_TRIM, vehicleColor } from './palette'

/** The 3D board is its own lazy chunk — three.js never reaches the main
 * bundle, and the 2D default never downloads it. */
const CarPark3D = lazyWithReload(() => import('./CarPark3D'), 'carpark3d')

type BoardView = '2d' | '3d'
const coerceView = (v: unknown): BoardView | undefined => (v === '2d' || v === '3d' ? v : undefined)
const coerceYaw = (v: unknown): number | undefined =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 4 ? (v as number) : undefined

/**
 * World direction (dx, dz in bays) an arrow key means on SCREEN when the 3D
 * camera has turned `yaw` quarter-turns about the lot. At yaw 0 the camera
 * sits south of the lot: right = +x, down (toward the viewer) = +z. Turning
 * the camera rotates both — so keys always move cars the way they look.
 */
function screenKeyToWorld(key: string, yaw: number): { dx: number; dz: number } | null {
  const a = (yaw * Math.PI) / 2
  const right = { dx: Math.round(Math.cos(a)), dz: Math.round(-Math.sin(a)) }
  const toward = { dx: Math.round(Math.sin(a)), dz: Math.round(Math.cos(a)) }
  switch (key) {
    case 'ArrowRight':
      return right
    case 'ArrowLeft':
      return { dx: -right.dx, dz: -right.dz }
    case 'ArrowDown':
      return toward
    case 'ArrowUp':
      return { dx: -toward.dx, dz: -toward.dz }
    default:
      return null
  }
}

/** The lot is drawn with a kerb margin around the 6×6 bays. */
const PAD = 0.25
const VIEW = LOT + PAD * 2
/** Below this (in cells) a pointer release is a TAP — it selects the
 * vehicle for the keyboard instead of moving it. */
const TAP_CELLS = 0.2
/** Hint highlight — amber-yellow, distinct from the red target and the
 * white selection outline. */
const HINT_COLOR = '#ffc400'

const NO_MOVES: Move[] = []
const NO_BEST: Record<string, number> = {}
const coerceMoves = (v: unknown): Move[] | undefined =>
  Array.isArray(v) &&
  v.every((m) => Array.isArray(m) && m.length === 2 && m.every((n) => Number.isInteger(n)))
    ? (v as Move[])
    : undefined
const NO_ASSISTED: Record<string, true> = {}
const coerceAssisted = (v: unknown): Record<string, true> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => x === true)
    ? (v as Record<string, true>)
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

/** A drag in progress — view-agnostic, in BAYS. The 2D board and the 3D
 * view each turn their own pointer input into a bay delta and feed it here,
 * so clamping, snapping and move counting are shared. */
interface Drag {
  vi: number
  min: number
  max: number
  /** Live fractional slide — in the ref so a release never reads a stale
   * render's value. */
  delta: number
}

/** The 2D board's pointer bookkeeping (client px → bays). */
interface SvgGrab {
  pointerId: number
  /** Client coordinate along the vehicle's axis at pointer-down. */
  origin: number
  /** Viewbox units per client pixel. */
  perPx: number
}

function VehicleShape({
  v,
  color,
  selected,
  target = false,
}: {
  v: Vehicle
  color: string
  selected: boolean
  /** The red car — gets a livery so it never relies on colour alone. */
  target?: boolean
}) {
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
        stroke={selected ? '#fff' : target ? TARGET_TRIM : 'rgba(0,0,0,0.35)'}
        strokeWidth={selected ? 0.07 : target ? 0.06 : 0.03}
      />
      {target && (
        <>
          {/* racing stripes + a roof chevron pointing at the exit */}
          <rect x={0.14} y={0.4} width={L - 0.28} height={0.06} fill={TARGET_STRIPE} opacity={0.9} />
          <rect x={0.14} y={0.54} width={L - 0.28} height={0.06} fill={TARGET_STRIPE} opacity={0.9} />
          <polygon
            points={`${L / 2 - 0.2},0.3 ${L / 2 + 0.12},0.5 ${L / 2 - 0.2},0.7 ${L / 2 - 0.1},0.5`}
            fill={TARGET_STRIPE}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.02}
          />
        </>
      )}
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
  const cardView = useWidgetField<BoardView>(id, 'view', '2d', coerceView)
  // Fullscreen keeps its OWN view choice (default 3D — the 3D board is the
  // one that benefits from the space); the card keeps its own.
  const fsView = useWidgetField<BoardView>(id, 'fsView', '3d', coerceView)
  const yaw = useWidgetField<number>(id, 'yaw', 0, coerceYaw)
  // Hints used on THIS attempt (reset with the move log) and the levels
  // solved only with help — those earn ✓ but never ★ / best.
  const hints = useWidgetField<number>(id, 'hints', 0)
  const assisted = useWidgetField<Record<string, true>>(id, 'assisted', NO_ASSISTED, coerceAssisted)
  const { fullscreen } = usePresentation()
  const view = fullscreen ? fsView : cardView

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

  // ------------------------------------------------------------ hint
  // A hint is shown for ONE position (keyed by level + position), and is
  // explicitly dropped on every commit / Undo / Reset / level change — so
  // returning to a hinted position (e.g. via Reset) never resurrects an
  // old hint without counting it.
  const posKey = `${key}|${pos.join(',')}`
  const [hintKey, setHintKey] = useState<string | null>(null)
  const hintMove = useMemo(
    () => (hintKey === posKey && !isSolved(lot, pos) ? solveHint(lot, pos) : null),
    [hintKey, posKey, lot, pos],
  )
  const askHint = () => {
    if (hintKey === posKey) return // same position: already shown, count once
    setHintKey(posKey)
    setGame({ hints: hints + 1 })
  }
  // The FIRST hint of an attempt costs the ★ / best, so it asks first (the
  // button sits beside Undo/Reset — easy to hit by accident). Later hints
  // skip the prompt: the ★ is already gone. Per attempt: Reset or a level
  // change zeroes `hints`, so a fresh attempt asks again.
  const [hintConfirm, setHintConfirm] = useState(false)
  const onHintClick = () => {
    if (hintKey === posKey) return
    if (hints === 0) setHintConfirm(true)
    else askHint()
  }

  const setGame = (data: Record<string, unknown>) => dispatch(updateWidgetData({ id, data }))

  /** Commit one slide. The win (solve tally + best) is written in the SAME
   * dispatch as the finishing move, so a reload never double-counts it. */
  const commit = (m: Move) => {
    const log = [...moves.slice(0, applied), m]
    const after = replay(lot, log)
    if (after.applied !== log.length) return
    setHintKey(null)
    const data: Record<string, unknown> = { moves: log }
    if (isSolved(lot, after.pos)) {
      data.solved = solved + 1
      // A hinted solve counts as solved (✓) but never updates best / ★ —
      // hints follow the optimal line, so a hinted par would mean nothing.
      if (hints > 0) {
        if (myBest === undefined) data.assisted = { ...assisted, [key]: true }
      } else if (myBest === undefined || log.length < myBest) {
        data.best = { ...best, [key]: log.length }
      }
    }
    setGame(data)
  }

  // ------------------------------------------------------------ dragging
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<{ vi: number; delta: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const svgGrab = useRef<SvgGrab | null>(null)
  const probeRef = useRef<HTMLDivElement>(null)

  // Refs mirror the latest render so the (memoized, 3D-facing) drag core
  // never closes over a stale position or move log.
  const live = useRef({ won, lot, pos, commit })
  live.current = { won, lot, pos, commit }

  const beginDrag = useCallback((vi: number): boolean => {
    const { won: w, lot: l, pos: p } = live.current
    if (w || dragRef.current) return false
    const { min, max } = moveRange(l, p, vi)
    dragRef.current = { vi, min, max, delta: 0 }
    setDrag({ vi, delta: 0 })
    return true
  }, [])

  const dragTo = useCallback((raw: number) => {
    const d = dragRef.current
    if (!d) return
    d.delta = Math.min(d.max, Math.max(d.min, raw))
    setDrag({ vi: d.vi, delta: d.delta })
  }, [])

  /** Release — or LOST capture (lessons #39): a tap selects, anything else
   * snaps to the nearest bay and commits ONE move. */
  const finishDrag = useCallback(() => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setDrag(null)
    if (Math.abs(d.delta) < TAP_CELLS) {
      setSelected(d.vi)
      return
    }
    const snapped = Math.round(d.delta)
    if (snapped !== 0) live.current.commit([d.vi, snapped])
  }, [])

  const startSvgDrag = (e: ReactPointerEvent, vi: number) => {
    const svg = svgRef.current
    if (!svg || !beginDrag(vi)) return
    e.stopPropagation()
    const rect = svg.getBoundingClientRect()
    const v = lot.vehicles[vi]
    svgGrab.current = {
      pointerId: e.pointerId,
      origin: v.horiz ? e.clientX : e.clientY,
      perPx: VIEW / Math.min(rect.width, rect.height),
    }
    svg.setPointerCapture(e.pointerId)
  }

  const moveSvgDrag = (e: ReactPointerEvent) => {
    const g = svgGrab.current
    const d = dragRef.current
    if (!g || !d || e.pointerId !== g.pointerId) return
    const v = lot.vehicles[d.vi]
    dragTo(((v.horiz ? e.clientX : e.clientY) - g.origin) * g.perPx)
  }

  const endSvgDrag = (e: ReactPointerEvent) => {
    const g = svgGrab.current
    if (!g || e.pointerId !== g.pointerId) return
    svgGrab.current = null
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
    finishDrag()
  }

  // ------------------------------------------------------------ keyboard
  // Scoped to the focused widget (root onKeyDown), so it never steals keys
  // from the rest of the dashboard. Tap a vehicle to select it; each arrow
  // press slides it one bay (= one move).
  const onKeyDown = (e: KeyboardEvent) => {
    if (won || selected === null || isTypingTarget(e.target)) return
    const v = lot.vehicles[selected]
    // In 3D the camera may be turned — map the key through it.
    const w = screenKeyToWorld(e.key, view === '3d' ? yaw : 0)
    if (!w) return
    const dir = v.horiz ? w.dx : w.dz
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
    setHintKey(null)
    setGame({ tier: next.tier, level: next.level, moves: [], hints: 0 })
  }
  const requestLevel = (next: { tier: Tier; level: number }) => {
    if (next.tier === tier && next.level === levelIdx) return
    if (inProgress) setPending(next)
    else goTo(next)
  }
  const reset = () => {
    setSelected(null)
    setHintKey(null)
    setGame({ moves: [], hints: 0 })
  }
  const undo = () => {
    if (applied > 0 && !won) {
      setHintKey(null)
      setGame({ moves: moves.slice(0, applied - 1) })
    }
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
      data-hint={hintMove ? `${hintMove[0]}:${hintMove[1]}` : ''}
      data-hints={hints}
      data-solved={solved}
      data-state={won ? 'won' : 'live'}
      data-view={view}
      data-yaw={yaw}
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
            const mark = b !== undefined ? (b <= l.par ? ' ★' : ' ✓') : assisted[levelKey(tier, i)] ? ' ✓' : ''
            return (
              <option key={i} value={i}>
                {`Level ${i + 1}${mark}`}
              </option>
            )
          })}
        </NativeSelect>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, v: BoardView | null) => {
            if (v && v !== view) setGame(fullscreen ? { fsView: v } : { view: v })
          }}
          data-testid="carpark-view"
          aria-label="Board view"
        >
          <ToggleButton value="2d" data-testid="carpark-view-2d" sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            2D
          </ToggleButton>
          <ToggleButton value="3d" data-testid="carpark-view-3d" sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
            3D
          </ToggleButton>
        </ToggleButtonGroup>
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
        {view === '2d' ? (
        <svg
          ref={svgRef}
          data-testid="carpark-board"
          viewBox={`${-PAD} ${-PAD} ${VIEW} ${VIEW}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={moveSvgDrag}
          onPointerUp={endSvgDrag}
          onPointerCancel={endSvgDrag}
          onLostPointerCapture={endSvgDrag}
          style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }}
        >
          {/* kerb + tarmac + bay lines */}
          <rect x={-PAD} y={-PAD} width={VIEW} height={VIEW} rx={0.2} fill="#37474f" />
          <rect x={0} y={0} width={LOT} height={LOT} fill={lotColor} />
          {/* the goal lane: a faint red tint along the exit row */}
          <rect x={0} y={EXIT_ROW} width={LOT + PAD} height={1} fill={TARGET_COLOR} opacity={0.16} />
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
          {hintMove && (() => {
            const [hv, hd] = hintMove
            const v = lot.vehicles[hv]
            const to = pos[hv] + hd
            const gx = v.horiz ? to : v.lane
            const gy = v.horiz ? v.lane : to
            const w = v.horiz ? v.len : 1
            const h = v.horiz ? 1 : v.len
            return (
              <g pointerEvents="none">
                <rect
                  data-testid="carpark-hint-ghost"
                  x={gx + 0.07}
                  y={gy + 0.07}
                  width={w - 0.14}
                  height={h - 0.14}
                  rx={0.2}
                  fill={vehicleColor(v, hv)}
                  fillOpacity={0.3}
                  stroke={HINT_COLOR}
                  strokeWidth={0.05}
                  strokeDasharray="0.14 0.08"
                />
              </g>
            )
          })()}
          <g key={key}>
            {lot.vehicles.map((v, vi) => {
              const dragging = drag?.vi === vi
              // Drag delta is fractional (follows the finger); released cars
              // snap with a short CSS transition. A won target drives OUT.
              const off = pos[vi] + (dragging ? drag.delta : 0)
              const out = won && vi === 0 ? LOT + PAD + 0.5 : off
              const x = v.horiz ? out : v.lane
              const y = v.horiz ? v.lane : out
              const color = vehicleColor(v, vi)
              return (
                <g
                  key={v.id}
                  data-vehicle={v.id}
                  data-index={vi}
                  data-row={v.horiz ? v.lane : pos[vi]}
                  data-col={v.horiz ? pos[vi] : v.lane}
                  data-len={v.len}
                  data-horiz={v.horiz ? '1' : '0'}
                  data-target={vi === 0 ? '1' : undefined}
                  data-hinted={hintMove?.[0] === vi ? '1' : undefined}
                  onPointerDown={(e) => startSvgDrag(e, vi)}
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
                  <VehicleShape v={v} color={color} selected={selected === vi && !won} target={vi === 0} />
                  {hintMove?.[0] === vi && (
                    <rect
                      x={0.03}
                      y={0.03}
                      width={(v.horiz ? v.len : 1) - 0.06}
                      height={(v.horiz ? 1 : v.len) - 0.06}
                      rx={0.22}
                      fill="none"
                      stroke={HINT_COLOR}
                      strokeWidth={0.08}
                      strokeDasharray="0.16 0.08"
                      pointerEvents="none"
                    >
                      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                    </rect>
                  )}
                </g>
              )
            })}
          </g>
          {/* Hint arrow ON TOP of the cars: from the hinted car's leading
              edge (in the slide direction) to the middle of its ghost. */}
          {hintMove && !drag && (() => {
            const [hv, hd] = hintMove
            const v = lot.vehicles[hv]
            const s = Math.sign(hd)
            const lead = s > 0 ? pos[hv] + v.len - 0.3 : pos[hv] + 0.3
            const tip = pos[hv] + hd + v.len / 2
            const mid = v.lane + 0.5
            const [x0, y0, x1, y1] = v.horiz ? [lead, mid, tip, mid] : [mid, lead, mid, tip]
            const ux = v.horiz ? s : 0
            const uy = v.horiz ? 0 : s
            return (
              <g pointerEvents="none" data-testid="carpark-hint-arrow">
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1 - ux * 0.25}
                  y2={y1 - uy * 0.25}
                  stroke={HINT_COLOR}
                  strokeWidth={0.1}
                  strokeLinecap="round"
                />
                <polygon
                  points={`${x1},${y1} ${x1 - ux * 0.32 - uy * 0.2},${y1 - uy * 0.32 - ux * 0.2} ${x1 - ux * 0.32 + uy * 0.2},${y1 - uy * 0.32 + ux * 0.2}`}
                  fill={HINT_COLOR}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={0.02}
                />
              </g>
            )
          })()}
        </svg>
        ) : (
          <Box
            ref={probeRef}
            data-testid="carpark-3d"
            sx={{ position: 'absolute', inset: 0, touchAction: 'none' }}
          >
            <Suspense
              fallback={
                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              }
            >
              <CarPark3D
                lot={lot}
                pos={pos}
                drag={drag}
                won={won}
                selected={selected}
                onBegin={beginDrag}
                onDrag={dragTo}
                onEnd={finishDrag}
                levelKey={key}
                probeRef={probeRef}
                yaw={yaw}
                hint={hintMove}
              />
            </Suspense>
          </Box>
        )}

        {view === '3d' && (
          <IconButton
            size="small"
            aria-label="Rotate view"
            data-testid="carpark-rotate"
            onClick={() => setGame({ yaw: (yaw + 1) % 4 })}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <RotateRightIcon fontSize="small" />
          </IconButton>
        )}

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
            {/* Text first: on a narrow card the celebration figure can fill
                the overlay, and the result line must never be clipped. */}
            <Typography sx={{ fontWeight: 700, color: 'common.white', textAlign: 'center' }}>
              Out in {applied} moves!
              {hints > 0
                ? ` With ${hints} hint${hints === 1 ? '' : 's'}.`
                : applied <= level.par
                  ? ' Par ★'
                  : ` Par is ${level.par}.`}
            </Typography>
            <WinnerCelebration winner="toy" />
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
          {/* Won: Next level takes Undo's (disabled anyway) slot, so the
              footer fits a narrow card on one line. */}
          {!won && (
            <IconButton size="small" aria-label="Hint" data-testid="carpark-hint" onClick={onHintClick}>
              <LightbulbIcon fontSize="small" />
            </IconButton>
          )}
          {!won && (
            <Button size="small" data-testid="carpark-undo" disabled={applied === 0} onClick={undo}>
              Undo
            </Button>
          )}
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
      <ConfirmDialog
        open={hintConfirm}
        title="Use a hint?"
        message="Hints show the best next move, but this attempt won't earn a ★ or a best score. You can still finish the level."
        confirmLabel="Show hint"
        cancelLabel="Keep trying"
        onConfirm={() => {
          setHintConfirm(false)
          askHint()
        }}
        onCancel={() => setHintConfirm(false)}
      />
    </Box>
  )
}
