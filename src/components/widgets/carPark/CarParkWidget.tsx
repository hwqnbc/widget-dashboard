import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import PlayCircleIcon from '@mui/icons-material/PlayCircleOutlined'
import UndoIcon from '@mui/icons-material/Undo'
import RestartIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import { usePresentation } from '../../fullscreen/presentation'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import type { Seat, SeatAvatars } from '../../../features/avatars/types'
import {
  SeatAvatarsOverride,
  coerceSeatAvatars,
  useSeatAvatars,
} from '../../../features/avatars/useSeatAvatars'
import { avatarMetaById } from '../../../features/avatars/avatarCatalog'
import { avatarVisualById } from '../../../registry/avatarRegistry'
import { useNetplay } from '../../../features/netplay/useNetplay'
import NetplayChip from '../../netplay/NetplayChip'
import NetplayModeToggle from '../../netplay/NetplayModeToggle'
import WinnerCelebration from '../WinnerCelebration'
import ConfirmDialog from '../ConfirmDialog'
import {
  EXIT_ROW,
  LOT,
  applyMove,
  hint as solveHint,
  isSolved,
  moveRange,
  packRacePos,
  parseBoard,
  unpackRacePos,
  replay,
  solve,
  type Lot,
  type Move,
  type Vehicle,
} from './carParkModel'
import { LEVELS, TIERS, TIER_LABEL, type Tier } from './carParkLevels'
import { TARGET_COLOR, TARGET_STRIPE, TARGET_TRIM, vehicleColor } from './palette'

/** The 3D board is its own lazy chunk — three.js never reaches the main
 * bundle, and the 2D default never downloads it. */
const CarPark3D = lazyWithReload(() => import('./CarPark3D'), 'carpark3d')
/** The pairing UI (QR encode/scan) — its own lazy chunk, as in every
 * net-played widget. */
const NetplayDialog = lazyWithReload(() => import('../../netplay/NetplayDialog'), 'netplay-dialog')

type PlayMode = 'solo' | 'online'
const coerceMode = (v: unknown): PlayMode | undefined => (v === 'solo' || v === 'online' ? v : undefined)
/** Race countdown: three ticks, then GO (as Maze Runner). */
const COUNT_FROM = 3
const COUNT_MS = 800

/** The opponent's lot in miniature — drawn from their packed `pos`. */
function MiniLot({ lot, pos }: { lot: Lot; pos: readonly number[] }) {
  return (
    <svg viewBox={`0 0 ${LOT} ${LOT}`} width={56} height={56} style={{ display: 'block', borderRadius: 4 }}>
      <rect x={0} y={0} width={LOT} height={LOT} fill="#5f6b73" />
      <rect x={0} y={EXIT_ROW} width={LOT} height={1} fill={TARGET_COLOR} opacity={0.18} />
      {lot.vehicles.map((v, i) => (
        <rect
          key={v.id}
          x={(v.horiz ? pos[i] : v.lane) + 0.08}
          y={(v.horiz ? v.lane : pos[i]) + 0.08}
          width={(v.horiz ? v.len : 1) - 0.16}
          height={(v.horiz ? 1 : v.len) - 0.16}
          rx={0.2}
          fill={vehicleColor(v, i)}
          stroke={i === 0 ? TARGET_TRIM : 'none'}
          strokeWidth={0.12}
        />
      ))}
    </svg>
  )
}

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
/** Solution replay pacing: a beat before the first move, one slide per
 * step, and a hold on the finished board before handing back. */
const REPLAY_LEAD_MS = 600
const REPLAY_STEP_MS = 650
const REPLAY_HOLD_MS = 1200

/** A solution playing back — transient, never persisted. `giveUp`: started
 * mid-attempt from "Show solution", so the attempt restarts afterwards. */
interface SolutionReplay {
  base: number[]
  moves: Move[]
  step: number
  giveUp: boolean
}

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

