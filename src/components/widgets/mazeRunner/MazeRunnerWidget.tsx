import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import type { Seat } from '../../../features/avatars/types'
import { avatarMetaById } from '../../../features/avatars/avatarCatalog'
import { useSeatAvatars, useSeatVisual } from '../../../features/avatars/useSeatAvatars'
import { useHandoff } from '../../../hooks/useHandoff'
import { useNow } from '../../../hooks/useNow'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import { fmtLap } from '../droneSim/lapTimer'
import ConfirmDialog from '../ConfirmDialog'
import PlayerBadge from '../PlayerBadge'
import TurnBanner from '../TurnBanner'
import WinnerCelebration from '../WinnerCelebration'
import {
  DEFAULT_MAZE_SEED,
  FOG_DEPTH,
  colOf,
  generateMaze,
  mazeDims,
  mirrorMaze,
  reachableWithin,
  rowOf,
  stepMove,
  wallSegments,
  type Dir,
  type MazeSize,
  type MoveRule,
  type Orientation,
} from './mazeModel'

/** Which breadcrumb / visibility aid is active. */
type Aid = 'trail' | 'none' | 'fog'
type Mode = 'solo' | 'duel'
interface Times {
  toy: number
  ninja: number
}

/** Stable module-constant fallbacks — an inline array would hand the selector a
 * fresh reference every render and loop the effects (lessons #10). */
const START_TRAIL: number[] = [0]
const NO_TIMES: Times = { toy: 0, ninja: 0 }

/** Persisted key holding the best time for each size. Three flat numbers
 * rather than one object: the trivial `typeof` coercer covers them, and there
 * is no nested shape to validate. */
const BEST_KEY: Record<MazeSize, 'bestSmall' | 'bestMedium' | 'bestLarge'> = {
  small: 'bestSmall',
  medium: 'bestMedium',
  large: 'bestLarge',
}

/** Wall thickness, in CELL units — so walls stay proportional as the maze gets
 * bigger. Deliberately not `vectorEffect="non-scaling-stroke"`: that reads the
 * width as screen pixels, which turns a cell-unit value into a hairline. */
const STROKE = 0.14
/** Padding round the viewBox so half a border stroke isn't clipped away. */
const PAD = STROKE / 2 + 0.02

/** Pointer travel that commits one move, in CSS pixels. */
const SWIPE_PX = 26
/** Minimum gap between AUTO-REPEAT key moves. Deliberately not applied to real
 * keypresses: throttling those would silently drop a fast player's moves — and
 * a test walking a solution with `keyboard.press()` would desync. */
const REPEAT_MS = 90

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'n',
  ArrowRight: 'e',
  ArrowDown: 's',
  ArrowLeft: 'w',
  KeyW: 'n',
  KeyD: 'e',
  KeyS: 's',
  KeyA: 'w',
}

/** One cell as a closed rect, for the trail and fog paths. */
const cellRect = (cols: number, cell: number): string =>
  `M${cell % cols} ${Math.floor(cell / cols)}h1v1h-1z`

