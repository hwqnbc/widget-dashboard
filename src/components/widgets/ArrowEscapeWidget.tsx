import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { Seat, SeatAvatars } from '../../features/avatars/types'
import {
  SeatAvatarsOverride,
  coerceSeatAvatars,
  useSeatAvatars,
} from '../../features/avatars/useSeatAvatars'
import { useNetplay } from '../../features/netplay/useNetplay'
import NetplayChip from '../netplay/NetplayChip'
import WinnerCelebration from './WinnerCelebration'
import PlayerBadge from './PlayerBadge'
import ConfirmDialog from './ConfirmDialog'
import { lazyWithReload } from '../../utils/lazyWithReload'
import {
  ARROW_DIMS,
  DEFAULT_ARROWS_SEED,
  MASTER_BUMPS,
  blockerOf,
  generatePacked,
  generatePuzzle,
  headDir,
  trackOf,
  type Arrow,
  type ArrowsSize,
  type Cell,
} from './arrowsModel'

/** The pairing UI pulls in a QR encoder and decoder — kept out of the main
 * bundle, since most sessions never open it. */
const NetplayDialog = lazyWithReload(
  () => import('../netplay/NetplayDialog'),
  'netplay-dialog',
)

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

/** Race countdown: three ticks, then GO (as Maze Runner and Car Park). */
const COUNT_FROM = 3

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
    v === 'small' || v === 'large' || v === 'expert' || v === 'master' ? v : 'medium',
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
  const mode = useWidgetField<'solo' | 'online'>(id, 'mode', 'solo', (v) =>
    v === 'online' ? v : 'solo',
  )
  const online = mode === 'online'

  const dims = ARROW_DIMS[size]
  const puzzle = useMemo(
    () =>
      dims.packed
        ? generatePacked(seed, dims.cols, dims.rows, dims.minLen, dims.maxLen)
        : generatePuzzle(
            seed,
            dims.cols,
            dims.rows,
            dims.count,
            dims.minLen,
            dims.maxLen,
            dims.pick,
            dims.phase,
          ),
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
  // Master plays under a bump budget: mistakes end the puzzle, so every tap
  // has to be PLANNED — the tier where lookahead is required, not just
  // rewarded. Derived, never stored (bumps already persists). A RACE runs
  // without the budget — bumps already cost time, and speed is the game.
  const failed = !online && size === 'master' && !won && bumps >= MASTER_BUMPS
  const bumpsLeft = Math.max(0, MASTER_BUMPS - bumps)

  const setGame = useCallback(
    (next: Record<string, unknown>) => dispatch(updateWidgetData({ id, data: next })),
    [dispatch, id],
  )

  // ------------------------------------------------------- 2 Devices race
  // The clear race: same puzzle on two tablets, first to empty the board
  // wins. Non-turn-based, so it sits on `useNetplay` DIRECTLY (like the maze
  // ghost race and the Car Park race — the third such consumer) and reuses
  // the existing `sync`/`go`/`pos`/`done` messages: `pos.cell` carries
  // "arrows left", so no protocol version bump. All race state is transient —
  // persisting "counting" would be a lie the moment a tablet reloads.
  const [linkOpen, setLinkOpen] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [started, setStarted] = useState(false)
  const [result, setResult] = useState<'won' | 'lost' | 'void' | null>(null)
  const [oppLeft, setOppLeft] = useState<number | null>(null)
  const [peerAvatars, setPeerAvatars] = useState<SeatAvatars | null>(null)
  const raceStart = useRef(0)
  const seatAvatars = useSeatAvatars()
  const avatarsRef = useRef(seatAvatars)
  avatarsRef.current = seatAvatars

  const link = useNetplay((msg) => {
    if (msg.t === 'sync') {
      // The host's puzzle wins — seed and size land here, and the host's
      // avatar picks ride along as the usual transient costume.
      const s = msg.state as Record<string, unknown> | null
      if (!s) return
      if ('avatars' in s) setPeerAvatars(coerceSeatAvatars(s.avatars) ?? null)
      if (typeof s.seed === 'number' && typeof s.size === 'string' && s.size in ARROW_DIMS) {
        setGame({ seed: s.seed, size: s.size, removed: [], taps: 0, bumps: 0 })
      }
      return
    }
    if (msg.t === 'go') {
      setResult(null)
      setCountdown(COUNT_FROM)
      return
    }
    if (msg.t === 'pos') {
      setOppLeft(msg.cell)
      return
    }
    if (msg.t === 'done') {
      // First to finish wins; with a synchronised start that is also the
      // lower time, so ordering cannot flip it (first write wins).
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
  // Costume gates on `alive`, not strict `connected`, so a wifi blip doesn't
  // flicker the characters (docs/netplay.md).
  const avatarOverride = online && link.alive ? peerAvatars : null

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
          // Racing: report progress; the final exit is the finish line.
          const race = raceRef.current
          if (race.racing) {
            race.send({ t: 'pos', seat: race.seat, cell: total - next.length })
            if (next.length === total) {
              race.send({
                t: 'done',
                seat: race.seat,
                ms: Math.round(now - raceStart.current),
              })
              setResult((prev) => prev ?? 'won')
            }
          }
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

  // Begin this device's run, called at GO on both sides. The clock starts at
  // GO — with a synchronised start, staring time has to count or the two
  // elapsed times aren't comparable.
  const startRun = useCallback(() => {
    anims.current.clear()
    setAnimCount(0)
    setFlash(null)
    setStarted(true)
    setResult(null)
    setOppLeft(stateRef.current.total)
    raceStart.current = performance.now()
    setGame({ removed: [], taps: 0, bumps: 0 })
  }, [setGame])

  // Tick the countdown down, then start both runs.
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      startRun()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 700)
    return () => clearTimeout(t)
  }, [countdown, startRun])

  // A real death voids a live, unresolved race — their `done` can never
  // arrive. Sticky via `result` (cleared by the next `go`), never derived
  // from the flags this same effect clears (lesson #119). A `reconnecting`
  // blip changes nothing: the reliable channel buffers through it.
  useEffect(() => {
    if (!online || !linkDead) return
    if (!started && countdown === null) return
    setResult((prev) => prev ?? 'void')
    setStarted(false)
    setCountdown(null)
    setOppLeft(null)
  }, [online, linkDead, started, countdown])

  // On connect (and on any host reshuffle or size change) the host pushes
  // its puzzle, so both tablets race the same board.
  useEffect(() => {
    if (!online || !link.connected || link.role !== 'host') return
    link.send({ t: 'sync', state: { seed, size, avatars: avatarsRef.current } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, link.connected, link.role, seed, size])

  // Leaving the mode drops the link rather than leaving it half-alive;
  // entering it with no link opens the pairing dialog.
  useEffect(() => {
    if (!online) {
      link.disconnect()
      setLinkOpen(false)
      setPeerAvatars(null)
      setStarted(false)
      setCountdown(null)
      setResult(null)
      setOppLeft(null)
    } else if (link.status === 'idle') {
      setLinkOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // The rAF completion handler reports race progress; refs, because it runs
  // outside the render (the same stateRef pattern the counters use).
  const raceRef = useRef({ racing: false, seat: mySeat, send: link.send })
  raceRef.current = { racing: online && started, seat: mySeat, send: link.send }

  const tapArrow = (a: Arrow) => {
    // In a race the board is dead until GO, and once the race is void —
    // deliberately NOT on `lost`: the trailing player may finish their board.
    const raceLock =
      online && (raceState === 'idle' || raceState === 'counting' || raceState === 'void')
    if (won || failed || raceLock || anims.current.has(a.id)) return
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
  const [pending, setPending] = useState<
    { size?: ArrowsSize; mode?: 'solo' | 'online'; reshuffle?: true } | null
  >(null)
  const inProgress = removed.length > 0 && !won && !failed

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
  /** Mode change keeps the current puzzle; leaving mid-race asks first. */
  const changeMode = (next: 'solo' | 'online' | null) => {
    if (!next || next === mode) return
    if (online && (raceState === 'counting' || raceState === 'running')) {
      setPending({ mode: next })
    } else {
      setGame({ mode: next })
    }
  }
  /** Either side may start; both count down from their own `go` receipt. */
  const startRace = () => {
    link.send({ t: 'go' })
    setResult(null)
    setCountdown(COUNT_FROM)
  }
  /** Master's second chance: the SAME puzzle again, counters wiped. */
  const retrySame = () => {
    anims.current.clear()
    setAnimCount(0)
    setFlash(null)
    setGame({ removed: [], taps: 0, bumps: 0 })
  }

  const clip = `arrows-clip-${id}`
  // In online mode only the HOST drives the puzzle (its sync would stomp a
  // guest's reshuffle anyway); the guest's controls hide while linked.
  const hostControls = !online || link.role !== 'guest'
  const raceLive = raceState === 'counting' || raceState === 'running'

  return (
    <SeatAvatarsOverride.Provider value={avatarOverride}>
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
      data-mode={mode}
      data-net={online ? link.status : 'off'}
      data-seat={online ? (link.seat ?? '') : ''}
      data-race={raceState}
      data-opp-left={oppLeft ?? ''}
      data-state={won ? 'won' : failed ? 'failed' : 'live'}
      data-bumps-left={size === 'master' && !online ? bumpsLeft : ''}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 0.5 }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v) => changeMode(v as 'solo' | 'online' | null)}
        sx={{ alignSelf: 'center' }}
      >
        <ToggleButton value="solo" data-testid="arrows-mode-solo" sx={{ textTransform: 'none', py: 0.25 }}>
          Solo
        </ToggleButton>
        <ToggleButton
          value="online"
          data-testid="arrows-mode-online"
          sx={{ textTransform: 'none', py: 0.25 }}
        >
          2 Devices
        </ToggleButton>
      </ToggleButtonGroup>

      {hostControls && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={size}
          onChange={(_, v) => changeSize(v as ArrowsSize | null)}
          sx={{ alignSelf: 'center' }}
        >
          {(['small', 'medium', 'large', 'expert', 'master'] as const).map((s) => (
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
      )}

      {online && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <NetplayChip link={link} testId="arrows-link" onOpen={() => setLinkOpen(true)} />
          {link.connected && !raceLive && (
            <Button
              size="small"
              variant="contained"
              data-testid="arrows-start-race"
              onClick={startRace}
              sx={{ textTransform: 'none', py: 0.1 }}
            >
              {raceState === 'idle' ? 'Start race' : 'Race again'}
            </Button>
          )}
          {link.connected && oppLeft !== null && (
            <Box sx={{ opacity: link.status === 'reconnecting' ? 0.4 : 1 }}>
              <PlayerBadge mark={oppSeat} label={`${oppLeft} left`} />
            </Box>
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
            <WinnerCelebration winner={online ? mySeat : 'toy'} />
            <Typography sx={{ fontWeight: 700, color: 'common.white' }}>
              {raceState === 'won'
                ? 'You win the race!'
                : raceState === 'lost'
                  ? 'Cleared it — but the race was lost.'
                  : `Board cleared!${bumps === 0 ? ' Not a single bump ★' : ''}`}
            </Typography>
          </Box>
        )}

        {raceState === 'counting' && (
          <Box
            data-testid="arrows-countdown"
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
            data-testid="arrows-race-void"
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
            <Typography
              sx={{ fontSize: '7cqmin', fontWeight: 700, color: 'common.white', textAlign: 'center', px: 2 }}
            >
              Connection lost — race void.
              <br />
              Re-pair to race again.
            </Typography>
          </Box>
        )}

        {failed && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
            data-testid="arrows-failed"
          >
            <Typography sx={{ fontWeight: 700, color: 'common.white' }}>
              Out of bumps — the tangle wins!
            </Typography>
            <Typography variant="caption" sx={{ color: 'common.white' }}>
              Retry runs the same puzzle again.
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
          {raceState === 'lost' && !won
            ? `Race lost — ${alive.length} to go, clear it anyway!`
            : won
              ? `Solved ×${solved}`
              : failed
                ? 'Out of bumps'
                : size === 'master' && !online
                  ? `${alive.length} to go · ${bumpsLeft} bump${bumpsLeft === 1 ? '' : 's'} left`
                  : `${alive.length} to go · ${bumps} bump${bumps === 1 ? '' : 's'}`}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {failed && (
            <Button size="small" data-testid="arrows-retry" onClick={retrySame}>
              Retry
            </Button>
          )}
          {hostControls && !raceLive && (
            <Button size="small" data-testid="arrows-new" onClick={() => requestFresh()}>
              New puzzle
            </Button>
          )}
        </Stack>
      </Stack>

      {online && linkOpen && (
        <Suspense fallback={null}>
          <NetplayDialog open onClose={() => setLinkOpen(false)} link={link} />
        </Suspense>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.mode ? 'Leave the race?' : 'Start over?'}
        message={
          pending?.mode
            ? 'Switching modes ends the race for both devices.'
            : 'A new puzzle clears the arrows you have already freed.'
        }
        confirmLabel={pending?.mode ? 'Leave' : 'Restart'}
        onConfirm={() => {
          if (pending?.mode) setGame({ mode: pending.mode })
          else if (pending) freshPuzzle(pending.size ? { size: pending.size } : {})
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
    </SeatAvatarsOverride.Provider>
  )
}