/** A tier's progress: levels solved (clean or hinted) and ★ (clean, ≤ par). */
function tierProgress(
  tier: Tier,
  best: Record<string, number>,
  assisted: Record<string, true>,
): { solved: number; stars: number; total: number } {
  let solved = 0
  let stars = 0
  LEVELS[tier].forEach((l, i) => {
    const k = levelKey(tier, i)
    const b = best[k]
    if (b !== undefined || assisted[k]) solved++
    if (b !== undefined && b <= l.par) stars++
  })
  return { solved, stars, total: LEVELS[tier].length }
}

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
  const mode = useWidgetField<PlayMode>(id, 'mode', 'solo', coerceMode)
  const online = mode === 'online'

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

  // ------------------------------------------------------------ solution replay
  // Plays the optimal line as a transient overlay on the real game: after a
  // win it replays from the level's start (nothing changes); mid-attempt
  // ("Show solution" — a give-up) it plays from where you are, then the
  // attempt restarts. The persisted move log is never touched by playback.
  const [solutionReplay, setSolutionReplay] = useState<SolutionReplay | null>(null)
  const [solutionConfirm, setSolutionConfirm] = useState(false)
  const replayPos = useMemo(
    () =>
      solutionReplay
        ? solutionReplay.moves.slice(0, solutionReplay.step).reduce<number[]>((p, m) => applyMove(p, m), solutionReplay.base)
        : null,
    [solutionReplay],
  )
  useEffect(() => {
    if (!solutionReplay) return
    const { step, moves: line, giveUp } = solutionReplay
    const done = step >= line.length
    const t = setTimeout(
      () => {
        if (!done) {
          setSolutionReplay({ ...solutionReplay, step: step + 1 })
          return
        }
        setSolutionReplay(null)
        if (giveUp) dispatch(updateWidgetData({ id, data: { moves: [], hints: 0 } }))
      },
      done ? REPLAY_HOLD_MS : step === 0 ? REPLAY_LEAD_MS : REPLAY_STEP_MS,
    )
    return () => clearTimeout(t)
  }, [solutionReplay, dispatch, id])
  const startReplay = (giveUp: boolean) => {
    const base = giveUp ? pos : lot.start
    const line = solve(lot, base)
    if (!line) return
    setSelected(null)
    setHintKey(null)
    setSolutionReplay({ base: base.slice(), moves: line, step: 0, giveUp })
  }
  const stopReplay = () => {
    if (solutionReplay?.giveUp) dispatch(updateWidgetData({ id, data: { moves: [], hints: 0 } }))
    setSolutionReplay(null)
  }
  const replaying = solutionReplay !== null
  // What the board SHOWS: the replay's position while one plays.
  const shownPos = replayPos ?? pos
  const shownWon = replaying ? false : won

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

  // ------------------------------------------------------------ 2 Devices race
  // Maze Runner's ghost race, for cars: both devices play the SAME level at
  // once, and the first red car out wins. Real-time, so it sits on
  // `useNetplay` directly (not the turn-based `useNetGame`) and speaks the
  // protocol's existing go / pos / done. All of it is transient — a race is
  // a live thing between two devices, never persisted.
  const [linkOpen, setLinkOpen] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [result, setResult] = useState<'won' | 'lost' | 'void' | null>(null)
  const [opp, setOpp] = useState<{ pos: number[]; moves: number; cell: number } | null>(null)
  const [peerAvatars, setPeerAvatars] = useState<SeatAvatars | null>(null)
  const raceStart = useRef(0)
  const doneSent = useRef(false)
  const lotRef = useRef(lot)
  lotRef.current = lot

  const seatAvatars = useSeatAvatars()
  const avatarsRef = useRef(seatAvatars)
  avatarsRef.current = seatAvatars

  const link = useNetplay((msg) => {
    if (msg.t === 'sync') {
      // The host's level wins, so both devices race the same lot (and a
      // packed opponent position means the same thing on both).
      const setup = msg.state as Record<string, unknown> | null
      if (!setup) return
      const t = coerceTier(setup.tier)
      const lv = setup.level
      if (!t || !Number.isInteger(lv)) return
      setPeerAvatars(coerceSeatAvatars(setup.avatars) ?? null)
      setHintKey(null)
      setSolutionReplay(null)
      dispatch(updateWidgetData({ id, data: { tier: t, level: lv, moves: [], hints: 0 } }))
      return
    }
    if (msg.t === 'go') {
      setResult(null)
      setCountdown(COUNT_FROM)
      return
    }
    if (msg.t === 'pos') {
      const n = lotRef.current.vehicles.length
      setOpp({ ...unpackRacePos(msg.cell, n), cell: msg.cell })
      return
    }
    if (msg.t === 'done') {
      // First done wins: with a synchronised start it is also the lower
      // time, so no arbitration, and ordering can't flip it.
      setResult((prev) => prev ?? 'lost')
    }
  })

  const linkDead = link.status === 'failed' || link.status === 'closed'
  const raceState = !online
    ? 'off'
    : result !== null
      ? result
      : countdown !== null
        ? 'counting'
        : started
          ? 'running'
          : 'idle'
  const mySeat: Seat = link.seat ?? 'toy'
  const oppSeat: Seat = mySeat === 'toy' ? 'ninja' : 'toy'
  // Costume rules as in every net game: a connected guest wears the host's
  // picks, transiently (`alive`, so a wifi blip doesn't flicker them).
  const avatarOverride = online && link.alive ? peerAvatars : null
  const effectiveAvatars = avatarOverride ?? seatAvatars
  const { Head: OppHead } = avatarVisualById[effectiveAvatars[oppSeat]]
  const oppName = avatarMetaById[effectiveAvatars[oppSeat]].name
  const oppColor = avatarMetaById[effectiveAvatars[oppSeat]].color

  /** GO on this device: a fresh attempt from the level start, both panels
   * reset, clock armed. */
  const startRun = useCallback(() => {
    setStarted(true)
    setResult(null)
    setHintKey(null)
    setSolutionReplay(null)
    setSelected(null)
    doneSent.current = false
    raceStart.current = performance.now()
    const l = lotRef.current
    setOpp({ pos: l.start.slice(), moves: 0, cell: packRacePos(l.start, 0) })
    dispatch(updateWidgetData({ id, data: { moves: [], hints: 0 } }))
  }, [dispatch, id])

  // Countdown ticks, then both runs start together.
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      startRun()
      return
    }
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), COUNT_MS)
    return () => clearTimeout(t)
  }, [countdown, startRun])

  // A real link death voids a live, unresolved race (their `done` could never
  // arrive). Sticky via `result` until the next GO.
  useEffect(() => {
    if (!online || !linkDead) return
    if (!started && countdown === null) return
    setResult((prev) => prev ?? 'void')
    setStarted(false)
    setCountdown(null)
    setOpp(null)
  }, [online, linkDead, started, countdown])

  // The host pushes the race setup on connect, and again whenever it picks a
  // different level (only possible while idle).
  useEffect(() => {
    if (!online || !link.connected || link.role !== 'host') return
    link.send({ t: 'sync', state: { tier, level: levelIdx, avatars: avatarsRef.current } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, link.connected, link.role, tier, levelIdx])

  // Leaving the mode drops the link and every trace of the race; entering
  // it opens the pairing dialog.
  useEffect(() => {
    if (!online) {
      link.disconnect()
      setLinkOpen(false)
      setCountdown(null)
      setStarted(false)
      setResult(null)
      setOpp(null)
      setPeerAvatars(null)
    } else if (link.status === 'idle') {
      setLinkOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Every position change during a race (move, Undo, Reset) is relayed —
  // last-write-wins, one small message per committed change.
  const racing = online && started && link.connected
  const packed = packRacePos(pos, applied)
  useEffect(() => {
    if (!racing) return
    link.send({ t: 'pos', seat: mySeat, cell: packed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racing, packed])

  // Out first? Tell the other side, once per race.
  useEffect(() => {
    if (!online || !started || !won || doneSent.current) return
    doneSent.current = true
    link.send({ t: 'done', seat: mySeat, ms: Math.round(performance.now() - raceStart.current) })
    setResult((prev) => prev ?? 'won')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, started, won])

  // Leaving mid-race (counting/running) forfeits it for both — ask first.
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const toggleMode = () => {
    if (!online) setGame({ mode: 'online' })
    else if (raceState === 'counting' || raceState === 'running') setLeaveConfirm(true)
    else setGame({ mode: 'solo' })
  }

  /** Either side may start; the sender counts down too. */
  const startRace = () => {
    link.send({ t: 'go' })
    setResult(null)
    setCountdown(COUNT_FROM)
  }
  /** The board is dead until GO, and once a race is void. A LOSER may still
   * finish their own run. */
  const raceLock = online && (raceState === 'idle' || raceState === 'counting' || raceState === 'void')
  // Level choice belongs to the host; nobody changes level mid-race.
  const levelLocked =
    online && link.connected && (link.role === 'guest' || raceState === 'counting' || raceState === 'running')

  // Refs mirror the latest render so the (memoized, 3D-facing) drag core
  // never closes over a stale position or move log.
  const live = useRef({ won, lot, pos, commit, replaying: false })
  live.current = { won, lot, pos, commit, replaying: solutionReplay !== null || raceLock }

  const beginDrag = useCallback((vi: number): boolean => {
    const { won: w, lot: l, pos: p, replaying: rp } = live.current
    if (w || rp || dragRef.current) return false
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
    if (won || replaying || raceLock || selected === null || isTypingTarget(e.target)) return
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
    setSolutionReplay(null)
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
    setSolutionReplay(null)
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
    <SeatAvatarsOverride.Provider value={avatarOverride}>
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
      data-replay={solutionReplay ? `${solutionReplay.step}/${solutionReplay.moves.length}` : ''}
      data-solved={solved}
      data-state={won ? 'won' : 'live'}
      data-view={view}
      data-yaw={yaw}
      data-mode={mode}
      data-net={online ? link.status : 'off'}
      data-seat={online ? mySeat : ''}
      data-race={raceState}
      data-opp-moves={online && opp ? opp.moves : -1}
      data-avatar-toy={effectiveAvatars.toy}
      data-avatar-ninja={effectiveAvatars.ninja}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 0.5, outline: 'none' }}
    >
      {/* One row on any card width: the selects shrink (a native select
          ellipsizes its label; the open list still shows the full text). */}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
        <NativeSelect
          value={tier}
          onChange={(e) => requestLevel({ tier: e.target.value as Tier, level: 0 })}
          disabled={levelLocked}
          data-testid="carpark-tier"
          inputProps={{ 'aria-label': 'Difficulty' }}
          sx={{ fontSize: 14, minWidth: 0, flexShrink: 1 }}
        >
          {TIERS.map((t) => {
            const p = tierProgress(t, best, assisted)
            return (
              <option key={t} value={t} data-solved={p.solved} data-stars={p.stars}>
                {`${TIER_LABEL[t]} ${p.solved}/${p.total}${p.stars ? ` ★${p.stars}` : ''}`}
              </option>
            )
          })}
        </NativeSelect>
        <NativeSelect
          value={levelIdx}
          onChange={(e) => requestLevel({ tier, level: parseInt(e.target.value, 10) })}
          disabled={levelLocked}
          data-testid="carpark-level"
          inputProps={{ 'aria-label': 'Level' }}
          sx={{ fontSize: 14, minWidth: 0, flexShrink: 1 }}
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
          sx={{ flexShrink: 0 }}
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
        <NetplayModeToggle
          online={online}
          onToggle={toggleMode}
          testId="carpark-mode-online"
          label="2 Devices race"
        />
      </Stack>

      {online && (
        <Stack
          direction="row"
          spacing={1}
          data-testid="carpark-race-bar"
          sx={{ alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}
        >
          {/* The chip gives way first (it ellipsizes); the button and the
              opponent panel never squash. */}
          <Box sx={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden', '& .MuiChip-root': { maxWidth: '100%' } }}>
            <NetplayChip link={link} testId="carpark-link" onOpen={() => setLinkOpen(true)} />
          </Box>
          {link.connected && raceState !== 'counting' && raceState !== 'running' && (
            <Button size="small" variant="contained" data-testid="carpark-start-race" onClick={startRace} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {raceState === 'idle' ? 'Start race' : 'Race again'}
            </Button>
          )}
          {opp && !linkDead && (
            <Stack
              direction="row"
              spacing={0.75}
              data-testid="carpark-opponent"
              data-opp-pos={opp.cell}
              sx={{ alignItems: 'center', flexShrink: 0, opacity: link.status === 'reconnecting' ? 0.4 : 1 }}
            >
              <Box sx={{ width: 26, height: 26, color: oppColor, flexShrink: 0 }}>
                <OppHead />
              </Box>
              {/* Their lot, with their move count as a corner badge. */}
              <Box sx={{ position: 'relative' }}>
                <MiniLot lot={lot} pos={opp.pos} />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    minWidth: 20,
                    px: 0.5,
                    borderRadius: 2,
                    bgcolor: oppColor,
                    color: 'common.white',
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: 'center',
                    lineHeight: '18px',
                  }}
                >
                  {opp.moves}
                </Box>
              </Box>
            </Stack>
          )}
        </Stack>
      )}

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
              const off = shownPos[vi] + (dragging ? drag.delta : 0)
              const out = shownWon && vi === 0 ? LOT + PAD + 0.5 : off
              const x = v.horiz ? out : v.lane
              const y = v.horiz ? v.lane : out
              const color = vehicleColor(v, vi)
              return (
                <g
                  key={v.id}
                  data-vehicle={v.id}
                  data-index={vi}
                  data-row={v.horiz ? v.lane : shownPos[vi]}
                  data-col={v.horiz ? shownPos[vi] : v.lane}
                  data-len={v.len}
                  data-horiz={v.horiz ? '1' : '0'}
                  data-target={vi === 0 ? '1' : undefined}
                  data-hinted={hintMove?.[0] === vi ? '1' : undefined}
                  onPointerDown={(e) => startSvgDrag(e, vi)}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                    transition: dragging
                      ? 'none'
                      : shownWon && vi === 0
                        ? 'transform 700ms ease-in'
                        : replaying
                          ? 'transform 380ms ease-in-out' // replay slides read slower
                          : 'transform 120ms ease-out',
                    cursor: won || replaying ? 'default' : v.horiz ? 'ew-resize' : 'ns-resize',
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
                pos={shownPos}
                drag={drag}
                won={shownWon}
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

        {raceState === 'counting' && (
          <Box
            data-testid="carpark-countdown"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(0,0,0,0.45)',
              borderRadius: 1,
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '22cqmin', fontWeight: 800, color: 'common.white' }}>
              {countdown === 0 ? 'GO' : countdown}
            </Typography>
          </Box>
        )}
        {raceState === 'void' && (
          <Box
            data-testid="carpark-race-void"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(0,0,0,0.45)',
              borderRadius: 1,
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '7cqmin', fontWeight: 700, color: 'common.white', textAlign: 'center', px: 2 }}>
              Connection lost — race void.
              <br />
              Re-pair to race again.
            </Typography>
          </Box>
        )}
        {/* Lost, but still playing: a banner, not an overlay — the loser can
            finish their own run. */}
        {raceState === 'lost' && !won && (
          <Stack
            direction="row"
            spacing={1}
            data-testid="carpark-race-lost"
            sx={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              alignItems: 'center',
              px: 1.25,
              py: 0.5,
              borderRadius: 2,
              bgcolor: 'rgba(0,0,0,0.65)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Box sx={{ width: 22, height: 22, color: oppColor }}>
              <OppHead />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'common.white' }}>
              {oppName} got out first
            </Typography>
          </Stack>
        )}
        {shownWon && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 1,
              pt: 1,
              overflow: 'hidden',
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
              {raceState === 'won' ? 'You got out first! ' : raceState === 'lost' ? `${oppName} was first. ` : ''}
              Out in {applied} moves!
              {hints > 0
                ? ` With ${hints} hint${hints === 1 ? '' : 's'}.`
                : applied <= level.par
                  ? ' Par ★'
                  : ` Par is ${level.par}.`}
            </Typography>
            {/* The figure takes what's left and is clipped, never the text. */}
            <Box sx={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
              <WinnerCelebration winner={online ? mySeat : 'toy'} />
            </Box>
          </Box>
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {solutionReplay
            ? `Solution ${solutionReplay.step}/${solutionReplay.moves.length}`
            : `Moves ${applied} · Par ${level.par}${myBest !== undefined ? ` · Best ${myBest}` : ''}`}
        </Typography>
        {solutionReplay ? (
          <Button size="small" variant="outlined" data-testid="carpark-replay-stop" onClick={stopReplay}>
            Stop
          </Button>
        ) : (
        <Stack direction="row" spacing={0.5}>
          {won && after && !(online && link.connected && link.role === 'guest') && (
            <Button variant="contained" size="small" data-testid="carpark-next" onClick={() => goTo(after)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              Next level
            </Button>
          )}
          {/* Won: Next level takes Undo's (disabled anyway) slot, so the
              footer fits a narrow card on one line. */}
          {/* Won: replay the optimal line from the start. Live: "Show
              solution" — a confirm-guarded give-up. */}
          {won ? (
            <IconButton size="small" aria-label="Replay solution" data-testid="carpark-replay" onClick={() => startReplay(false)}>
              <PlayCircleIcon fontSize="small" />
            </IconButton>
          ) : online ? null : (
            <>
              <IconButton size="small" aria-label="Hint" data-testid="carpark-hint" onClick={onHintClick}>
                <LightbulbIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="Show solution" data-testid="carpark-solution" onClick={() => setSolutionConfirm(true)}>
                <PlayCircleIcon fontSize="small" />
              </IconButton>
            </>
          )}
          {/* Icon buttons keep the footer on one line on a narrow card. */}
          {!won && (
            <IconButton size="small" aria-label="Undo" data-testid="carpark-undo" disabled={applied === 0} onClick={undo}>
              <UndoIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton
            size="small"
            aria-label="Reset"
            data-testid="carpark-reset"
            disabled={applied === 0}
            onClick={() => (inProgress ? setPending('reset') : reset())}
          >
            <RestartIcon fontSize="small" />
          </IconButton>
        </Stack>
        )}
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
      <ConfirmDialog
        open={solutionConfirm}
        title="Show the solution?"
        message="The fastest way out plays from where you are. This attempt ends, and you can try the level again afterwards."
        confirmLabel="Show me"
        cancelLabel="Keep trying"
        onConfirm={() => {
          setSolutionConfirm(false)
          startReplay(true)
        }}
        onCancel={() => setSolutionConfirm(false)}
      />
      <ConfirmDialog
        open={leaveConfirm}
        title="Leave the race?"
        message="The race ends for both devices."
        confirmLabel="Leave"
        cancelLabel="Keep racing"
        onConfirm={() => {
          setLeaveConfirm(false)
          setGame({ mode: 'solo' })
        }}
        onCancel={() => setLeaveConfirm(false)}
      />
      {linkOpen && (
        <Suspense fallback={null}>
          <NetplayDialog open onClose={() => setLinkOpen(false)} link={link} />
        </Suspense>
      )}
    </Box>
    </SeatAvatarsOverride.Provider>
  )
}
