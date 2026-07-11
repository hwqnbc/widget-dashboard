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
import ToyHead from './characters/ToyHead'
import NinjaHead from './characters/NinjaHead'
import PlayerBadge from './PlayerBadge'
import TurnBanner from './TurnBanner'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import { PLAYER_COLOR } from './playerColors'
import { useHandoff } from '../../hooks/useHandoff'

type Player = 'toy' | 'ninja'
type Scores = { toy: number; ninja: number }
type WindMode = 'off' | 'on'

// World = SVG viewBox units.
const W = 400
const H = 260
const GROUND = 238
const X: Record<Player, number> = { toy: 50, ninja: 350 }
const FACE: Record<Player, number> = { toy: 1, ninja: -1 }
const FIG_H = 58 // figure height above the feet
const G = 520 // gravity (units/s²)
const VMAX = 620 // max launch speed
const K = 6.8 // drag(world) → speed
const WIN = 5
const MIN_Y = 84
const MAX_Y = 206
const GAP = 32 // min height difference between the two archers
const WIND_MIN = 70
const WIND_MAX = 170 // horizontal accel magnitude range (units/s²)
const ZERO: Scores = { toy: 0, ninja: 0 }

const randomWind = () =>
  Math.round((WIND_MIN + Math.random() * (WIND_MAX - WIND_MIN)) * (Math.random() < 0.5 ? -1 : 1))

const other = (p: Player): Player => (p === 'toy' ? 'ninja' : 'toy')
const launchOrigin = (p: Player, py: number) => ({ x: X[p] + FACE[p] * 6, y: py - 34 })
const hitbox = (p: Player, py: number) => ({
  x0: X[p] - 16,
  x1: X[p] + 16,
  y0: py - FIG_H,
  y1: py,
})
const randY = () => MIN_Y + Math.random() * (MAX_Y - MIN_Y)
function dealHeights() {
  const a = randY()
  let b = randY()
  for (let i = 0; i < 24 && Math.abs(a - b) < GAP; i++) b = randY()
  return { p1y: Math.round(a), p2y: Math.round(b) }
}

