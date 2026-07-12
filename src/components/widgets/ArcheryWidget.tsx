import { useEffect, useRef, useState } from 'react'
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
import PlayerBadge from './PlayerBadge'
import TurnBanner from './TurnBanner'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import { useSeatAvatars, useSeatVisual } from '../../features/avatars/useSeatAvatars'
import { useHandoff } from '../../hooks/useHandoff'

type Player = 'toy' | 'ninja'
type Scores = { toy: number; ninja: number }
type Mode = 'calm' | 'wind' | 'obstacle'
type Distance = 'short' | 'long'
type Platform = 'still' | 'both' | 'target'

// World = SVG viewBox units. Width depends on the Range setting; height fixed.
const H = 260
const GROUND = 238
const MARGIN = 50 // archer inset from each side
const FIG_H = 58
const G = 520 // gravity (units/s²)
const VMAX = 620
const K = 6.8 // drag(world) → speed
const WIN = 5
const MIN_Y = 84
const MAX_Y = 206
const GAP = 32
const WIND_MIN = 70
const WIND_MAX = 170
// Obstacle (bobbing block)
const OBS_MID = 118
const OBS_AMP = 58
const OBS_PERIOD = 2200
const OBS_HW = 13
const OBS_HH = 26
// Moving platforms (archers ride up/down)
const AMP_P = 34
const PERIOD_P = 2400
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const phaseOf = (p: Player) => (p === 'toy' ? 0 : Math.PI)
const ZERO: Scores = { toy: 0, ninja: 0 }

const worldW = (d: Distance) => (d === 'long' ? 560 : 400)
const other = (p: Player): Player => (p === 'toy' ? 'ninja' : 'toy')
const facing = (p: Player) => (p === 'toy' ? 1 : -1)
const randomWind = () =>
  Math.round((WIND_MIN + Math.random() * (WIND_MAX - WIND_MIN)) * (Math.random() < 0.5 ? -1 : 1))