/** A five-pointed star, used for the goal. */
function starPath(cx: number, cy: number, r: number): string {
  let d = ''
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? r : r * 0.45
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(angle) * radius).toFixed(3)} ${(
      cy +
      Math.sin(angle) * radius
    ).toFixed(3)}`
  }
  return `${d}z`
}

/**
 * The live clock, isolated so a ticking display re-renders itself and not the
 * board's few hundred wall segments.
 *
 * `useNow` is used purely as a **re-render pulse** — its `Date` is ignored,
 * because the accumulator is measured with `performance.now()` and the two
 * clocks cannot be mixed.
 */
function MazeTimer({ elapsedMs, since }: { elapsedMs: number; since: number | null }) {
  useNow(100)
  const live = since === null ? elapsedMs : elapsedMs + (performance.now() - since)
  return <>{fmtLap(live)}</>
}

export default function MazeRunnerWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const theme = useTheme()
  const hand = useHandoff()
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [pending, setPending] = useState<Partial<{
    size: MazeSize
    mode: Mode
    aid: Aid
    moveRule: MoveRule
  }> | null>(null)

  const seed = useWidgetField(id, 'seed', DEFAULT_MAZE_SEED)
  const cols = useWidgetField(id, 'cols', 0)
  const rows = useWidgetField(id, 'rows', 0)
  const size = useWidgetField<MazeSize>(id, 'size', 'medium', (v) =>
    v === 'small' || v === 'large' ? v : 'medium',
  )
  const moveRule = useWidgetField<MoveRule>(id, 'moveRule', 'cell', (v) =>
    v === 'junction' ? 'junction' : 'cell',
  )
  const aid = useWidgetField<Aid>(id, 'aid', 'trail', (v) =>
    v === 'none' || v === 'fog' ? v : 'trail',
  )
  const mode = useWidgetField<Mode>(id, 'mode', 'solo', (v) => (v === 'duel' ? 'duel' : 'solo'))
  const mirror = useWidgetField(id, 'mirror', true)
  const pos = useWidgetField(id, 'pos', 0)
  const trail = useWidgetField<number[]>(id, 'trail', START_TRAIL, (v) =>
    // Returned AS-IS: building a new array here would be a fresh reference
    // every render (lessons #10).
    Array.isArray(v) && v.every((c) => typeof c === 'number') ? (v as number[]) : undefined,
  )
  const elapsedMs = useWidgetField(id, 'elapsedMs', 0)
  const turn = useWidgetField<Seat>(id, 'turn', 'toy', (v) => (v === 'ninja' ? 'ninja' : 'toy'))
  const times = useWidgetField<Times>(id, 'times', NO_TIMES, (v) =>
    v && typeof v === 'object' &&
    typeof (v as Times).toy === 'number' &&
    typeof (v as Times).ninja === 'number'
      ? (v as Times)
      : undefined,
  )
  const bestMs = useWidgetField(id, BEST_KEY[size], 0)

  const setGame = useCallback(
    (next: Record<string, unknown>) => dispatch(updateWidgetData({ id, data: next })),
    [dispatch, id],
  )

  /** Wall-clock origin of the current pause, in `performance.now()` terms.
   * A ref, never persisted: `performance.now()` is relative to the document's
   * time origin, so a stored value would be meaningless after a reload. The
   * effect is that a reload pauses the clock — see docs/maze-runner.md. */
  const lastMoveAt = useRef<number | null>(null)
  const lastRepeatAt = useRef(0)

  // Player 1 runs the maze; by default player 2 runs its mirror image, so
  // watching P1 solve it is no help (see `mirrorMaze`). Turning the mirror off
  // hands P2 the identical maze — simpler to explain, easier to memorise.
  const p1Maze = useMemo(
    () => (cols > 0 && rows > 0 ? generateMaze(seed, cols, rows) : null),
    [seed, cols, rows],
  )
  const p2Maze = useMemo(
    () => (p1Maze ? (mirror ? mirrorMaze(p1Maze) : p1Maze) : null),
    [p1Maze, mirror],
  )
  const maze = mode === 'duel' && turn === 'ninja' ? p2Maze : p1Maze

  // Dimensions come from the BOARD's own shape, not the window's: a tall card
  // in a landscape window still wants a tall maze. Chosen once, when the maze
  // is made, and then persisted — so rotating the device re-fits the board
  // without destroying a run in progress.
  const pickDims = useCallback(
    (forSize: MazeSize) => {
      const rect = boardRef.current?.getBoundingClientRect()
      const orientation: Orientation =
        rect && rect.width >= rect.height ? 'landscape' : 'portrait'
      return mazeDims(forSize, orientation)
    },
    [],
  )

  // First render has no dimensions (the reducer cannot know the board's shape),
  // so they are filled in here — the deal-in-an-effect pattern (lessons #11).
  useEffect(() => {
    if (cols > 0 && rows > 0) return
    const dims = pickDims(size)
    setGame({ cols: dims.cols, rows: dims.rows })
  }, [cols, rows, size, pickDims, setGame])

  const won = maze !== null && pos === maze.goal
  const duelOver = mode === 'duel' && times.toy > 0 && times.ninja > 0
  const running = !won && (elapsedMs > 0 || trail.length > 1)
  const state = won ? 'won' : running ? 'running' : 'ready'
  const runner: Seat = mode === 'duel' ? turn : 'toy'
  const seatAvatars = useSeatAvatars()
  const colorOf = (seat: Seat) => avatarMetaById[seatAvatars[seat]].color
  const duelWinner: Seat | null = !duelOver
    ? null
    : times.toy < times.ninja
      ? 'toy'
      : times.ninja < times.toy
        ? 'ninja'
        : null

  /** No input while a dialog or the hand-off banner is up, or the run is over.
   * The banner blocks taps by covering the board, but a window key listener
   * would sail straight past it. */
  const blocked = maze === null || won || duelOver || pending !== null || hand.player !== null

  const reset = useCallback(
    (extra: Record<string, unknown> = {}) => {
      hand.clear()
      lastMoveAt.current = null
      const start = (extra.mode ?? mode) === 'duel' ? 0 : 0
      setGame({
        pos: start,
        trail: [start],
        elapsedMs: 0,
        turn: 'toy',
        times: { toy: 0, ninja: 0 },
        ...extra,
      })
    },
    [hand, mode, setGame],
  )

  const newMaze = useCallback(() => {
    const dims = pickDims(size)
    reset({
      // Unsigned, so the value round-trips through the DOM contract and
      // reproduces the same maze node-side in the tests.
      seed: (Math.random() * 0xffffffff) >>> 0,
      cols: dims.cols,
      rows: dims.rows,
    })
  }, [pickDims, reset, size])

  const inProgress = running || won || times.toy > 0
  const requestChange = (extra: Record<string, unknown>) => {
    if (inProgress) setPending(extra)
    else reset(extra)
  }

  const applyMove = useCallback(
    (dir: Dir) => {
      if (blocked || !maze) return
      const path = stepMove(maze, pos, dir, moveRule)
      if (path.length === 0) return
      const next = path[path.length - 1]

      const now = performance.now()
      // The first move starts the clock rather than accumulating, so neither
      // the time before anyone touched the board nor the hand-off banner can
      // leak into a run.
      const gained = lastMoveAt.current === null ? 0 : now - lastMoveAt.current
      lastMoveAt.current = now
      const nextElapsed = elapsedMs + gained

      const seen = new Set(trail)
      const nextTrail = trail.slice()
      for (const cell of path) {
        if (!seen.has(cell)) {
          seen.add(cell)
          nextTrail.push(cell)
        }
      }

      if (next !== maze.goal) {
        setGame({ pos: next, trail: nextTrail, elapsedMs: nextElapsed })
        return
      }

      // Reached the goal.
      lastMoveAt.current = null
      const finished = Math.round(nextElapsed)
      if (mode === 'solo') {
        const isBest = bestMs === 0 || finished < bestMs
        setGame({
          pos: next,
          trail: nextTrail,
          elapsedMs: nextElapsed,
          ...(isBest ? { [BEST_KEY[size]]: finished } : {}),
        })
        return
      }
      if (turn === 'toy') {
        // Hand over: player 2 starts from their own maze's corner — the
        // opposite one when mirrored, the same one when not.
        setGame({
          times: { ...times, toy: finished },
          turn: 'ninja',
          pos: p2Maze?.start ?? 0,
          trail: [p2Maze?.start ?? 0],
          elapsedMs: 0,
        })
        hand.announce('ninja')
        return
      }
      const nextTimes = { ...times, ninja: finished }
      const winnerTime = Math.min(nextTimes.toy, nextTimes.ninja)
      const isBest = bestMs === 0 || winnerTime < bestMs
      setGame({
        pos: next,
        trail: nextTrail,
        elapsedMs: nextElapsed,
        times: nextTimes,
        ...(isBest ? { [BEST_KEY[size]]: winnerTime } : {}),
      })
    },
    [
      blocked, maze, pos, moveRule, elapsedMs, trail, mode, turn, times,
      bestMs, size, p2Maze, hand, setGame,
    ],
  )

  // Held in a ref so the window listener is installed once and never captures
  // a stale board.
  const moveRef = useRef(applyMove)
  moveRef.current = applyMove

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const dir = KEY_DIRS[e.code]
      if (!dir) return
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault() // arrows would scroll the dashboard
      if (e.repeat) {
        const now = performance.now()
        if (now - lastRepeatAt.current < REPEAT_MS) return
        lastRepeatAt.current = now
      }
      moveRef.current(dir)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Swipe. The origin RE-ARMS on every committed move, so one continuous drag
   * keeps moving the runner — one move per gesture would mean ~60 separate
   * swipes to cross a large board. A dropped pointer capture is self-healing
   * (the next `pointerdown` simply takes over), so unlike the flight sticks
   * this needs no capture watchdog. */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture refused — the gesture still works via bubbling */
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const from = drag.current
    if (!from || from.id !== e.pointerId) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    applyMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n')
  }
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  const wallPath = useMemo(
    () =>
      maze
        ? wallSegments(maze)
            .map((s) => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`)
            .join('')
        : '',
    [maze],
  )
  const trailPath = useMemo(
    () => (aid === 'trail' && cols > 0 ? trail.map((c) => cellRect(cols, c)).join('') : ''),
    [aid, trail, cols],
  )
  // Fog is drawn as ONE overlay with an even-odd hole per visible cell, rather
  // than by filtering the walls — that keeps the wall path's memo intact
  // instead of rebuilding a few hundred segments on every move.
  const fogPath = useMemo(() => {
    if (aid !== 'fog' || !maze) return ''
    const visible = reachableWithin(maze, pos, FOG_DEPTH[size])
    visible.add(maze.goal) // never hide what you are aiming for
    const w = maze.cols + PAD * 2
    const h = maze.rows + PAD * 2
    let d = `M${-PAD} ${-PAD}h${w}v${h}h${-w}z`
    for (const cell of visible) d += cellRect(maze.cols, cell)
    return d
  }, [aid, maze, pos, size])

  const { Head } = useSeatVisual(runner)
  const runnerColor = colorOf(runner)
  const wallColor = theme.palette.text.primary
  const toggleSx = { textTransform: 'none', py: 0.1, px: 0.75 } as const

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="maze-root"
      data-widget-id={id}
      data-mode={mode}
      data-size={size}
      data-rule={moveRule}
      data-aid={aid}
      data-mirror={mirror ? 'on' : 'off'}
      data-seed={seed}
      data-cols={cols}
      data-rows={rows}
      data-pos={pos}
      data-goal={maze?.goal ?? -1}
      data-state={state}
      data-turn={runner}
      data-trail={trail.length}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        p: 0.5,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v: Mode | null) => v && v !== mode && requestChange({ mode: v })}
        >
          <ToggleButton value="solo" data-testid="maze-mode-solo" sx={toggleSx}>
            Solo
          </ToggleButton>
          <ToggleButton value="duel" data-testid="maze-mode-duel" sx={toggleSx}>
            2 Players
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={size}
          onChange={(_, v: MazeSize | null) => {
            if (!v || v === size) return
            const dims = pickDims(v)
            requestChange({ size: v, cols: dims.cols, rows: dims.rows })
          }}
        >
          {(['small', 'medium', 'large'] as const).map((s) => (
            <ToggleButton key={s} value={s} data-testid={`maze-size-${s}`} sx={toggleSx}>
              {s[0].toUpperCase()}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={moveRule}
          onChange={(_, v: MoveRule | null) => {
            if (!v || v === moveRule) return
            // Changing how far a swipe carries mid-duel would make the two runs
            // incomparable, so in a duel it restarts like any other setting.
            if (mode === 'duel') requestChange({ moveRule: v })
            else setGame({ moveRule: v })
          }}
        >
          <ToggleButton value="junction" data-testid="maze-rule-junction" sx={toggleSx}>
            Run
          </ToggleButton>
          <ToggleButton value="cell" data-testid="maze-rule-cell" sx={toggleSx}>
            Step
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={aid}
          onChange={(_, v: Aid | null) => {
            if (!v || v === aid) return
            // Same reasoning: peeling the fog off mid-duel is a cheat.
            if (mode === 'duel') requestChange({ aid: v })
            else setGame({ aid: v })
          }}
        >
          <ToggleButton value="trail" data-testid="maze-aid-trail" sx={toggleSx}>
            Trail
          </ToggleButton>
          <ToggleButton value="none" data-testid="maze-aid-none" sx={toggleSx}>
            Plain
          </ToggleButton>
          <ToggleButton value="fog" data-testid="maze-aid-fog" sx={toggleSx}>
            Fog
          </ToggleButton>
        </ToggleButtonGroup>
        {/* Meaningless in solo, so it only appears once there are two players
            — the row already carries four groups. */}
        {mode === 'duel' && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mirror ? 'mirror' : 'same'}
            onChange={(_, v: string | null) => {
              if (!v || (v === 'mirror') === mirror) return
              // Swapping the maze under a half-finished duel would make the two
              // runs incomparable, so it restarts like every other setting.
              requestChange({ mirror: v === 'mirror' })
            }}
          >
            <ToggleButton value="mirror" data-testid="maze-mirror-on" sx={toggleSx}>
              Mirror
            </ToggleButton>
            <ToggleButton value="same" data-testid="maze-mirror-off" sx={toggleSx}>
              Same
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      <Box
        ref={boardRef}
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          containerType: 'size',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {maze && (
          <svg
            data-testid="maze-board"
            viewBox={`${-PAD} ${-PAD} ${maze.cols + PAD * 2} ${maze.rows + PAD * 2}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '100%',
              touchAction: 'none',
              cursor: blocked ? 'default' : 'grab',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {/* Breadcrumbs sit under the walls so corridors stay legible. */}
            {trailPath && <path d={trailPath} fill={alpha(runnerColor, 0.18)} />}
            <path
              d={wallPath}
              fill="none"
              stroke={wallColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {fogPath && (
              <path d={fogPath} fillRule="evenodd" fill={theme.palette.background.paper} />
            )}
            {/* Drawn after the fog: the board must always have a visible extent. */}
            <rect
              x={0}
              y={0}
              width={maze.cols}
              height={maze.rows}
              fill="none"
              stroke={wallColor}
              strokeWidth={STROKE}
              strokeLinejoin="round"
            />
            <path
              d={starPath(colOf(maze, maze.goal) + 0.5, rowOf(maze, maze.goal) + 0.5, 0.38)}
              fill={theme.palette.warning.main}
              data-testid="maze-goal"
            />
            {/* A 40-unit box scaled down, rather than a 0.8-unit one: the head's
                layout box is measured in CSS pixels BEFORE the viewBox
                transform, and a sub-pixel box rounds badly. */}
            <g
              transform={`translate(${colOf(maze, pos) + 0.1} ${rowOf(maze, pos) + 0.1}) scale(${0.8 / 40})`}
            >
              <foreignObject width={40} height={40}>
                <div style={{ width: '100%', height: '100%', color: runnerColor }}>
                  <Head />
                </div>
              </foreignObject>
            </g>
          </svg>
        )}

        {(won || duelOver) && (
          <Box
            data-testid="maze-celebration"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.38)',
              pointerEvents: 'none',
            }}
          >
            <WinnerCelebration winner={duelOver ? (duelWinner ?? 'toy') : runner} />
          </Box>
        )}

        {hand.player && <TurnBanner player={hand.player} onSkip={hand.clear} />}
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}
      >
        {duelOver ? (
          duelWinner ? (
            <PlayerBadge mark={duelWinner} label={`wins — ${fmtLap(times[duelWinner])}`} />
          ) : (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Dead heat!
            </Typography>
          )
        ) : (
          <PlayerBadge
            mark={runner}
            label={won ? 'made it!' : mode === 'duel' ? 'is running' : 'to move'}
            pulse={running}
          />
        )}
        <Typography
          variant="caption"
          data-testid="maze-timer"
          data-ms={Math.round(elapsedMs)}
          data-best-ms={bestMs}
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {running ? <MazeTimer elapsedMs={elapsedMs} since={lastMoveAt.current} /> : fmtLap(elapsedMs)}
          {bestMs > 0 && ` · best ${fmtLap(bestMs)}`}
        </Typography>
        <Button size="small" onClick={newMaze} sx={{ whiteSpace: 'nowrap' }}>
          New maze
        </Button>
      </Stack>

      <ConfirmDialog
        open={pending !== null}
        title="Start over?"
        message="Changing this starts a fresh run and clears the current time."
        onConfirm={() => {
          if (pending) reset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
