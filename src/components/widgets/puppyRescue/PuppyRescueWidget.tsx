import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  NativeSelect,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import RestartIcon from '@mui/icons-material/RestartAlt'
import PetsIcon from '@mui/icons-material/Pets'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { useAppDispatch, useAppSelector } from '../../../app/hooks'
import {
  recordRescueEscape,
  resetGameRecords,
  selectPuppyRescueRecords,
} from '../../../features/records/recordsSlice'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { isTypingTarget } from '../../../utils/isTypingTarget'
import { lazyWithReload } from '../../../utils/lazyWithReload'
import { unlockAudio } from '../droneSim/webAudio'
import ConfirmDialog from '../ConfirmDialog'
import { STEP, initialState, parseLevel, starsFor, step, type Status } from './rescueModel'
import { LEVELS, TIERS, TIER_LABEL, levelLabel } from './rescueLevels'
import { playAlert, playCaught, playDoor, playEscape, playFreed } from './rescueSounds'
import type { SimView } from './PuppyRescue3D'

/** three.js stays in its own lazy chunk. */
const PuppyRescue3D = lazyWithReload(() => import('./PuppyRescue3D'), 'puppy3d')

/** Caught → back at the start in under a second. */
const CAUGHT_MS = 900
/** Telemetry publish interval (ms). */
const PUBLISH_MS = 50
/** Drag stick: dead zone as a fraction of the throw. */
const DRAG_DEAD = 0.12

const coerceLevel = (v: unknown): number | undefined =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < LEVELS.length ? (v as number) : undefined

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  W: [0, -1],
  S: [0, 1],
  A: [-1, 0],
  D: [1, 0],
}

