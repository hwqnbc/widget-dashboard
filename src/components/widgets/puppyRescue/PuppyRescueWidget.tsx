import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import RestartIcon from '@mui/icons-material/RestartAlt'
import PetsIcon from '@mui/icons-material/Pets'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import KeyIcon from '@mui/icons-material/Key'
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
import VirtualJoystick from '../droneSim/VirtualJoystick'
import ConfirmDialog from '../ConfirmDialog'
import {
  BARK_COOLDOWN,
  MODES,
  STEP,
  bark,
  decodeRoute,
  initialState,
  isAlert,
  parseLevel,
  puppyCount,
  routeInput,
  start,
  starsFor,
  step,
  type Mode,
  type RouteStep,
  type Status,
} from './rescueModel'
import { HINTS } from './rescueHints'
import { DEFAULT_THEME, THEMES, coerceTheme, themeById, type ThemeId } from './puppyThemes'
import { LEVELS, MODE_LABEL, TIERS, TIER_LABEL, levelLabel, recordKey } from './rescueLevels'
import {
  playAlert,
  playBark,
  playCaught,
  playChase,
  playDoor,
  playEscape,
  playFreed,
  playKey,
  playNet,
  playRustle,
  playUnlock,
} from './rescueSounds'
import type { SimView } from './PuppyRescue3D'

/** three.js stays in its own lazy chunk. */
const PuppyRescue3D = lazyWithReload(() => import('./PuppyRescue3D'), 'puppy3d')

/** Caught → back at the start in under a second. */
const CAUGHT_MS = 900
/** Telemetry publish interval (ms). */
const PUBLISH_MS = 50
/** The fixed stick: past this much deflection (of the joystick's own
 * dead-zone-rescaled output, ≈10 px on the default stick) the dog runs at
 * FULL speed — no push-harder ramp (a ramped stick felt sluggish; lesson
 * #158). Inside it: still. */
const STICK_DEAD = 0.15
/** Stick knob base diameter (px) and the control strip's height. */
const STICK_SIZE = 76
type StickSide = 'left' | 'center' | 'right'
const coerceSide = (v: unknown): StickSide | undefined =>
  v === 'left' || v === 'center' || v === 'right' ? v : undefined

const coerceMode = (v: unknown): Mode | undefined => (MODES.includes(v as Mode) ? (v as Mode) : undefined)