const blockCyAt = (ts: number) => OBS_MID + OBS_AMP * Math.sin((ts / OBS_PERIOD) * Math.PI * 2)
const randY = () => MIN_Y + Math.random() * (MAX_Y - MIN_Y)
function dealHeights() {
  const a = randY()
  let b = randY()
  for (let i = 0; i < 24 && Math.abs(a - b) < GAP; i++) b = randY()
  return { p1y: Math.round(a), p2y: Math.round(b) }
}

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
  const colorOf = (seat: Player) => avatarMetaById[seatAvatars[seat]].color

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
  const [pending, setPending] = useState<{
    mode?: Mode
    distance?: Distance
    platforms?: Platform
  } | null>(null)

  const W = worldW(distance)
  const px = (p: Player) => (p === 'toy' ? MARGIN : W - MARGIN)
  const feet = (p: Player) => (p === 'toy' ? p1y : p2y)
  const launchOriginAt = (p: Player, y: number) => ({ x: px(p) + facing(p) * 6, y: y - 34 })
  const hitboxAt = (p: Player, y: number) => ({ x0: px(p) - 16, x1: px(p) + 16, y0: y - FIG_H, y1: y })

  // Platform movement: the archer's feet Y bobs about its (clamped) dealt height.
  const platCenter = (p: Player) => clamp(feet(p), MIN_Y + AMP_P, MAX_Y - AMP_P)
  const platY = (p: Player, ts: number) =>
    platCenter(p) + AMP_P * Math.sin((ts / PERIOD_P) * Math.PI * 2 + phaseOf(p))
  // In 'target' mode only the shooter's opponent bobs; in 'both' everyone bobs.
  const moves = (p: Player) =>
    platforms === 'both' || (platforms === 'target' && p === other(turn))

  const dealt = p1y > 0 && p2y > 0
  const winner: Player | null = scores.toy >= WIN ? 'toy' : scores.ninja >= WIN ? 'ninja' : null
  const gameOver = winner !== null
  const inProgress = !gameOver && (scores.toy > 0 || scores.ninja > 0)
  const nextWind = () => (mode === 'wind' ? randomWind() : 0)

  const setGame = (
    next: Partial<{
      p1y: number
      p2y: number
      scores: Scores
      turn: Player
      first: Player
      mode: Mode
      wind: number
      distance: Distance
      platforms: Platform
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

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
    if (!dealt) setGame(dealHeights())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealt])

  const reset = (opts: { mode?: Mode; distance?: Distance; platforms?: Platform } = {}) => {
    hand.clear()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setArrow(null)
    setAim(null)
    const m = opts.mode ?? mode
    setGame({
      ...dealHeights(),
      scores: { toy: 0, ninja: 0 },
      turn: 'toy',
      first: 'toy',
      mode: m,
      distance: opts.distance ?? distance,
      platforms: opts.platforms ?? platforms,
      wind: m === 'wind' ? randomWind() : 0,
    })
  }
  const newGame = () => reset()
  const requestReset = (opts: { mode?: Mode; distance?: Distance; platforms?: Platform }) => {
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

  const locked = gameOver || !!hand.player || !!arrow || !dealt

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

  const fire = (vx: number, vy: number) => {
    const shooter = turn
    const opp = other(shooter)
    // Whether each archer is riding a moving platform (captured for this flight).
    const shooterMoves = moves(shooter)
    const oppMoves = moves(opp)
    // The arrow leaves the shooter's platform at its release height.
    const shooterY = shooterMoves ? platY(shooter, animTs) : feet(shooter)
    const origin = launchOriginAt(shooter, shooterY)
    const captured = scores
    const w = wind
    const obstacle = mode === 'obstacle'
    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const t = (ts - start) / 1000
      const x = origin.x + vx * t + 0.5 * w * t * t
      const y = origin.y + vy * t + 0.5 * G * t * t
      const angle = (Math.atan2(vy + G * t, vx + w * t) * 180) / Math.PI
      setArrow({ x, y, angle })
      setAnimTs(ts)
      // The target rides its platform, so re-evaluate its hitbox each frame.
      const oppY = oppMoves ? platY(opp, ts) : feet(opp)
      const target = hitboxAt(opp, oppY)
      const cy = blockCyAt(ts)
      const blocked =
        obstacle && x >= W / 2 - OBS_HW && x <= W / 2 + OBS_HW && y >= cy - OBS_HH && y <= cy + OBS_HH
      const hitTarget =
        !blocked && x >= target.x0 && x <= target.x1 && y >= target.y0 && y <= target.y1
      const out = y > GROUND || x < -12 || x > W + 12 || t > 6
      if (blocked || hitTarget || out) {
        resolve(shooter, hitTarget, captured)
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
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
        setGame({ scores: { ...captured, [shooter]: ns } })
        return
      }
      setGame({ scores: { ...captured, [shooter]: ns }, turn: opp, wind: nextWind() })
    } else {
      setGame({ turn: opp, wind: nextWind() })
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

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.5 }}
    >
      <Stack direction="row" sx={{ justifyContent: 'center', alignItems: 'flex-end', gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
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
      </Stack>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        {(['toy', 'ninja'] as const).map((p) => {
          const active = !gameOver && turn === p
          return (
            <Box
              key={p}
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
        })}
      </Stack>

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
            data-wind={mode === 'wind' ? wind : 0}
            data-platforms={platforms}
            style={{ display: 'block', borderRadius: 8, touchAction: 'none', cursor: locked ? 'default' : 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <rect x={0} y={0} width={W} height={H} fill="#bfe3f5" />
            <rect x={0} y={GROUND} width={W} height={H - GROUND} fill="#6bbf59" />
            <rect x={0} y={GROUND} width={W} height={3} fill="#4f9e42" />

            {mode === 'wind' && <WindIndicator wind={wind} cx={W / 2} />}

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

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        {gameOver && winner ? (
          <PlayerBadge mark={winner} label="wins!" />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Drag to aim, release to fire
          </Typography>
        )}
        <Button size="small" onClick={newGame}>
          New game
        </Button>
      </Stack>

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
  )
}