/** A stick-figure archer with the character's head, standing on a pillar. */
function Archer({ player, py, hit }: { player: Player; py: number; hit: boolean }) {
  const x = X[player]
  const f = FACE[player]
  const hip = py - 16
  const shoulder = py - 42
  const stroke = '#2b3440'
  const Head = player === 'toy' ? ToyHead : NinjaHead
  return (
    <g>
      {/* pillar */}
      <rect x={x - 16} y={py} width={32} height={GROUND - py} fill="#8d6e52" stroke="#6b503b" strokeWidth={1.5} />
      <rect x={x - 16} y={py} width={32} height={5} fill="#6b503b" />
      {/* legs */}
      <path d={`M${x} ${hip} L${x - 7} ${py} M${x} ${hip} L${x + 7} ${py}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* spine */}
      <path d={`M${x} ${hip} L${x} ${shoulder}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      {/* bow arm (front) + bow */}
      <path d={`M${x} ${shoulder + 4} L${x + f * 14} ${shoulder + 8}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
      <path
        d={`M${x + f * 14} ${shoulder - 8} Q${x + f * 24} ${shoulder + 8} ${x + f * 14} ${shoulder + 24}`}
        stroke="#7a4a22"
        strokeWidth={2.5}
        fill="none"
      />
      <path d={`M${x + f * 14} ${shoulder - 8} L${x + f * 14} ${shoulder + 24}`} stroke="#cbb58a" strokeWidth={1} />
      {/* head */}
      <foreignObject x={x - 14} y={shoulder - 30} width={28} height={28}>
        <div style={{ width: '100%', height: '100%' }}>
          <Head />
        </div>
      </foreignObject>
      {/* hit flash */}
      {hit && <circle cx={x} cy={py - FIG_H / 2} r={26} fill="#e53935" opacity={0.4} />}
    </g>
  )
}

/** Top-centre wind gauge: an arrow pointing downwind, length ∝ strength. */
function WindIndicator({ wind }: { wind: number }) {
  const dir = wind >= 0 ? 1 : -1
  const mag = Math.min(Math.abs(wind), WIND_MAX)
  const len = 14 + (mag / WIND_MAX) * 42
  const cx = W / 2
  const cy = 20
  const tip = cx + dir * len
  return (
    <g opacity={0.85}>
      <text x={cx} y={11} textAnchor="middle" fontSize={9} fill="#5a6b7a" fontFamily="system-ui, sans-serif">
        WIND
      </text>
      <g stroke="#5a6b7a" strokeWidth={2.5} strokeLinecap="round" fill="none">
        <line x1={cx - dir * len} y1={cy} x2={tip} y2={cy} />
        <path d={`M${tip} ${cy} L${tip - dir * 8} ${cy - 5} M${tip} ${cy} L${tip - dir * 8} ${cy + 5}`} />
      </g>
    </g>
  )
}

export default function ArcheryWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const hand = useHandoff()

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
  const windMode = useWidgetField<WindMode>(id, 'windMode', 'off', (v) =>
    v === 'on' ? 'on' : 'off',
  )
  const wind = useWidgetField<number>(id, 'wind', 0, num)
  const [pending, setPending] = useState<{ windMode: WindMode } | null>(null)

  const pos: Record<Player, number> = { toy: p1y, ninja: p2y }
  const dealt = p1y > 0 && p2y > 0
  const winner: Player | null = scores.toy >= WIN ? 'toy' : scores.ninja >= WIN ? 'ninja' : null
  const gameOver = winner !== null
  const inProgress = !gameOver && (scores.toy > 0 || scores.ninja > 0)
  const nextWind = () => (windMode === 'on' ? randomWind() : 0)

  const setGame = (
    next: Partial<{
      p1y: number
      p2y: number
      scores: Scores
      turn: Player
      first: Player
      windMode: WindMode
      wind: number
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  // Transient interaction state.
  const svgRef = useRef<SVGSVGElement>(null)
  const [aim, setAim] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null)
  const [arrow, setArrow] = useState<{ x: number; y: number; angle: number } | null>(null)
  const [flash, setFlash] = useState<Player | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  // Deal random heights on first mount (keeps the reducer pure).
  useEffect(() => {
    if (!dealt) setGame(dealHeights())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealt])

  const reset = (opts: { windMode?: WindMode } = {}) => {
    hand.clear()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setArrow(null)
    setAim(null)
    const mode = opts.windMode ?? windMode
    setGame({
      ...dealHeights(),
      scores: { toy: 0, ninja: 0 },
      turn: 'toy',
      first: 'toy',
      windMode: mode,
      wind: mode === 'on' ? randomWind() : 0,
    })
  }
  const newGame = () => reset()
  const changeWind = (next: WindMode | null) => {
    if (!next || next === windMode) return
    if (inProgress) setPending({ windMode: next })
    else reset({ windMode: next })
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
    if (dist < 6) return // too small to fire
    const mag = Math.min(dist * K, VMAX)
    fire((-dx / dist) * mag, (-dy / dist) * mag)
  }

  const fire = (vx: number, vy: number) => {
    const shooter = turn
    const origin = launchOrigin(shooter, pos[shooter])
    const target = hitbox(other(shooter), pos[other(shooter)])
    const captured = scores
    const w = wind // captured horizontal acceleration
    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const t = (ts - start) / 1000
      const x = origin.x + vx * t + 0.5 * w * t * t
      const y = origin.y + vy * t + 0.5 * G * t * t
      const angle = (Math.atan2(vy + G * t, vx + w * t) * 180) / Math.PI
      setArrow({ x, y, angle })
      const hitTarget = x >= target.x0 && x <= target.x1 && y >= target.y0 && y <= target.y1
      const out = y > GROUND || x < -12 || x > W + 12 || t > 6
      if (hitTarget || out) {
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
        setGame({ scores: { ...captured, [shooter]: ns } }) // game over → celebration
        return
      }
      setGame({ scores: { ...captured, [shooter]: ns }, turn: opp, wind: nextWind() })
    } else {
      setGame({ turn: opp, wind: nextWind() })
    }
    hand.announce(opp)
  }

  // Aim indicator (short, at the shooter's origin, opposite the drag).
  let indicator: { x1: number; y1: number; x2: number; y2: number; power: number } | null = null
  if (aim && !locked) {
    const o = launchOrigin(turn, pos[turn])
    const dx = aim.cx - aim.sx
    const dy = aim.cy - aim.sy
    const dist = Math.hypot(dx, dy)
    if (dist > 2) {
      const power = Math.min(dist * K, VMAX) / VMAX
      const len = 18 + power * 34
      indicator = { x1: o.x, y1: o.y, x2: o.x - (dx / dist) * len, y2: o.y - (dy / dist) * len, power }
    }
  }

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.5 }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5, gap: 0.5 }}>
        {(['toy', 'ninja'] as const).map((p) => {
          const active = !gameOver && turn === p
          const badge = (
            <Box
              key={p}
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: '2px solid',
                borderColor: active ? PLAYER_COLOR[p] : 'transparent',
                bgcolor: active ? `${PLAYER_COLOR[p]}22` : 'transparent',
              }}
            >
              <PlayerBadge mark={p} label={`${scores[p]} / ${WIN}`} pulse={active} />
            </Box>
          )
          if (p === 'toy') {
            return (
              <Box key="left" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {badge}
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={windMode}
                  onChange={(_, v) => changeWind(v as WindMode | null)}
                >
                  <ToggleButton value="off" sx={{ textTransform: 'none', py: 0.1, px: 0.75 }}>
                    No wind
                  </ToggleButton>
                  <ToggleButton value="on" sx={{ textTransform: 'none', py: 0.1, px: 0.75 }}>
                    Wind
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )
          }
          return badge
        })}
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
        <Box
          sx={{
            width: `min(100cqw, calc(100cqh * ${W} / ${H}))`,
            maxWidth: '100%',
            aspectRatio: `${W} / ${H}`,
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            data-p1y={p1y}
            data-p2y={p2y}
            data-wind={windMode === 'on' ? wind : 0}
            style={{ display: 'block', borderRadius: 8, touchAction: 'none', cursor: locked ? 'default' : 'crosshair' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {/* sky + ground */}
            <rect x={0} y={0} width={W} height={H} fill="#bfe3f5" />
            <rect x={0} y={GROUND} width={W} height={H - GROUND} fill="#6bbf59" />
            <rect x={0} y={GROUND} width={W} height={3} fill="#4f9e42" />

            {windMode === 'on' && <WindIndicator wind={wind} />}

            {dealt && <Archer player="toy" py={p1y} hit={flash === 'toy'} />}
            {dealt && <Archer player="ninja" py={p2y} hit={flash === 'ninja'} />}

            {indicator && (
              <g stroke={PLAYER_COLOR[turn]} strokeWidth={3} strokeLinecap="round">
                <line x1={indicator.x1} y1={indicator.y1} x2={indicator.x2} y2={indicator.y2} />
                <circle cx={indicator.x2} cy={indicator.y2} r={3} fill={PLAYER_COLOR[turn]} stroke="none" />
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
        message="Changing wind starts a new game and reshuffles the archers."
        onConfirm={() => {
          if (pending) reset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