/** One line on the tip banner saying what the mode changes. */
const MODE_TIP: Record<Mode, string> = {
  classic: '',
  easy: 'Easy: a spotted puppy is netted back to its cage — only being seen YOURSELF is a catch.',
  arcade: 'Arcade: a catcher that spots you gives chase — outrun it or break its sight. Only a touch catches.',
}
/** The hint replay ends this long after the ghost escapes (ms). */
const HINT_END_MS = 900
/** How long the "Netted!" note stays up (ms). */
const NET_MS = 1400

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
  const stickSide = useWidgetField<StickSide>(id, 'stickSide', 'center', coerceSide)
  const barkTipSeen = useWidgetField(id, 'barkTipSeen', false)
  const mode = useWidgetField<Mode>(id, 'mode', 'classic', coerceMode)
  const themeId = useWidgetField<ThemeId>(id, 'theme', DEFAULT_THEME, coerceTheme)
  const theme = themeById[themeId]
  const records = useAppSelector(selectPuppyRescueRecords)
  const setData = useCallback(
    (data: Record<string, unknown>) => dispatch(updateWidgetData({ id, data })),
    [dispatch, id],
  )

  const spec = LEVELS[levelIdx]
  const level = useMemo(() => parseLevel(spec), [spec])
  /** Stars for level i in the current mode. */
  const starsOf = (i: number) => records.stars[recordKey(mode, LEVELS[i].id)] ?? 0
  /** An escape in ANY mode unlocks the next level (Easy is a real on-ramp). */
  const unlocked = (i: number) =>
    unlockAll || i === 0 || MODES.some((m) => (records.stars[recordKey(m, LEVELS[i - 1].id)] ?? 0) >= 1)

  /** The live simulation — stepped by the loop below, read by the 3D view. */
  const simRef = useRef<SimView>(null as unknown as SimView)
  if (!simRef.current || simRef.current.level !== level || simRef.current.mode !== mode)
    simRef.current = { level, mode, s: initialState(level, mode) }
  /** The 💡 Hint replay in progress: the stored route, its cursor, speed. */
  const hintRef = useRef<{ route: RouteStep[]; c: { i: number }; speed: number } | null>(null)
  const [hint, setHint] = useState(false)
  const [hintSpeed, setHintSpeed] = useState(1)

  const [status, setStatus] = useState<Status>('ready')
  const [pups, setPups] = useState(0)
  const [spotted, setSpotted] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [caughtWho, setCaughtWho] = useState(-1)
  const [result, setResult] = useState<Result | null>(null)
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const [resetConfirm, setResetConfirm] = useState(false)
  /** A mode switch asked for mid-run, waiting on the confirm. */
  const [modeAsk, setModeAsk] = useState<Mode | null>(null)
  /** "Netted!" note: how many puppies the last net sent home (0 = hidden). */
  const [netted, setNetted] = useState(0)
  const [chasing, setChasing] = useState(false)
  const [run, setRun] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLSpanElement>(null)
  const keys = useRef(new Set<string>())
  /** A bark asked for (button / Space / B) — consumed by the next step. */
  const barkReq = useRef(false)
  const barkBtn = useRef<HTMLDivElement>(null)
  const barkSeenRef = useRef(barkTipSeen)
  barkSeenRef.current = barkTipSeen
  const setDataRef = useRef(setData)
  setDataRef.current = setData
  /** The fixed stick's latest output in MAP axes (written by its onChange —
   * zero React renders while steering). */
  const stick = useRef({ ix: 0, iy: 0 })
  const soundRef = useRef(sound)
  soundRef.current = sound
  const bestRef = useRef(records.bestMs)
  bestRef.current = records.bestMs

  /** Fresh attempt at the current level (also how a hint replay ends). */
  const restart = useCallback(() => {
    simRef.current = { level, mode, s: initialState(level, mode) }
    hintRef.current = null
    barkReq.current = false
    setHint(false)
    setStatus('ready')
    setPups(0)
    setSpotted(false)
    setHasKey(false)
    setHidden(false)
    setCaughtWho(-1)
    setResult(null)
    setNetted(0)
    setChasing(false)
    setRun((r) => r + 1)
  }, [level, mode])

  // A level or mode change starts fresh (the render above swapped the sim).
  useEffect(() => {
    setStatus('ready')
    setPups(0)
    setSpotted(false)
    setHasKey(false)
    setHidden(false)
    setCaughtWho(-1)
    setResult(null)
    setNetted(0)
    setChasing(false)
    hintRef.current = null
    setHint(false)
  }, [level, mode])

  /** 💡 Hint: replay the level's stored 3-star route as a ghost run — the
   * real sim (Classic rules, catchers exactly as in your run), fed by
   * `routeInput` instead of the stick — then back to ready. */
  const startHint = useCallback(() => {
    const code = HINTS[level.spec.id]
    if (!code) return
    const s = initialState(level, 'classic')
    start(s)
    simRef.current = { level, mode, s, ghost: true }
    hintRef.current = { route: decodeRoute(code), c: { i: 0 }, speed: 1 }
    barkReq.current = false
    setHintSpeed(1)
    setHint(true)
  }, [level, mode])
  const restartRef = useRef(restart)
  restartRef.current = restart
  // The "Netted!" note fades on its own.
  useEffect(() => {
    if (netted === 0) return
    const t = window.setTimeout(() => setNetted(0), NET_MS)
    return () => window.clearTimeout(t)
  }, [netted])

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
    let seen = { freed: 0, alert: 0, door: 0, key: 0, unlock: 0, hide: 0, bark: 0, heard: 0, net: 0, chase: 0 }
    let prevPups = 0
    let prevChasing = false
    let lastRing = -1
    let prevHidden = false
    let prevKey = false
    let seenS: unknown = null
    let prevStatus: Status = 'ready'
    let prevSpotted = false
    const input = (): [number, number] => {
      const st = stick.current
      if (st.ix !== 0 || st.iy !== 0) return [st.ix, st.iy]
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
        prevKey = s.hasKey
        prevHidden = s.hidden
        prevStatus = s.status
        prevSpotted = s.spotted
        prevPups = s.order.length
        prevChasing = false
      }
      const ghost = simRef.current.ghost === true
      const H = ghost ? hintRef.current : null
      if (s.status === 'ready' || s.status === 'play') {
        acc += dt * (H ? H.speed : 1)
        let n = 0
        while (acc >= STEP && n < 16) {
          if (H) {
            // The hint replay: the stored route drives, the player doesn't.
            barkReq.current = false
            const [ix, iy] = routeInput(s, H.route, H.c)
            step(lv, s, ix, iy)
          } else {
            const [ix, iy] = input()
            if (barkReq.current) {
              barkReq.current = false
              bark(lv, s)
            }
            step(lv, s, ix, iy)
          }
          acc -= STEP
          n++
          if (s.status !== 'play' && s.status !== 'ready') break
        }
        if (n === 16) acc = 0
      } else acc = 0

      const root = rootRef.current
      const sfx = soundRef.current
      if (s.ev.freed !== seen.freed) {
        if (sfx) playFreed()
        setPups(s.order.length)
        if (root) root.dataset.sfxFreed = String(Number(root.dataset.sfxFreed ?? 0) + 1)
      }
      if (s.ev.door !== seen.door && sfx) playDoor()
      if (s.ev.net !== seen.net) {
        if (sfx) playNet()
        setNetted(Math.max(1, prevPups - s.order.length))
        if (root) root.dataset.sfxNet = String(Number(root.dataset.sfxNet ?? 0) + 1)
      }
      if (s.ev.chase !== seen.chase) {
        if (sfx) playChase()
        if (root) root.dataset.sfxChase = String(Number(root.dataset.sfxChase ?? 0) + 1)
      }
      if (s.order.length !== prevPups) {
        prevPups = s.order.length
        setPups(s.order.length)
      }
      const anyChase = s.status === 'play' && s.lure.some(isAlert)
      if (anyChase !== prevChasing) {
        prevChasing = anyChase
        setChasing(anyChase)
      }
      if (s.ev.key !== seen.key) {
        if (sfx) playKey()
        if (root) root.dataset.sfxKey = String(Number(root.dataset.sfxKey ?? 0) + 1)
      }
      if (s.ev.unlock !== seen.unlock) {
        if (sfx) playUnlock()
        if (root) root.dataset.sfxUnlock = String(Number(root.dataset.sfxUnlock ?? 0) + 1)
      }
      if (s.ev.bark !== seen.bark) {
        if (sfx) playBark()
        if (root) root.dataset.sfxBark = String(Number(root.dataset.sfxBark ?? 0) + 1)
        if (!barkSeenRef.current) setDataRef.current({ barkTipSeen: true })
      }
      if (s.ev.heard !== seen.heard && root) root.dataset.sfxHeard = String(Number(root.dataset.sfxHeard ?? 0) + 1)
      // The Bark button's recharge ring (a conic fill), written directly.
      const ring = Math.round((1 - s.barkCd / BARK_COOLDOWN) * 100)
      if (ring !== lastRing && barkBtn.current) {
        lastRing = ring
        barkBtn.current.style.background = `conic-gradient(#ffd60a ${ring}%, rgba(255,255,255,0.15) 0)`
        barkBtn.current.dataset.ready = ring >= 100 ? '1' : '0'
      }
      if (s.ev.hide !== seen.hide) {
        if (sfx) playRustle()
        if (root) root.dataset.sfxHide = String(Number(root.dataset.sfxHide ?? 0) + 1)
      }
      if (s.hidden !== prevHidden) {
        prevHidden = s.hidden
        setHidden(s.hidden)
      }
      if (s.hasKey !== prevKey) {
        prevKey = s.hasKey
        setHasKey(s.hasKey)
      }
      if (s.ev.alert !== seen.alert) {
        if (sfx) playAlert()
        if (root) root.dataset.sfxAlert = String(Number(root.dataset.sfxAlert ?? 0) + 1)
      }
      seen = { ...s.ev }
      if (s.spotted !== prevSpotted) {
        prevSpotted = s.spotted
        setSpotted(s.spotted)
      }
      if (s.status !== prevStatus && ghost) {
        // A ghost run never records anything: it ends back at ready.
        prevStatus = s.status
        if (s.status === 'escaped' || s.status === 'caught')
          window.setTimeout(() => {
            if (simRef.current.s === s) restartRef.current()
          }, HINT_END_MS)
      } else if (s.status !== prevStatus) {
        prevStatus = s.status
        setStatus(s.status)
        if (s.status === 'caught') {
          setCaughtWho(s.caughtWho)
          if (sfx) playCaught()
          if (root) root.dataset.sfxCaught = String(Number(root.dataset.sfxCaught ?? 0) + 1)
        } else if (s.status === 'escaped') {
          const stars = starsFor(lv, s)
          const ms = Math.round(s.t * 1000)
          const key = recordKey(s.mode, lv.spec.id)
          const prev = bestRef.current[key] ?? 0
          setResult({
            stars,
            ms,
            pups: s.order.length,
            total: puppyCount(lv),
            spotted: s.spotted,
            newBest: prev === 0 || ms < prev,
          })
          dispatch(recordRescueEscape({ key, stars, ms }))
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
        ds.key = s.hasKey ? '1' : '0'
        ds.hidden = s.hidden ? '1' : '0'
        ds.barkCd = s.barkCd.toFixed(2)
        ds.lured = String(s.lure.reduce((m, l, g) => (l ? m | (1 << g) : m), 0))
        ds.chasing = String(s.lure.reduce((m, l, g) => (isAlert(l) ? m | (1 << g) : m), 0))
        ds.nets = String(s.ev.net)
        ds.hint = ghost ? '1' : '0'
        ds.pen = s.penOpen ? '1' : '0'
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
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape' && simRef.current.ghost) {
        restartRef.current()
        return
      }
      if (e.key === ' ' || e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        unlockAudio()
        if (!e.repeat) barkReq.current = true
        return
      }
      if (!KEY_DIRS[e.key]) return
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

  /* ---- the fixed stick: any direction, full speed past the dead zone */
  const onStick = useCallback((x: number, y: number) => {
    const m = Math.hypot(x, y)
    const st = stick.current
    if (m < STICK_DEAD) {
      st.ix = 0
      st.iy = 0
    } else {
      // Stick up (+y) = up the map (−y): the camera looks from the bottom edge.
      st.ix = x / m
      st.iy = -y / m
    }
  }, [])

  const goTo = (i: number) => {
    if (i === levelIdx) restart()
    else setData({ level: i })
  }
  /** Switching rules restarts the level — confirm-guarded mid-run. */
  const pickMode = (m: Mode) => {
    if (m === mode) return
    if (status === 'play') setModeAsk(m)
    else setData({ mode: m })
  }

  const myStars = starsOf(levelIdx)
  const myBest = records.bestMs[recordKey(mode, spec.id)] ?? 0
  const next = levelIdx + 1 < LEVELS.length ? levelIdx + 1 : -1
  const total = puppyCount(level)
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
      data-stick={stickSide}
      data-mode={mode}
      data-theme={themeId}
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
            const got = idx.reduce((n, i) => n + starsOf(i), 0)
            return (
              <optgroup key={tier} label={`${TIER_LABEL[tier]} · ★${got}/${idx.length * 3}`}>
                {idx.map((i) => (
                  <option key={i} value={i} disabled={!unlocked(i)}>
                    {unlocked(i)
                      ? `${levelLabel(i)} · ${LEVELS[i].name} ${starText(starsOf(i))}`
                      : `🔒 ${levelLabel(i)}`}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </NativeSelect>
        <NativeSelect
          value={mode}
          onChange={(e) => pickMode(e.target.value as Mode)}
          data-testid="puppy-mode"
          inputProps={{ 'aria-label': 'Mode' }}
          sx={{ flexShrink: 0, fontSize: 14 }}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </NativeSelect>
        {hidden && (
          <Box
            data-testid="puppy-hidden"
            title="Hidden in a bush"
            sx={{ display: 'flex', alignItems: 'center', px: 0.5, borderRadius: 1, bgcolor: '#2e7d32', color: 'common.white' }}
          >
            <VisibilityOffIcon sx={{ fontSize: 16 }} />
          </Box>
        )}
        {hasKey && (
          <KeyIcon data-testid="puppy-key" fontSize="small" sx={{ color: '#f5b301' }} titleAccess="Carrying the key" />
        )}
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

      {/* The tip: a slim banner ABOVE the maze (never over it — the door and
          cages stay visible while you read), gone on the first move. */}
      {status === 'ready' && !hint && (
        <Box
          data-testid="puppy-tip"
          sx={{
            flexShrink: 0,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: theme.strip,
            color: 'common.white',
            textAlign: 'center',
            lineHeight: 1.25,
          }}
        >
          <Typography variant="caption" component="div" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
            {levelLabel(levelIdx)} · {spec.name}
            <Box component="span" sx={{ fontWeight: 400, opacity: 0.75 }}>
              {' '}
              — move to start
            </Box>
          </Typography>
          {spec.tip && (
            <Typography variant="caption" component="div" sx={{ opacity: 0.9, lineHeight: 1.3 }}>
              {spec.tip}
            </Typography>
          )}
          {mode !== 'classic' && (
            <Typography
              data-testid="puppy-mode-tip"
              variant="caption"
              component="div"
              sx={{ color: mode === 'easy' ? '#7ee787' : '#ff8a80', lineHeight: 1.3 }}
            >
              {MODE_TIP[mode]}
            </Typography>
          )}
          {!barkTipSeen && (
            <Typography data-testid="puppy-bark-tip" variant="caption" component="div" sx={{ color: '#ffd60a', lineHeight: 1.3 }}>
              New: BARK (or Space) lures the nearest catcher over — then sneak past. Recharges in {BARK_COOLDOWN} s.
            </Typography>
          )}
        </Box>
      )}

      <Box
        data-testid="puppy-stage"
        sx={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 1, overflow: 'hidden', touchAction: 'none', bgcolor: theme.surround }}
      >
        <Box data-testid="puppy-3d" sx={{ position: 'absolute', inset: 0 }}>
          <Suspense
            fallback={
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            }
          >
            <PuppyRescue3D sim={simRef} levelKey={`${spec.id}`} theme={themeId} />
          </Suspense>
        </Box>

        {hint && (
          <Box
            data-testid="puppy-hint-overlay"
            onPointerDown={restart}
            sx={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                alignItems: 'center',
                px: 1.25,
                py: 0.25,
                borderRadius: 2,
                bgcolor: theme.strip,
                color: 'common.white',
                whiteSpace: 'nowrap',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                💡 Hint — tap to skip
              </Typography>
              <Button
                size="small"
                variant="outlined"
                data-testid="puppy-hint-speed"
                data-speed={hintSpeed}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  const v = hintSpeed === 1 ? 2 : 1
                  if (hintRef.current) hintRef.current.speed = v
                  setHintSpeed(v)
                }}
                sx={{ minWidth: 0, py: 0, px: 0.75, color: 'common.white', borderColor: 'rgba(255,255,255,0.5)' }}
              >
                {hintSpeed === 1 ? '⏩ 2×' : '1×'}
              </Button>
            </Stack>
          </Box>
        )}

        {netted > 0 && status === 'play' && (
          <Box
            data-testid="puppy-netted"
            data-count={netted}
            sx={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              px: 1.25,
              py: 0.25,
              borderRadius: 2,
              bgcolor: 'rgba(0,0,0,0.65)',
              color: 'common.white',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              Netted! {netted === 1 ? '1 puppy' : `${netted} puppies`} back in the cage{netted === 1 ? '' : 's'}
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
              <Typography variant="body2">
                {caughtWho >= 0
                  ? 'A catcher spotted a puppy.'
                  : mode === 'arcade'
                    ? 'A catcher caught up with you.'
                    : 'A catcher spotted you.'}
              </Typography>
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
              {mode !== 'classic' && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
                  {MODE_LABEL[mode]} mode
                </Typography>
              )}
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
          {mode !== 'classic' && (
            <Box
              data-testid="puppy-mode-badge"
              data-mode={mode}
              data-chasing={chasing ? '1' : '0'}
              title={chasing ? 'Being chased!' : `${MODE_LABEL[mode]} mode`}
              sx={{
                px: 0.75,
                borderRadius: 1,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: 0.5,
                lineHeight: '18px',
                color: 'common.white',
                bgcolor: mode === 'easy' ? '#2e7d32' : '#d32f2f',
                animation: chasing ? 'puppyChase 0.5s ease-in-out infinite alternate' : 'none',
                '@keyframes puppyChase': { from: { opacity: 1 }, to: { opacity: 0.45 } },
              }}
            >
              {chasing ? 'CHASE!' : MODE_LABEL[mode].toUpperCase()}
            </Box>
          )}
          <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
            {starText(myStars)}
            {myBest ? ` · ${fmtTime(myBest)}` : ''}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          {status === 'ready' && !hint && HINTS[spec.id] && (
            <Button
              size="small"
              data-testid="puppy-hint"
              startIcon={<LightbulbIcon fontSize="small" />}
              onClick={startHint}
              sx={{ py: 0, minWidth: 0, textTransform: 'none', color: '#f5b301', fontWeight: 700 }}
            >
              Hint
            </Button>
          )}
          <IconButton size="small" aria-label="Restart" data-testid="puppy-restart" onClick={restart}>
            <RestartIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* The fixed stick, in its own strip under the maze: it never moves,
          so the thumb has a home, and it never covers the board. */}
      <Box
        data-testid="puppy-stick-strip"
        data-side={stickSide}
        onPointerDownCapture={() => unlockAudio()}
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: stickSide === 'left' ? 'flex-start' : stickSide === 'right' ? 'flex-end' : 'center',
          px: 1,
          borderRadius: 1,
          bgcolor: theme.strip,
          position: 'relative',
        }}
      >
        <VirtualJoystick size={STICK_SIZE} label="MOVE" testId="puppy-stick" onChange={onStick} sx={{ py: 0.75 }} />
        {/* Bark: opposite the stick. The ring fills as it recharges. */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            ...(stickSide === 'right' ? { left: 16 } : { right: 16 }),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Box
            ref={barkBtn}
            role="button"
            aria-label="Bark"
            data-testid="puppy-bark"
            data-ready="1"
            onPointerDown={(e) => {
              e.stopPropagation()
              unlockAudio()
              barkReq.current = true
            }}
            sx={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              p: '4px',
              background: 'conic-gradient(#ffd60a 100%, rgba(255,255,255,0.15) 0)',
              cursor: 'pointer',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <Box
              sx={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                bgcolor: theme.strip2,
                color: 'common.white',
                display: 'grid',
                placeItems: 'center',
                fontSize: 22,
              }}
            >
              🐾
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', letterSpacing: 1, lineHeight: 1 }}>
            BARK
          </Typography>
        </Box>
      </Box>

      <Menu anchorEl={menuEl} open={menuEl !== null} onClose={() => setMenuEl(null)}>
        <MenuItem onClick={() => setData({ sound: !sound })} data-testid="puppy-sound">
          <ListItemText>Sound</ListItemText>
          <Switch size="small" checked={sound} edge="end" />
        </MenuItem>
        <MenuItem onClick={() => setData({ unlockAll: !unlockAll })} data-testid="puppy-unlock-all">
          <ListItemText>Unlock all levels</ListItemText>
          <Switch size="small" checked={unlockAll} edge="end" />
        </MenuItem>
        <MenuItem disableRipple sx={{ gap: 1 }}>
          <ListItemText>Stick</ListItemText>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={stickSide}
            onChange={(_, v: StickSide | null) => v && setData({ stickSide: v })}
          >
            {(['left', 'center', 'right'] as const).map((v) => (
              <ToggleButton key={v} value={v} data-testid={`puppy-stick-${v}`} sx={{ py: 0.1, px: 1, textTransform: 'none' }}>
                {v === 'center' ? 'Centre' : v === 'left' ? 'Left' : 'Right'}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </MenuItem>
        <MenuItem disableRipple sx={{ gap: 1 }} data-testid="puppy-theme">
          <ListItemText>Theme</ListItemText>
          <Stack direction="row" spacing={0.75}>
            {THEMES.map((t) => (
              <Box
                key={t.id}
                role="button"
                aria-label={t.name}
                aria-pressed={t.id === themeId}
                title={t.name}
                data-testid={`puppy-theme-${t.id}`}
                onClick={() => setData({ theme: t.id })}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  // Split chip: the floor over the surround.
                  background: `linear-gradient(135deg, ${t.floor} 50%, ${t.surround} 50%)`,
                  boxShadow: t.id === themeId ? '0 0 0 2px #fff, 0 0 0 4px #1976d2' : '0 0 0 1px rgba(0,0,0,0.25)',
                }}
              />
            ))}
          </Stack>
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
      <ConfirmDialog
        open={modeAsk !== null}
        title={`Switch to ${modeAsk ? MODE_LABEL[modeAsk] : ''}?`}
        message="Changing the rules restarts this level."
        confirmLabel="Switch and restart"
        cancelLabel="Keep playing"
        onConfirm={() => {
          if (modeAsk) setData({ mode: modeAsk })
          setModeAsk(null)
        }}
        onCancel={() => setModeAsk(null)}
      />
    </Box>
  )
}