const fmtTime = (ms: number) => {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

interface Result {
  stars: number
  ms: number
  pups: number
  total: number
  spotted: boolean
  newBest: boolean
}

export default function PuppyRescueWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const levelIdx = useWidgetField(id, 'level', 0, coerceLevel)
  const sound = useWidgetField(id, 'sound', true)
  const unlockAll = useWidgetField(id, 'unlockAll', false)
  const records = useAppSelector(selectPuppyRescueRecords)
  const setData = useCallback(
    (data: Record<string, unknown>) => dispatch(updateWidgetData({ id, data })),
    [dispatch, id],
  )

  const spec = LEVELS[levelIdx]
  const level = useMemo(() => parseLevel(spec), [spec])
  const unlocked = (i: number) => unlockAll || i === 0 || (records.stars[LEVELS[i - 1].id] ?? 0) >= 1

  /** The live simulation — stepped by the loop below, read by the 3D view. */
  const simRef = useRef<SimView>(null as unknown as SimView)
  if (!simRef.current || simRef.current.level !== level) simRef.current = { level, s: initialState(level) }

  const [status, setStatus] = useState<Status>('ready')
  const [pups, setPups] = useState(0)
  const [spotted, setSpotted] = useState(false)
  const [caughtWho, setCaughtWho] = useState(-1)
  const [result, setResult] = useState<Result | null>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [run, setRun] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLSpanElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const keys = useRef(new Set<string>())
  const drag = useRef<{ id: number; ox: number; oy: number; r: number; ix: number; iy: number } | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const bestRef = useRef(records.bestMs)
  bestRef.current = records.bestMs

  /** Fresh attempt at the current level. */
  const restart = useCallback(() => {
    simRef.current = { level, s: initialState(level) }
    setStatus('ready')
    setPups(0)
    setSpotted(false)
    setCaughtWho(-1)
    setResult(null)
    setRun((r) => r + 1)
  }, [level])

  // A level change starts fresh (the render above already swapped the sim).
  useEffect(() => {
    setStatus('ready')
    setPups(0)
    setSpotted(false)
    setCaughtWho(-1)
    setResult(null)
  }, [level])

  // Caught: show it, then straight back to the start.
  useEffect(() => {
    if (status !== 'caught') return
    const t = window.setTimeout(restart, CAUGHT_MS)
    return () => window.clearTimeout(t)
  }, [status, restart])

  // The game loop: fixed steps, input read from refs, React touched only
  // when something visible to the HUD changes.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastPub = 0
    let seen = { freed: 0, alert: 0, door: 0 }
    let seenS: unknown = null
    let prevStatus: Status = 'ready'
    let prevSpotted = false
    const input = (): [number, number] => {
      const d = drag.current
      if (d) return [d.ix, d.iy]
      let ix = 0
      let iy = 0
      for (const k of keys.current) {
        const v = KEY_DIRS[k]
        if (v) {
          ix += v[0]
          iy += v[1]
        }
      }
      return [Math.sign(ix), Math.sign(iy)]
    }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { level: lv, s } = simRef.current
      if (s !== seenS) {
        // A new attempt: re-baseline the event diff.
        seenS = s
        seen = { ...s.ev }
        prevStatus = s.status
        prevSpotted = s.spotted
      }
      if (s.status === 'ready' || s.status === 'play') {
        acc += dt
        let n = 0
        while (acc >= STEP && n < 8) {
          const [ix, iy] = input()
          step(lv, s, ix, iy)
          acc -= STEP
          n++
          if (s.status !== 'play' && s.status !== 'ready') break
        }
        if (n === 8) acc = 0
      } else acc = 0

      const root = rootRef.current
      const sfx = soundRef.current
      if (s.ev.freed !== seen.freed) {
        if (sfx) playFreed()
        setPups(s.order.length)
        if (root) root.dataset.sfxFreed = String(Number(root.dataset.sfxFreed ?? 0) + 1)
      }
      if (s.ev.door !== seen.door && sfx) playDoor()
      if (s.ev.alert !== seen.alert) {
        if (sfx) playAlert()
        if (root) root.dataset.sfxAlert = String(Number(root.dataset.sfxAlert ?? 0) + 1)
      }
      seen = { ...s.ev }
      if (s.spotted !== prevSpotted) {
        prevSpotted = s.spotted
        setSpotted(s.spotted)
      }
      if (s.status !== prevStatus) {
        prevStatus = s.status
        setStatus(s.status)
        if (s.status === 'caught') {
          setCaughtWho(s.caughtWho)
          if (sfx) playCaught()
          if (root) root.dataset.sfxCaught = String(Number(root.dataset.sfxCaught ?? 0) + 1)
        } else if (s.status === 'escaped') {
          const stars = starsFor(lv, s)
          const ms = Math.round(s.t * 1000)
          const prev = bestRef.current[lv.spec.id] ?? 0
          setResult({
            stars,
            ms,
            pups: s.order.length,
            total: lv.cages.length,
            spotted: s.spotted,
            newBest: prev === 0 || ms < prev,
          })
          dispatch(recordRescueEscape({ key: lv.spec.id, stars, ms }))
          if (sfx) playEscape()
          if (root) root.dataset.sfxEscape = String(Number(root.dataset.sfxEscape ?? 0) + 1)
        }
      }
      if (timerRef.current) timerRef.current.textContent = fmtTime(s.t * 1000)
      if (root && now - lastPub >= PUBLISH_MS) {
        lastPub = now
        const ds = root.dataset
        ds.status = s.status
        ds.x = s.x.toFixed(3)
        ds.y = s.y.toFixed(3)
        ds.t = s.t.toFixed(2)
        ds.pups = String(s.order.length)
        ds.meter = s.meter.toFixed(2)
        ds.spotted = s.spotted ? '1' : '0'
        ds.seeing = String(s.seeing)
        ds.guards = s.guards.map((g) => `${g.x.toFixed(2)},${g.y.toFixed(2)},${g.h.toFixed(2)}`).join(';')
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [dispatch])

  // Keyboard: arrows / WASD, on window (skipping text fields). Overlays
  // don't block keys, so the sim's own status gates the effect.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || !KEY_DIRS[e.key]) return
      e.preventDefault()
      unlockAudio()
      keys.current.add(e.key)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key)
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /* ---- drag anywhere: a floating stick appears where the finger lands */
  const showRing = (x: number, y: number, r: number) => {
    const ring = ringRef.current
    const knob = knobRef.current
    if (!ring || !knob) return
    ring.style.display = 'block'
    ring.style.width = ring.style.height = `${r * 2}px`
    ring.style.left = `${x - r}px`
    ring.style.top = `${y - r}px`
    knob.style.transform = 'translate(0px, 0px)'
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    unlockAudio()
    if (drag.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const r = Math.max(28, Math.min(56, Math.min(rect.width, rect.height) * 0.09))
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, r, ix: 0, iy: 0 }
    showRing(e.clientX - rect.left, e.clientY - rect.top, r)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    let dx = e.clientX - d.ox
    let dy = e.clientY - d.oy
    const len = Math.hypot(dx, dy)
    if (len > d.r) {
      dx *= d.r / len
      dy *= d.r / len
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    const m = Math.min(1, len / d.r)
    const k = m < DRAG_DEAD ? 0 : (m - DRAG_DEAD) / (1 - DRAG_DEAD) / Math.max(1e-6, Math.hypot(dx, dy))
    // Screen up = up the map (the camera looks from the bottom edge).
    d.ix = dx * k
    d.iy = dy * k
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (ringRef.current) ringRef.current.style.display = 'none'
  }

  const goTo = (i: number) => {
    if (i === levelIdx) restart()
    else setData({ level: i })
  }

  const myStars = records.stars[spec.id] ?? 0
  const myBest = records.bestMs[spec.id] ?? 0
  const next = levelIdx + 1 < LEVELS.length ? levelIdx + 1 : -1
  const total = level.cages.length
  const unlockedCount = LEVELS.reduce((n, _, i) => n + (unlocked(i) ? 1 : 0), 0)

  return (
    <Box
      ref={rootRef}
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="puppy-root"
      data-widget-id={id}
      data-level={spec.id}
      data-level-index={levelIdx}
      data-unlocked={unlockedCount}
      data-run={run}
      data-sound={sound ? 'on' : 'off'}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 0.5,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <NativeSelect
          value={levelIdx}
          onChange={(e) => goTo(Number(e.target.value))}
          data-testid="puppy-level"
          inputProps={{ 'aria-label': 'Level' }}
          sx={{ flex: 1, minWidth: 0, fontSize: 14 }}
        >
          {TIERS.map((tier) => {
            const idx = LEVELS.map((l, i) => (l.tier === tier ? i : -1)).filter((i) => i >= 0)
            const got = idx.reduce((n, i) => n + (records.stars[LEVELS[i].id] ?? 0), 0)
            return (
              <optgroup key={tier} label={`${TIER_LABEL[tier]} · ★${got}/${idx.length * 3}`}>
                {idx.map((i) => (
                  <option key={i} value={i} disabled={!unlocked(i)}>
                    {unlocked(i)
                      ? `${levelLabel(i)} · ${LEVELS[i].name} ${starText(records.stars[LEVELS[i].id] ?? 0)}`
                      : `🔒 ${levelLabel(i)}`}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </NativeSelect>
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }} data-testid="puppy-count" data-pups={pups} data-total={total}>
          <PetsIcon fontSize="small" sx={{ color: pups === total ? 'success.main' : 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {pups}/{total}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label="Settings" data-testid="puppy-settings" onClick={(e) => setMenuEl(e.currentTarget)}>
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box
        data-testid="puppy-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        sx={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 1, overflow: 'hidden', touchAction: 'none', bgcolor: '#48d3f2' }}
      >
        <Box data-testid="puppy-3d" sx={{ position: 'absolute', inset: 0 }}>
          <Suspense
            fallback={
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            }
          >
            <PuppyRescue3D sim={simRef} levelKey={`${spec.id}`} />
          </Suspense>
        </Box>

        {/* the floating stick */}
        <Box
          ref={ringRef}
          sx={{
            display: 'none',
            position: 'absolute',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.8)',
            bgcolor: 'rgba(255,255,255,0.15)',
            pointerEvents: 'none',
          }}
        >
          <Box
            ref={knobRef}
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 26,
              height: 26,
              ml: '-13px',
              mt: '-13px',
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.9)',
            }}
          />
        </Box>

        {status === 'ready' && (
          <Box
            data-testid="puppy-tip"
            sx={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: 8,
              p: 1,
              borderRadius: 2,
              bgcolor: 'rgba(20,16,60,0.78)',
              color: 'common.white',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {levelLabel(levelIdx)} · {spec.name}
            </Typography>
            {spec.tip && (
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {spec.tip}
              </Typography>
            )}
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              Move to start
            </Typography>
          </Box>
        )}

        {status === 'caught' && (
          <Box
            data-testid="puppy-caught"
            sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', bgcolor: 'rgba(255,40,60,0.18)' }}
          >
            <Box sx={{ textAlign: 'center', px: 2, py: 1, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.6)', color: 'common.white' }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Caught!
              </Typography>
              <Typography variant="body2">{caughtWho >= 0 ? 'A catcher spotted a puppy.' : 'A catcher spotted you.'}</Typography>
            </Box>
          </Box>
        )}

        {status === 'escaped' && result && (
          <Box
            data-testid="puppy-escaped"
            data-stars={result.stars}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.35)' }}
          >
            <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'background.paper', minWidth: 180, boxShadow: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Escaped!
              </Typography>
              <Typography sx={{ fontSize: 30, lineHeight: 1.1, color: '#f5b301' }} data-testid="puppy-stars">
                {starText(result.stars)}
              </Typography>
              <Typography variant="body2">✓ Out of the door</Typography>
              <Typography variant="body2" sx={{ opacity: result.pups === result.total ? 1 : 0.55 }}>
                {result.pups === result.total ? '✓' : '✗'} Puppies {result.pups}/{result.total}
              </Typography>
              <Typography variant="body2" sx={{ opacity: result.spotted ? 0.55 : 1 }}>
                {result.spotted ? '✗ Spotted' : '✓ Never spotted'}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {fmtTime(result.ms)}
                {result.newBest ? ' · New best!' : myBest ? ` · Best ${fmtTime(myBest)}` : ''}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 1 }}>
                <Button size="small" variant="outlined" data-testid="puppy-again" onClick={restart}>
                  Again
                </Button>
                {next >= 0 && (
                  <Button size="small" variant="contained" data-testid="puppy-next" onClick={() => goTo(next)}>
                    Next level
                  </Button>
                )}
              </Stack>
            </Box>
          </Box>
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            <span ref={timerRef} data-testid="puppy-timer">
              0:00.0
            </span>
          </Typography>
          <Box
            data-testid="puppy-unseen"
            data-spotted={spotted ? '1' : '0'}
            title={spotted ? 'Spotted — no stealth star this run' : 'Unseen so far'}
            sx={{ display: 'flex', color: spotted ? 'text.disabled' : 'success.main' }}
          >
            {spotted ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
          </Box>
          <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
            {starText(myStars)}
            {myBest ? ` · ${fmtTime(myBest)}` : ''}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label="Restart" data-testid="puppy-restart" onClick={restart}>
          <RestartIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Menu anchorEl={menuEl} open={menuEl !== null} onClose={() => setMenuEl(null)}>
        <MenuItem onClick={() => setData({ sound: !sound })} data-testid="puppy-sound">
          <ListItemText>Sound</ListItemText>
          <Switch size="small" checked={sound} edge="end" />
        </MenuItem>
        <MenuItem onClick={() => setData({ unlockAll: !unlockAll })} data-testid="puppy-unlock-all">
          <ListItemText>Unlock all levels</ListItemText>
          <Switch size="small" checked={unlockAll} edge="end" />
        </MenuItem>
        <MenuItem
          data-testid="puppy-reset-records"
          onClick={() => {
            setMenuEl(null)
            setResetConfirm(true)
          }}
        >
          <ListItemText>Reset records…</ListItemText>
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={resetConfirm}
        title="Reset records?"
        message="This clears every level's stars and best times on this device, and locks the levels again."
        confirmLabel="Reset records"
        cancelLabel="Keep them"
        onConfirm={() => {
          setResetConfirm(false)
          dispatch(resetGameRecords('puppyRescue'))
        }}
        onCancel={() => setResetConfirm(false)}
      />
    </Box>
  )
}
