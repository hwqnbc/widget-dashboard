import { Suspense, useEffect, useRef, useState } from 'react'
import {
  alpha,
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import type { Theme } from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import PlayerBadge from './PlayerBadge'
import TurnBanner from './TurnBanner'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import {
  SeatAvatarsOverride,
  useSeatAvatars,
  useSeatVisual,
} from '../../features/avatars/useSeatAvatars'
import { useNetGame } from '../../features/netplay/useNetGame'
import NetplayChip from '../netplay/NetplayChip'
import { lazyWithReload } from '../../utils/lazyWithReload'

/** The pairing UI pulls in a QR encoder and decoder — kept out of the main
 * bundle, since most sessions never open it. */
const NetplayDialog = lazyWithReload(
  () => import('../netplay/NetplayDialog'),
  'netplay-dialog',
)
import { useHandoff } from '../../hooks/useHandoff'
import { usePresentation } from '../fullscreen/presentation'
import { useViewport } from '../../hooks/useViewport'
import {
  FIG_H,
  G,
  GROUND,
  H,
  K,
  OBS_HH,
  OBS_HW,
  OBS_PERIOD,
  PERIOD_P,
  VMAX,
  WIN,
  WIND_MAX,
  archerX,
  blockCyAt as blockCyAtPhase,
  dealHeightsFrom,
  facing,
  flightAt,
  launchOriginAt as launchOriginAtW,
  packShot,
  phaseOf,
  platYAt,
  resolveShot,
  unpackShot,
  windAt,
  worldW,
} from './archeryModel'

type Player = 'toy' | 'ninja'
type Scores = { toy: number; ninja: number }
type Mode = 'calm' | 'wind' | 'obstacle'
type Distance = 'short' | 'long'
type Platform = 'still' | 'both' | 'target'
/** Local pass-and-play, or two devices on one wifi. A new axis, not a fourth
 * `Mode` — weather and transport are orthogonal. */
type Play = 'local' | 'online'

/**
 * Everything two devices must agree on, as one object: `useNetGame`'s
 * "board". The settings ride along because they change the physics (W from
 * distance, the obstacle from mode) — the host's win, like every game so far.
 */
interface NetState {
  p1y: number
  p2y: number
  scores: Scores
  turn: Player
  shots: number
  gameSeed: number
  mode: Mode
  distance: Distance
  platforms: Platform
}

const isScores = (v: unknown): v is Scores =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as Scores).toy === 'number' &&
  typeof (v as Scores).ninja === 'number'

/** A peer's sync is outside this component's control — every field checked. */
const coerceNetState = (v: unknown): NetState | undefined => {
  if (!v || typeof v !== 'object') return undefined
  const m = v as Record<string, unknown>
  return typeof m.p1y === 'number' &&
    typeof m.p2y === 'number' &&
    isScores(m.scores) &&
    (m.turn === 'toy' || m.turn === 'ninja') &&
    typeof m.shots === 'number' &&
    typeof m.gameSeed === 'number' &&
    (m.mode === 'calm' || m.mode === 'wind' || m.mode === 'obstacle') &&
    (m.distance === 'short' || m.distance === 'long') &&
    (m.platforms === 'still' || m.platforms === 'both' || m.platforms === 'target')
    ? (m as unknown as NetState)
    : undefined
}

// World geometry and physics live in `archeryModel.ts` (pure, e2e-bundled);
// what stays here is presentation and the wall-clock↔phase bridges.
const ZERO: Scores = { toy: 0, ninja: 0 }
const other = (p: Player): Player => (p === 'toy' ? 'ninja' : 'toy')
const WIND_MIN = 70
const randomWind = () =>
  Math.round((WIND_MIN + Math.random() * (WIND_MAX - WIND_MIN)) * (Math.random() < 0.5 ? -1 : 1))
/** Animation-clock timestamp → the model's phase (radians). */
const obsPhaseAt = (ts: number) => (ts / OBS_PERIOD) * Math.PI * 2
const platPhaseAt = (p: Player, ts: number) => (ts / PERIOD_P) * Math.PI * 2 + phaseOf(p)
const blockCyAt = (ts: number) => blockCyAtPhase(obsPhaseAt(ts))

/** A stick-figure archer with the character's head, standing on a pillar. */
function Archer({ player, x, py, hit }: { player: Player; x: number; py: number; hit: boolean }) {
  const f = facing(player)
  const hip = py - 16
  const shoulder = py - 42
  const stroke = '#2b3440'
  const { Head } = useSeatVisual(player)
  return (
    <g data-testid={`archer-${player}`} data-py={Math.round(py)}>
      <rect x={x - 16} y={py} width={32} height={GROUND - py} fill="#8d6e52" stroke="#6b503b" strokeWidth={1.5} />
      <rect x={x - 16} y={py} width={32} height={5} fill="#6b503b" />
      <path d={`M${x} ${hip} L${x - 7} ${py} M${x} ${hip} L${x + 7} ${py}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d={`M${x} ${hip} L${x} ${shoulder}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${x} ${shoulder + 4} L${x + f * 14} ${shoulder + 8}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${x + f * 14} ${shoulder - 8} Q${x + f * 24} ${shoulder + 8} ${x + f * 14} ${shoulder + 24}`} stroke="#7a4a22" strokeWidth={2.5} fill="none" />
      <path d={`M${x + f * 14} ${shoulder - 8} L${x + f * 14} ${shoulder + 24}`} stroke="#cbb58a" strokeWidth={1} />
      <foreignObject x={x - 14} y={shoulder - 30} width={28} height={28}>
        <div style={{ width: '100%', height: '100%' }}>
          <Head />
        </div>
      </foreignObject>
      {hit && <circle cx={x} cy={py - FIG_H / 2} r={26} fill="#e53935" opacity={0.4} />}
    </g>
  )
}

/** Top-centre wind gauge: an arrow pointing downwind, length ∝ strength. */
function WindIndicator({ wind, cx }: { wind: number; cx: number }) {
  const dir = wind >= 0 ? 1 : -1
  const mag = Math.min(Math.abs(wind), WIND_MAX)
  const len = 14 + (mag / WIND_MAX) * 42
  const tip = cx + dir * len
  return (
    <g opacity={0.85}>
      <text x={cx} y={11} textAnchor="middle" fontSize={9} fill="#5a6b7a" fontFamily="system-ui, sans-serif">
        WIND
      </text>
      <g stroke="#5a6b7a" strokeWidth={2.5} strokeLinecap="round" fill="none">
        <line x1={cx - dir * len} y1={20} x2={tip} y2={20} />
        <path d={`M${tip} 20 L${tip - dir * 8} 15 M${tip} 20 L${tip - dir * 8} 25`} />
      </g>
    </g>
  )
}

export default function ArcheryWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const hand = useHandoff()
  const seatAvatars = useSeatAvatars()
  // Full-screen landscape uses an immersive overlay layout (scene fills the area,
  // controls float over the margins); every other presentation keeps the stacked one.
  const { fullscreen } = usePresentation()
  const { orientation } = useViewport()
  const overlay = fullscreen && orientation === 'landscape'

  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  const p1y = useWidgetField<number>(id, 'p1y', 0, num)
  const p2y = useWidgetField<number>(id, 'p2y', 0, num)
  const scores = useWidgetField<Scores>(id, 'scores', ZERO, (v) =>
    v && typeof v === 'object' &&
    typeof (v as Scores).toy === 'number' &&
    typeof (v as Scores).ninja === 'number'
      ? (v as Scores)
      : undefined,
  )
  const turn = useWidgetField<Player>(id, 'turn', 'toy', (v) => (v === 'ninja' ? 'ninja' : 'toy'))
  const mode = useWidgetField<Mode>(id, 'mode', 'calm', (v) =>
    v === 'wind' || v === 'obstacle' ? v : 'calm',
  )
  const wind = useWidgetField<number>(id, 'wind', 0, num)
  const distance = useWidgetField<Distance>(id, 'distance', 'short', (v) =>
    v === 'long' ? 'long' : 'short',
  )
  const platforms = useWidgetField<Platform>(id, 'platforms', 'still', (v) =>
    v === 'both' || v === 'target' ? v : 'still',
  )
  const play = useWidgetField<Play>(id, 'play', 'local', (v) =>
    v === 'online' ? 'online' : 'local',
  )
  const shots = useWidgetField<number>(id, 'shots', 0, num)
  const gameSeed = useWidgetField<number>(id, 'gameSeed', 0, num)
  const [pending, setPending] = useState<{
    mode?: Mode
    distance?: Distance
    platforms?: Platform
    play?: Play
  } | null>(null)

  const W = worldW(distance)
  const px = (p: Player) => archerX(p, W)
  const feet = (p: Player) => (p === 'toy' ? p1y : p2y)
  const launchOriginAt = (p: Player, y: number) => launchOriginAtW(p, W, y)

  // Platform movement: the archer's feet Y bobs about its (clamped) dealt
  // height — the model's phase form, bridged from the animation clock.
  const platY = (p: Player, ts: number) => platYAt(feet(p), platPhaseAt(p, ts))
  // In 'target' mode only the shooter's opponent bobs; in 'both' everyone bobs.
  const moves = (p: Player) =>
    platforms === 'both' || (platforms === 'target' && p === other(turn))

  const dealt = p1y > 0 && p2y > 0
  const winner: Player | null = scores.toy >= WIN ? 'toy' : scores.ninja >= WIN ? 'ninja' : null
  const gameOver = winner !== null
  const inProgress = !gameOver && (scores.toy > 0 || scores.ninja > 0)
  const nextWind = () => (mode === 'wind' ? randomWind() : 0)

  const setGame = (next: Record<string, unknown>) =>
    dispatch(updateWidgetData({ id, data: next }))

  // Transient interaction state.
  const svgRef = useRef<SVGSVGElement>(null)
  const [aim, setAim] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null)
  const [arrow, setArrow] = useState<{ x: number; y: number; angle: number } | null>(null)
  const [flash, setFlash] = useState<Player | null>(null)
  // Shared animation clock (rAF timestamp) driving the obstacle + moving platforms.
  const [animTs, setAnimTs] = useState(0)
  const rafRef = useRef<number | null>(null)

  const animated = mode === 'obstacle' || platforms !== 'still'
  // Displayed feet Y: the live platform height when bobbing, else the dealt height.
  const dispY = (p: Player) => (moves(p) ? platY(p, animTs) : feet(p))
  const blockCy = blockCyAt(animTs)

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  // Continuously advance the animation clock while idle (the flight loop drives it
  // in-flight) whenever the obstacle or a moving-platform mode is active.
  useEffect(() => {
    if (!animated || arrow) return
    let raf = 0
    const tick = (ts: number) => {
      setAnimTs(ts)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animated, arrow])

  // Deal random heights on first mount / when the world changes size.
  useEffect(() => {
    if (!dealt) {
      const seed = (Math.random() * 0xffffffff) >>> 0
      setGame({ ...dealHeightsFrom(seed), gameSeed: seed })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealt])

  /**
   * Play a shot's flight. Pure presentation: the OUTCOME is already decided
   * by `resolveShot` before the first frame draws — this loop just renders
   * the same closed-form path until the resolver's `tEnd`, then reports done.
   * One animator serves the local shooter and an incoming remote shot alike.
   */
  const animateShot = (
    shooter: Player,
    vx: number,
    vy: number,
    shooterY: number,
    windNow: number,
    tEnd: number,
    onDone: () => void,
  ) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const origin = launchOriginAt(shooter, shooterY)
    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const t = (ts - start) / 1000
      setAnimTs(ts)
      if (t >= tEnd) {
        setArrow(null)
        onDone()
        return
      }
      const pos = flightAt(origin, vx, vy, windNow, t)
      setArrow({
        x: pos.x,
        y: pos.y,
        angle: (Math.atan2(vy + G * t, vx + windNow * t) * 180) / Math.PI,
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }
  // Carries the animator into `applyMove`, which runs from a transport
  // callback — the presentation side-channel of an otherwise pure reducer.
  const animateRef = useRef(animateShot)
  animateRef.current = animateShot

  // ---------------------------------------------------------------- netplay
  const online = play === 'online'
  const netBoard: NetState = {
    p1y,
    p2y,
    scores,
    turn,
    shots,
    gameSeed,
    mode,
    distance,
    platforms,
  }
  const net = useNetGame<NetState>({
    online,
    board: netBoard,
    first: 'toy',
    turn,
    ply: shots,
    // The Archery-specific part of two-device play: unpack the quantized
    // launch, run the SAME fixed-step resolver the shooter ran, and step the
    // score/turn. Every input the outcome depends on is either synced state
    // or packed into the move itself.
    applyMove: (state, packed, seat) => {
      const parts = unpackShot(packed)
      if (!parts) return null
      const w = worldW(state.distance)
      const windNow = state.mode === 'wind' ? windAt(state.gameSeed, state.shots) : 0
      const outcome = resolveShot({
        w,
        shooter: seat,
        vx: parts.vx,
        vy: parts.vy,
        shooterY: parts.shooterY,
        oppFeetY: seat === 'toy' ? state.p2y : state.p1y,
        oppPhase: parts.oppPhase,
        wind: windNow,
        obstaclePhase: parts.obstaclePhase,
      })
      // Replay their arrow here. The score has already moved by the time it
      // lands — a known beat of lost suspense, noted in the doc's backlog.
      animateRef.current(seat, parts.vx, parts.vy, parts.shooterY, windNow, outcome.tEnd, () => {
        if (outcome.hit) {
          setFlash(seat === 'toy' ? 'ninja' : 'toy')
          window.setTimeout(() => setFlash(null), 500)
        }
      })
      const ns = { ...state.scores }
      if (outcome.hit) ns[seat] += 1
      const won = ns[seat] >= WIN
      return {
        ...state,
        scores: ns,
        shots: state.shots + 1,
        turn: won ? state.turn : other(seat),
      }
    },
    coerceBoard: coerceNetState,
    // Only reached if a peer ever sends `new`; archery restarts via sendSync
    // because a fresh board needs fresh randomness. Deterministic fallback:
    // same heights, zeroed score.
    newBoard: () => ({ ...netBoard, scores: { toy: 0, ninja: 0 }, shots: 0, turn: 'toy' }),
    onReplace: () => {
      hand.clear()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setArrow(null)
      setAim(null)
    },
    setGame: (next) => {
      // The hook speaks in one `board` object; this widget persists flat
      // fields — spread it back out.
      if ('board' in next) {
        const { board, ...rest } = next
        setGame({ ...(board as NetState), ...rest })
      } else {
        setGame(next)
      }
    },
  })

  // Costume rules as everywhere: a connected guest wears the host's picks.
  const avatarOverride = online ? net.peerAvatars : null
  const effectiveAvatars = avatarOverride ?? seatAvatars
  const colorOf = (seat: Player) => avatarMetaById[effectiveAvatars[seat]].color

  /** Wind this shot flies in. Online derives it from the synced seed so both
   * devices know every turn's wind without messaging it; local keeps the
   * persisted roll. */
  const effWind = online ? (mode === 'wind' ? windAt(gameSeed, shots) : 0) : wind

  const reset = (
    opts: { mode?: Mode; distance?: Distance; platforms?: Platform; play?: Play } = {},
  ) => {
    hand.clear()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setArrow(null)
    setAim(null)
    const m = opts.mode ?? mode
    const seed = (Math.random() * 0xffffffff) >>> 0
    // Built, dispatched AND returned: an online restart must send exactly
    // what it dealt, and dispatches are async.
    const next = {
      ...dealHeightsFrom(seed),
      scores: { toy: 0, ninja: 0 },
      turn: 'toy' as Player,
      first: 'toy' as Player,
      shots: 0,
      gameSeed: seed,
      mode: m,
      distance: opts.distance ?? distance,
      platforms: opts.platforms ?? platforms,
      play: opts.play ?? play,
      wind: m === 'wind' ? randomWind() : 0,
    }
    setGame(next)
    return next
  }
  const newGame = () => {
    const next = reset()
    // A fresh board needs fresh randomness, which `new` cannot carry — so an
    // online restart is a whole-position sync, from either side.
    if (online) {
      net.sendSync(
        {
          p1y: next.p1y,
          p2y: next.p2y,
          scores: next.scores,
          turn: next.turn,
          shots: next.shots,
          gameSeed: next.gameSeed,
          mode: next.mode,
          distance: next.distance,
          platforms: next.platforms,
        },
        'toy',
      )
    }
  }
  const requestReset = (opts: {
    mode?: Mode
    distance?: Distance
    platforms?: Platform
    play?: Play
  }) => {
    if (inProgress) setPending(opts)
    else reset(opts)
  }
  const changeMode = (next: Mode | null) => {
    if (next && next !== mode) requestReset({ mode: next })
  }
  const changeRange = (next: Distance | null) => {
    if (next && next !== distance) requestReset({ distance: next })
  }
  const changePlatforms = (next: Platform | null) => {
    if (next && next !== platforms) requestReset({ platforms: next })
  }
  const changePlay = (next: Play | null) => {
    if (next && next !== play) requestReset({ play: next })
  }

  const locked = gameOver || !!hand.player || !!arrow || !dealt || net.blocked

  const toWorld = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const onDown = (e: React.PointerEvent) => {
    if (locked) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const w = toWorld(e)
    setAim({ sx: w.x, sy: w.y, cx: w.x, cy: w.y })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!aim) return
    const w = toWorld(e)
    setAim({ ...aim, cx: w.x, cy: w.y })
  }
  const onUp = () => {
    if (!aim) return
    const dx = aim.cx - aim.sx
    const dy = aim.cy - aim.sy
    setAim(null)
    const dist = Math.hypot(dx, dy)
    if (dist < 6) return
    const mag = Math.min(dist * K, VMAX)
    fire((-dx / dist) * mag, (-dy / dist) * mag)
  }

  const fire = (rawVx: number, rawVy: number) => {
    const shooter = turn
    const opp = other(shooter)
    // Quantize FIRST: what flies on this screen is exactly what the other
    // device (and the tests) resolve — identical ints, identical floats.
    const packed = packShot({
      vx: rawVx,
      vy: rawVy,
      shooterY: moves(shooter) ? platY(shooter, animTs) : feet(shooter),
      oppPhase: moves(opp) ? platPhaseAt(opp, animTs) : null,
      obstaclePhase: mode === 'obstacle' ? obsPhaseAt(animTs) : null,
    })
    const parts = unpackShot(packed)
    if (!parts) return
    const windNow = effWind
    // One physics: the outcome is decided here, before the first frame draws.
    const outcome = resolveShot({
      w: W,
      shooter,
      vx: parts.vx,
      vy: parts.vy,
      shooterY: parts.shooterY,
      oppFeetY: feet(opp),
      oppPhase: parts.oppPhase,
      wind: windNow,
      obstaclePhase: parts.obstaclePhase,
    })
    if (online) {
      // Commit and relay at release — the wire must not wait for a 1.5s
      // animation, or the other device's next move would arrive against a
      // position this one hasn't written yet.
      net.sendMove(packed)
      const ns = { ...scores }
      if (outcome.hit) ns[shooter] += 1
      const won = ns[shooter] >= WIN
      setGame({ scores: ns, shots: shots + 1, ...(won ? {} : { turn: opp }) })
      animateShot(shooter, parts.vx, parts.vy, parts.shooterY, windNow, outcome.tEnd, () => {
        if (outcome.hit) {
          setFlash(opp)
          window.setTimeout(() => setFlash(null), 500)
        }
      })
      return
    }
    // Local pass-and-play keeps its suspense: the state lands when the arrow
    // does.
    const captured = scores
    animateShot(shooter, parts.vx, parts.vy, parts.shooterY, windNow, outcome.tEnd, () =>
      resolve(shooter, outcome.hit, captured),
    )
  }

  const resolve = (shooter: Player, hit: boolean, captured: Scores) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setArrow(null)
    const opp = other(shooter)
    if (hit) {
      const ns = captured[shooter] + 1
      setFlash(opp)
      window.setTimeout(() => setFlash(null), 500)
      if (ns >= WIN) {
        setGame({ scores: { ...captured, [shooter]: ns }, shots: shots + 1 })
        return
      }
      setGame({ scores: { ...captured, [shooter]: ns }, shots: shots + 1, turn: opp, wind: nextWind() })
    } else {
      setGame({ shots: shots + 1, turn: opp, wind: nextWind() })
    }
    hand.announce(opp)
  }

  // Aim indicator (short, at the shooter's origin, opposite the drag).
  let indicator: { x1: number; y1: number; x2: number; y2: number } | null = null
  if (aim && !locked) {
    const o = launchOriginAt(turn, dispY(turn))
    const dx = aim.cx - aim.sx
    const dy = aim.cy - aim.sy
    const dist = Math.hypot(dx, dy)
    if (dist > 2) {
      const power = Math.min(dist * K, VMAX) / VMAX
      const len = 18 + power * 34
      indicator = { x1: o.x, y1: o.y, x2: o.x - (dx / dist) * len, y2: o.y - (dy / dist) * len }
    }
  }

  const toggleSx = { textTransform: 'none' as const, py: 0.1, px: 0.75 }

  // Render pieces shared by the stacked layout and the immersive overlay layout.
  const controlGroups = (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, mb: 0.25 }}>Mode</Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => changeMode(v as Mode | null)}>
          <ToggleButton value="calm" sx={toggleSx}>Calm</ToggleButton>
          <ToggleButton value="wind" sx={toggleSx}>Wind</ToggleButton>
          <ToggleButton value="obstacle" sx={toggleSx}>Obstacle</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, mb: 0.25 }}>Range</Typography>
        <ToggleButtonGroup size="small" exclusive value={distance} onChange={(_, v) => changeRange(v as Distance | null)}>
          <ToggleButton value="short" sx={toggleSx}>Short</ToggleButton>
          <ToggleButton value="long" sx={toggleSx}>Long</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, mb: 0.25 }}>Platforms</Typography>
        <ToggleButtonGroup size="small" exclusive value={platforms} onChange={(_, v) => changePlatforms(v as Platform | null)}>
          <ToggleButton value="still" sx={toggleSx}>Still</ToggleButton>
          <ToggleButton value="both" sx={toggleSx}>Both</ToggleButton>
          <ToggleButton value="target" sx={toggleSx}>Target</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, mb: 0.25 }}>Play</Typography>
        <ToggleButtonGroup size="small" exclusive value={play} onChange={(_, v) => changePlay(v as Play | null)}>
          <ToggleButton value="local" data-testid="archery-play-local" sx={toggleSx}>Local</ToggleButton>
          <ToggleButton value="online" data-testid="archery-play-online" sx={toggleSx}>2 Devices</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {online && (
        <NetplayChip link={net.link} testId="archery-link" onOpen={() => net.setLinkOpen(true)} />
      )}
    </>
  )

  const renderScore = (p: Player) => {
    const active = !gameOver && turn === p
    return (
      <Box
        sx={{
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          border: '2px solid',
          borderColor: active ? colorOf(p) : 'transparent',
          bgcolor: active ? `${colorOf(p)}22` : 'transparent',
        }}
      >
        <PlayerBadge mark={p} label={`${scores[p]} / ${WIN}`} pulse={active} />
      </Box>
    )
  }

  const footerText =
    gameOver && winner ? (
      <PlayerBadge mark={winner} label="wins!" />
    ) : (
      <Typography variant="body2" color="text.secondary">
        Drag to aim, release to fire
      </Typography>
    )
  const newGameButton = (
    <Button size="small" onClick={newGame}>
      New game
    </Button>
  )

  // Translucent, theme-aware backing so overlaid controls stay legible on the scene.
  const panelSx = {
    bgcolor: (t: Theme) => alpha(t.palette.background.paper, 0.82),
    borderRadius: 1,
    px: 1,
    py: 0.5,
    pointerEvents: 'auto' as const,
  }

  return (
    <SeatAvatarsOverride.Provider value={avatarOverride}>
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      data-testid="archery-root"
      data-play={play}
      data-net={online ? net.link.status : 'off'}
      data-seat={online ? (net.link.seat ?? '') : ''}
      data-turn={turn}
      data-shots={shots}
      data-arrow={arrow ? 'flying' : 'none'}
      data-score-toy={scores.toy}
      data-score-ninja={scores.ninja}
      data-game-seed={gameSeed}
      data-avatar-toy={effectiveAvatars.toy}
      data-avatar-ninja={effectiveAvatars.ninja}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: overlay ? 0 : 0.5, p: overlay ? 0 : 0.5 }}
    >
      {!overlay && (
        <Stack direction="row" sx={{ justifyContent: 'center', alignItems: 'flex-end', gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
          {controlGroups}
        </Stack>
      )}

      {!overlay && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
          {renderScore('toy')}
          {renderScore('ninja')}
        </Stack>
      )}

      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', containerType: 'size', display: 'grid', placeItems: 'center' }}>
        <Box sx={{ width: `min(100cqw, calc(100cqh * ${W} / ${H}))`, maxWidth: '100%', aspectRatio: `${W} / ${H}` }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            data-p1y={p1y}
            data-p2y={p2y}
            data-w={W}
            data-mode={mode}
            data-wind={mode === 'wind' ? effWind : 0}
            data-platforms={platforms}
            style={{ display: 'block', borderRadius: 8, touchAction: 'none', cursor: locked ? 'default' : 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <rect x={0} y={0} width={W} height={H} fill="#bfe3f5" />
            <rect x={0} y={GROUND} width={W} height={H - GROUND} fill="#6bbf59" />
            <rect x={0} y={GROUND} width={W} height={3} fill="#4f9e42" />

            {mode === 'wind' && <WindIndicator wind={effWind} cx={W / 2} />}

            {mode === 'obstacle' && (
              <rect
                data-testid="obstacle"
                data-blocky={Math.round(blockCy)}
                x={W / 2 - OBS_HW}
                y={blockCy - OBS_HH}
                width={OBS_HW * 2}
                height={OBS_HH * 2}
                rx={4}
                fill="#7a5c8f"
                stroke="#5a4270"
                strokeWidth={2}
              />
            )}

            {dealt && <Archer player="toy" x={px('toy')} py={dispY('toy')} hit={flash === 'toy'} />}
            {dealt && <Archer player="ninja" x={px('ninja')} py={dispY('ninja')} hit={flash === 'ninja'} />}

            {indicator && (
              <g stroke={colorOf(turn)} strokeWidth={3} strokeLinecap="round">
                <line x1={indicator.x1} y1={indicator.y1} x2={indicator.x2} y2={indicator.y2} />
                <circle cx={indicator.x2} cy={indicator.y2} r={3} fill={colorOf(turn)} stroke="none" />
              </g>
            )}

            {arrow && (
              <g data-testid="arrow" transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}>
                <line x1={-14} y1={0} x2={6} y2={0} stroke="#3a2a1a" strokeWidth={2} />
                <path d="M6 0 L0 -3 L0 3 Z" fill="#3a2a1a" />
                <path d={`M-14 0 L-18 -3 M-14 0 L-18 3`} stroke="#d8d8d8" strokeWidth={1.5} />
              </g>
            )}
          </svg>
        </Box>

        {overlay && (
          <>
            {/* Scores stay in the top corners (small, glanceable); the top-centre
                over the shooters + arrow arc is kept clear. */}
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, p: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, zIndex: 1, pointerEvents: 'none' }}>
              {renderScore('toy')}
              {renderScore('ninja')}
            </Box>
            {/* Controls + footer live along the otherwise-empty bottom band:
                hint left · controls centre · New game right (space-between). */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, zIndex: 1, pointerEvents: 'none' }}>
              <Box sx={panelSx}>{footerText}</Box>
              <Stack direction="row" sx={{ ...panelSx, gap: 1, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center' }}>
                {controlGroups}
              </Stack>
              <Box sx={{ pointerEvents: 'auto' }}>{newGameButton}</Box>
            </Box>
          </>
        )}

        {hand.player && !gameOver && <TurnBanner player={hand.player} onSkip={hand.clear} />}

        {gameOver && winner && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }}
          >
            <WinnerCelebration winner={winner} />
          </Box>
        )}
      </Box>

      {!overlay && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
          {footerText}
          {newGameButton}
        </Stack>
      )}

      {online && net.linkOpen && (
        <Suspense fallback={null}>
          <NetplayDialog open onClose={() => net.setLinkOpen(false)} link={net.link} />
        </Suspense>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Restart game?"
        message="Changing the mode, range, or platforms starts a new game and reshuffles the archers."
        onConfirm={() => {
          if (pending) reset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
    </SeatAvatarsOverride.Provider>
  )
}
