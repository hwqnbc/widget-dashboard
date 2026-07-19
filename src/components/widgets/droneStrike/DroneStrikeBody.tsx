import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { defaultWidgetData } from '../../../features/widgets/widgetCatalog'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, DUSK_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import type { BatteryEvent, BatteryState, FlightMode, Tuning, Weather } from '../droneSim/flightModel'
import {
  MAX_SPEED_MULT,
  TURBO_BOOST,
  coerceFlightMode,
  coerceWeather,
  createBatteryState,
  createControlInput,
  createFlightState,
  resetBatteryState,
  resetFlightState,
} from '../droneSim/flightModel'
import { DEFAULT_SEED, buildWorldLayout } from '../droneSim/worldLayout'
import { CRASH_PULSE, GATE_PULSE, LAP_PULSE, vibrate } from '../droneSim/haptics'
import {
  DRONE_KEYS,
  applyExternal,
  createExternalSample,
  createExternalState,
  keySetToSample,
} from '../droneSim/externalInput'
import WorldScene from '../droneSim/WorldScene'
import RichWorld from '../droneSim/RichWorld'
import RainField from '../droneSim/RainField'
import VirtualJoystick from '../droneSim/VirtualJoystick'
import ConfirmDialog from '../ConfirmDialog'
import type { AimAssistLevel } from './combatModel'
import {
  BOLT,
  clearProjectiles,
  coerceAimAssist,
  createCombatState,
  resetCombatState,
} from './combatModel'
import { ENEMY_FIRE_WAVE, buildWave, createTargetStates, loadWave } from './waveLayout'
import { createEnemyAIStates, seedEnemyAIStates } from './enemyAI'
import type { StrikeView } from './aimModel'
import { ZOOM_SENS, coerceStrikeView, createAimOffset } from './aimModel'
import StrikeCameraRig from './StrikeCameraRig'
import type { CrashState } from './StrikeRig'
import StrikeRig from './StrikeRig'
import Targets from './Targets'
import EnemyDrones from './EnemyDrones'
import Tracers from './Tracers'
import Reticle from './Reticle'
import FireButton from './FireButton'
import type { HitMarker } from './HitMarkers'
import HitMarkers from './HitMarkers'
import DamageVignette from './DamageVignette'
import SafePadRing from './SafePadRing'
import StrikeMinimap from './StrikeMinimap'
import StrikeSettingsPanel from './StrikeSettingsPanel'
import ScopeButton from './ScopeButton'
import type { AimMode } from './gimbalModel'
import {
  DRAG_SENS,
  coerceAimMode,
  createGimbalState,
  resetGimbal,
  slewGimbal,
} from './gimbalModel'
import type { GyroMode } from './gyroAim'
import { attachGyro, coerceGyroMode, createGyroState } from './gyroAim'

const clampNum = (lo: number, hi: number) => (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : undefined
const coerceRate = clampNum(0.5, 2)
const coerceExpo = clampNum(0, 0.8)

type WavePhase = 'intro' | 'active' | 'cleared' | 'failed'

/** WAVE N banner hold before the targets spawn. */
const INTRO_MS = 1600
/** WAVE CLEARED! hold before the next intro. */
const CLEARED_MS = 2000
/** WAVE FAILED hold before the same wave restarts. */
const FAILED_MS = 2500
/** Enemy-bolt hits the player survives per wave attempt. */
const PLAYER_HP = 3

/** What "Reset settings" restores — every settings-panel field, sourced
 * from the catalog defaults. Records, view and the city seed are kept. */
const SETTING_KEYS = [
  'autoFire',
  'aimAssist',
  'aimMode',
  'gyroAim',
  'crashes',
  'battery',
  'weather',
  'richWorld',
  'minimap',
  'flightMode',
  'rateSpeed',
  'rateYaw',
  'stickExpo',
  'turbo',
] as const
const SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  SETTING_KEYS.map((k) => [k, defaultWidgetData('droneStrike')[k]]),
)

/**
 * Flash the DamageVignette to full strength and let it ease back to its
 * resting opacity (0, or the faint low-HP edge). Clearing the transition +
 * forcing a reflow makes back-to-back hits re-trigger cleanly; restoring
 * `opacity: ''` hands control back to the stylesheet value. Lives here
 * (not in DamageVignette.tsx) so that file exports only the component.
 */
function flashVignette(el: HTMLDivElement | null): void {
  if (!el) return
  el.dataset.flash = String((parseInt(el.dataset.flash ?? '0', 10) || 0) + 1)
  el.style.transition = 'none'
  el.style.opacity = '1'
  void el.offsetWidth // reflow: the fade below starts from 1, not mid-tween
  el.style.transition = 'opacity 600ms ease-out'
  el.style.opacity = ''
}

/**
 * The FPV shooting game. Same architecture as the drone sim: everything
 * inside <Canvas> is a separate React root (theme values resolved out here
 * and passed down), and all high-frequency state — sticks, flight, combat
 * pools, targets, the fire trigger — lives in shared mutable refs so flying
 * and shooting never re-render React. Only wave transitions and best-score
 * persistence touch redux.
 */
export default function DroneStrikeBody({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const mode = useTheme().palette.mode
  const weather = useWidgetField<Weather>(id, 'weather', 'clear', coerceWeather)
  const palette =
    weather === 'storm'
      ? DUSK_PALETTE
      : mode === 'dark'
        ? NIGHT_PALETTE
        : DAY_PALETTE
  const { fullscreen } = usePresentation()

  const worldSeed = useWidgetField(id, 'worldSeed', DEFAULT_SEED)
  const view = useWidgetField<StrikeView>(id, 'view', 'fp', coerceStrikeView)
  const minimap = useWidgetField(id, 'minimap', true)
  const bestWave = useWidgetField(id, 'bestWave', 0)
  const bestScore = useWidgetField(id, 'bestScore', 0)
  const autoFire = useWidgetField(id, 'autoFire', false)
  const aimAssist = useWidgetField<AimAssistLevel>(id, 'aimAssist', 'mild', coerceAimAssist)
  const gyroMode = useWidgetField<GyroMode>(id, 'gyroAim', 'off', coerceGyroMode)
  const aimMode = useWidgetField<AimMode>(id, 'aimMode', 'gimbal', coerceAimMode)
  const richWorld = useWidgetField(id, 'richWorld', true)
  const rateSpeed = useWidgetField(id, 'rateSpeed', 1, coerceRate)
  const rateYaw = useWidgetField(id, 'rateYaw', 1, coerceRate)
  const stickExpo = useWidgetField(id, 'stickExpo', 0, coerceExpo)
  const flightMode = useWidgetField<FlightMode>(id, 'flightMode', 'hold', coerceFlightMode)
  const turbo = useWidgetField(id, 'turbo', false)
  const battery = useWidgetField(id, 'battery', false)
  const crashes = useWidgetField(id, 'crashes', true)

  // The world is the same seeded city as the drone sim; the course gates are
  // simply unused here (targets come from waveLayout instead).
  const layout = useMemo(() => buildWorldLayout(worldSeed), [worldSeed])

  const controls = useRef(createControlInput()).current
  const flight = useRef(createFlightState()).current
  const combat = useRef(createCombatState()).current
  const targets = useRef(createTargetStates()).current
  const enemyAI = useRef(createEnemyAIStates()).current
  const aimRef = useRef(createAimOffset())
  const externalRef = useRef(createExternalState())
  const fireHeldRef = useRef(false)
  const scoreRef = useRef(0)
  const windRef = useRef({ x: 0, y: 0 })
  const hudRef = useRef<HTMLDivElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const scoreChipRef = useRef<HTMLDivElement>(null)
  const vignetteRef = useRef<HTMLDivElement>(null)
  const batteryRef = useRef<BatteryState>(createBatteryState())
  const batteryBarRef = useRef<HTMLDivElement>(null)
  const crashRef = useRef<CrashState>({ active: false, until: 0, spinX: 0, spinZ: 0 })
  const padStateRef = useRef<'idle' | 'active'>('idle')
  const padChipRef = useRef<HTMLDivElement>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minimapDroneRef = useRef<SVGGElement>(null)
  const minimapTargetRefs = useRef<(SVGCircleElement | null)[]>([])
  const markerId = useRef(0)

  // Live root height (ResizeObserver) — drives the touch-control sizing.
  // Resize/rotate/fullscreen transitions only; never per-frame.
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootH, setRootH] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setRootH(Math.round(entries[0].contentRect.height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [wave, setWave] = useState(1)
  const [phase, setPhase] = useState<WavePhase>('intro')
  const [banner, setBanner] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | 'restart' | 'shuffle'>(null)
  const [hp, setHp] = useState(PLAYER_HP)
  const [markers, setMarkers] = useState<HitMarker[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ADS zoom — transient, FPV-only. Toggled by the scope button, held by
  // Shift / right mouse / gamepad LT.
  const [zoom, setZoom] = useState(false)
  const gyroRef = useRef(createGyroState())
  const gimbalRef = useRef(createGimbalState())
  // Timestamp of the last manual aim input (drag / hover stick) — the rig's
  // idle return-to-boresight waits on it. Seeded far in the past.
  const aimInputRef = useRef(0)

  // Switching aim-control modes recenters the gimbal (a fresh start for
  // comparing the modes; centred gimbal = classic fly-to-aim).
  useEffect(() => {
    resetGimbal(gimbalRef.current)
  }, [aimMode])

  // ADS is an FPV feature: leaving the gun cam drops the scope.
  useEffect(() => {
    if (view !== 'fp') setZoom(false)
  }, [view])

  // Gyro fine-aim: device tilt writes the shared aim offset while the mode
  // says so — 'always', or 'zoom' only while scoped (the classic
  // scope-gyro). Detaching zeroes the offset, so the reticle snaps straight.
  useEffect(() => {
    if (gyroMode === 'always' || (gyroMode === 'zoom' && zoom)) {
      return attachGyro(gyroRef.current, aimRef.current)
    }
  }, [gyroMode, zoom])

  // Wave state machine: intro (banner) → active (targets live) → cleared
  // (banner) → next intro; a failed wave (hp 0) restarts itself with fresh
  // targets and hp. Timers cleaned up on every transition/unmount.
  useEffect(() => {
    // A pending transient banner (battery events) must not clobber the
    // phase banner this effect is about to own.
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    if (phase === 'intro') {
      setBanner(`WAVE ${wave}`)
      setHp(PLAYER_HP)
      const t = setTimeout(() => {
        clearProjectiles(combat)
        loadWave(targets, buildWave(worldSeed, wave, layout))
        seedEnemyAIStates(enemyAI, targets)
        setPhase('active')
        setBanner(null)
      }, INTRO_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'cleared') {
      setBanner('WAVE CLEARED!')
      const t = setTimeout(() => {
        setWave((w) => w + 1)
        setPhase('intro')
      }, CLEARED_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'failed') {
      setBanner('WAVE FAILED — TRY AGAIN')
      const t = setTimeout(() => setPhase('intro'), FAILED_MS)
      return () => clearTimeout(t)
    }
  }, [phase, wave, worldSeed, layout, targets, combat, enemyAI])

  // Out of hit points mid-wave → the wave is failed.
  useEffect(() => {
    if (hp <= 0 && phase === 'active') setPhase('failed')
  }, [hp, phase])

  const onWaveCleared = useCallback(() => {
    const score = scoreRef.current
    const data: Record<string, unknown> = {}
    if (wave > bestWave) data.bestWave = wave
    if (score > bestScore) data.bestScore = score
    if (Object.keys(data).length > 0) dispatch(updateWidgetData({ id, data }))
    setPhase('cleared')
  }, [wave, bestWave, bestScore, dispatch, id])

  const onTargetDown = useCallback((points: number) => {
    const idNum = ++markerId.current
    setMarkers((m) => [...m.slice(-3), { id: idNum, points }])
    window.setTimeout(() => {
      setMarkers((m) => m.filter((x) => x.id !== idNum))
    }, 900)
  }, [])

  const onPlayerHit = useCallback(() => {
    flashVignette(vignetteRef.current)
    setHp((h) => Math.max(0, h - 1))
  }, [])

  /** Transient banner (battery events) — auto-clears; the wave state
   * machine cancels it whenever it takes the banner over. */
  const showBanner = useCallback((text: string, ms = 2500) => {
    setBanner(text)
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBanner(null), ms)
  }, [])
  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    },
    [],
  )

  const onBatteryEvent = useCallback(
    (event: BatteryEvent) => {
      if (event === 'low') {
        vibrate(GATE_PULSE)
        showBanner('LOW BATTERY!')
      } else if (event === 'died') {
        vibrate(CRASH_PULSE)
        showBanner('BATTERY DEAD — AUTO-LANDING')
      } else {
        vibrate(LAP_PULSE)
        showBanner('RECHARGED!')
      }
    },
    [showBanner],
  )

  // Toggling battery mode always restarts from a full charge.
  useEffect(() => {
    resetBatteryState(batteryRef.current)
  }, [battery])

  // Crash: the tumble costs a heart (same feedback as taking a bolt);
  // the end of the tumble respawns the drone on the pad.
  const onCrash = useCallback(() => {
    flashVignette(vignetteRef.current)
    setHp((h) => Math.max(0, h - 1))
    showBanner('CRASHED!')
  }, [showBanner])

  const onCrashEnd = useCallback(() => {
    resetFlightState(flight)
  }, [flight])

  // Resting on the pad mid-wave restores hearts — the survival valve for
  // the harder waves.
  const onHeal = useCallback(() => {
    setHp((h) => Math.min(PLAYER_HP, h + 1))
    vibrate(GATE_PULSE)
    showBanner('♥ RESTORED', 1500)
  }, [showBanner])

  // Drag-to-aim (all modes): a pointer on the free scene area slews the
  // gimbal, PUBG-style. A quick mouse click (no movement) still fires; a
  // double-tap/double-click recenters the gimbal. The drag pointer gets
  // the joystick lesson's release hardening — a stuck drag id would block
  // every future drag.
  const dragRef = useRef({ id: -1, x: 0, y: 0, moved: false, downMs: 0, lastTapMs: 0 })
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const firePulse = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseDrag = useCallback(() => {
    dragRef.current.id = -1
  }, [])
  useEffect(() => {
    const onWindowUp = (e: PointerEvent) => {
      // Genuine fallback only: a pointerup that targets the (capturing)
      // canvas box reaches its own handler, which owns the tap/double-tap
      // logic — this capture-phase listener must not release the id first.
      const el = canvasBoxRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      if (e.pointerId === dragRef.current.id) releaseDrag()
    }
    const onBlur = () => releaseDrag()
    window.addEventListener('pointerup', onWindowUp, true)
    window.addEventListener('pointercancel', onWindowUp, true)
    window.addEventListener('blur', onBlur)
    const poll = window.setInterval(() => {
      const d = dragRef.current
      const el = canvasBoxRef.current
      if (d.id !== -1 && el && !el.hasPointerCapture(d.id)) releaseDrag()
    }, 400)
    return () => {
      window.removeEventListener('pointerup', onWindowUp, true)
      window.removeEventListener('pointercancel', onWindowUp, true)
      window.removeEventListener('blur', onBlur)
      window.clearInterval(poll)
      if (firePulse.current) clearTimeout(firePulse.current)
    }
  }, [releaseDrag])

  const restart = () => {
    setConfirm(null)
    resetFlightState(flight)
    resetCombatState(combat)
    resetBatteryState(batteryRef.current)
    crashRef.current.active = false
    resetGimbal(gimbalRef.current)
    for (const t of targets) t.alive = false
    scoreRef.current = 0
    setMarkers([])
    setWave(1)
    setPhase('intro')
  }

  const shuffleWorld = () => {
    dispatch(
      updateWidgetData({
        id,
        data: { worldSeed: Math.floor(Math.random() * 0x100000000) },
      }),
    )
    restart()
  }

  const hasProgress = () => wave > 1 || scoreRef.current > 0

  const requestRestart = () => {
    // Only bother confirming when there's progress to lose.
    if (hasProgress()) setConfirm('restart')
    else restart()
  }

  const requestNewWorld = () => {
    setSettingsOpen(false)
    if (hasProgress()) setConfirm('shuffle')
    else shuffleWorld()
  }

  const resetDefaults = () => {
    dispatch(updateWidgetData({ id, data: { ...SETTING_DEFAULTS } }))
  }

  // Keyboard: the drone sim's flight keys plus Space to fire. Typing in
  // other widgets keeps its keys (editable targets are ignored).
  useEffect(() => {
    const keys = new Set<string>()
    const sample = createExternalSample()
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    const push = () => {
      keySetToSample(keys, sample)
      applyExternal(externalRef.current, 'keyboard', sample, controls)
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        fireHeldRef.current = true
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setZoom(true) // hold-to-scope on desktop
        return
      }
      if (!DRONE_KEYS.has(e.code)) return
      e.preventDefault()
      if (keys.has(e.code)) return
      keys.add(e.code)
      push()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        fireHeldRef.current = false
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setZoom(false)
        return
      }
      if (!keys.delete(e.code)) return
      push()
    }
    const onBlur = () => {
      fireHeldRef.current = false
      setZoom(false)
      if (keys.size > 0) {
        keys.clear()
        push()
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
  }, [controls])

  // Turbo stacks under the hard cap; scoped aim is slower (2× view
  // magnifies motion) — flight speed untouched by zoom.
  const tuning = useMemo<Tuning>(() => {
    const boost = turbo ? TURBO_BOOST : 1
    return {
      speed: Math.min(MAX_SPEED_MULT, rateSpeed * boost),
      yaw: Math.min(MAX_SPEED_MULT, rateYaw * boost) * (zoom ? ZOOM_SENS : 1),
      expo: stickExpo,
    }
  }, [rateSpeed, rateYaw, stickExpo, turbo, zoom])

  const toggleView = () =>
    dispatch(updateWidgetData({ id, data: { view: view === 'fp' ? 'tp' : 'fp' } }))

  const onLeftStick = useCallback(
    (x: number, y: number) => {
      controls.left.x = x
      controls.left.y = y
    },
    [controls],
  )
  const onRightStick = useCallback(
    (x: number, y: number) => {
      controls.right.x = x
      controls.right.y = y
    },
    [controls],
  )

  // Touch-control sizing is responsive to the widget's REAL height — a
  // phone in landscape fullscreen has ~330 CSS px, where the old fixed
  // fullscreen sizes stacked the fire button onto the top toolbar and
  // pushed the scope button off-screen entirely.
  const stickMax = fullscreen ? 140 : 88
  const stickSize =
    rootH > 0 ? Math.round(Math.min(stickMax, Math.max(72, rootH * 0.28))) : stickMax
  const stickInset = fullscreen ? 16 : 0
  const fireSize = Math.max(48, Math.round(stickSize * 0.72))
  const scopeSize = Math.max(36, Math.round(stickSize * 0.46))
  // Fire + scope sit in a column INWARD of the right stick (mobile-shooter
  // convention) — the layout consumes width, which landscape always has,
  // instead of height, which a phone doesn't.
  const bottomBase = fullscreen ? `max(${stickInset}px, env(safe-area-inset-bottom))` : '0px'
  const fireRight = stickInset + stickSize + 40
  const fireBottom = Math.round(stickSize * 0.35)
  const scopeRight = fireRight + Math.round((fireSize + 24 - scopeSize - 16) / 2)
  const scopeBottom = fireBottom + fireSize + 30
  // Hearts matter from the first wall once crashes cost one — show the row
  // whenever it can change (crash mode on, or enemies shooting).
  const hpVisible = crashes || wave >= ENEMY_FIRE_WAVE

  return (
    <Box
      ref={rootRef}
      className="widget-no-drag"
      data-testid="drone-strike-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      data-view={view}
      data-auto-fire={autoFire ? 'on' : 'off'}
      data-aim-assist={aimAssist}
      data-gyro={gyroMode}
      data-minimap={minimap ? 'on' : 'off'}
      data-zoom={zoom ? 'on' : 'off'}
      data-weather={weather}
      data-rich={richWorld ? 'on' : 'off'}
      data-mode={flightMode}
      data-turbo={turbo ? 'on' : 'off'}
      data-battery={battery ? 'on' : 'off'}
      data-crashes={crashes ? 'on' : 'off'}
      data-aim-mode={aimMode}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 1,
      }}
    >
      <Box
        ref={canvasBoxRef}
        data-testid="strike-canvas"
        sx={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        // The free scene area is the aim surface: drag (touch or left
        // mouse) slews the gimbal; a quick mouse click still fires; a
        // double-tap/double-click recenters; right mouse holds the scope.
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button === 2) {
            setZoom(true)
            return
          }
          if (e.pointerType === 'mouse' && e.button !== 0) return
          const d = dragRef.current
          if (d.id !== -1) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            return
          }
          d.id = e.pointerId
          d.x = e.clientX
          d.y = e.clientY
          d.moved = false
          d.downMs = performance.now()
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (e.pointerId !== d.id) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true
          if (d.moved) {
            const sens = DRAG_SENS * (zoom ? 0.5 : 1)
            // Drag right aims right (yaw decreases — yaw+ is left); drag
            // up aims up.
            slewGimbal(gimbalRef.current, -dx * sens, -dy * sens)
            aimInputRef.current = performance.now()
            d.x = e.clientX
            d.y = e.clientY
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse' && e.button === 2) {
            setZoom(false)
            return
          }
          const d = dragRef.current
          if (e.pointerId !== d.id) return
          const now = performance.now()
          const tap = !d.moved && now - d.downMs < 400
          releaseDrag()
          if (!tap) return
          if (now - d.lastTapMs < 500) {
            // Double-tap: recenter the gimbal (back to fly-to-aim).
            d.lastTapMs = 0
            resetGimbal(gimbalRef.current)
          } else {
            d.lastTapMs = now
            if (e.pointerType === 'mouse') {
              // Single click still fires one shot.
              fireHeldRef.current = true
              if (firePulse.current) clearTimeout(firePulse.current)
              firePulse.current = setTimeout(() => {
                fireHeldRef.current = false
              }, 120)
            }
          }
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === dragRef.current.id) releaseDrag()
        }}
        onLostPointerCapture={(e) => {
          if (e.pointerId === dragRef.current.id) releaseDrag()
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Canvas
          frameloop="always"
          dpr={[1, 1.75]}
          camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 26] }}
        >
          <WorldScene palette={palette} buildings={layout.buildings} />
          <SafePadRing stateRef={padStateRef} />
          {richWorld && <RichWorld layout={layout} />}
          {weather === 'storm' && <RainField flight={flight} wind={windRef.current} />}
          <Targets targets={targets} />
          <EnemyDrones targets={targets} />
          <Tracers combat={combat} tracerLen={BOLT.tracerLen} />
          <StrikeRig
            controls={controls}
            flight={flight}
            external={externalRef}
            fireHeldRef={fireHeldRef}
            tuning={tuning}
            flightMode={flightMode}
            colliders={layout.colliders}
            weather={weather}
            windRef={windRef}
            batteryMode={battery}
            batteryRef={batteryRef}
            batteryBarRef={batteryBarRef}
            onBatteryEvent={onBatteryEvent}
            crashMode={crashes}
            crashRef={crashRef}
            onCrash={onCrash}
            onCrashEnd={onCrashEnd}
            canHeal={phase === 'active' && hp > 0 && hp < PLAYER_HP}
            onHeal={onHeal}
            padStateRef={padStateRef}
            padChipRef={padChipRef}
            targets={targets}
            enemyAI={enemyAI}
            enemiesShoot={wave >= ENEMY_FIRE_WAVE}
            combat={combat}
            aimRef={aimRef}
            weapon={BOLT}
            assist={aimAssist}
            autoFire={autoFire}
            waveActive={phase === 'active'}
            wave={wave}
            hp={hp}
            zoom={zoom}
            onZoomHold={setZoom}
            aimMode={aimMode}
            gimbalRef={gimbalRef}
            aimInputRef={aimInputRef}
            scoreRef={scoreRef}
            onWaveCleared={onWaveCleared}
            onTargetDown={onTargetDown}
            onPlayerHit={onPlayerHit}
            hudRef={hudRef}
            reticleRef={reticleRef}
            scoreChipRef={scoreChipRef}
            minimapDroneRef={minimapDroneRef}
            minimapTargetRefs={minimapTargetRefs}
          />
          <StrikeCameraRig
            view={view}
            flight={flight}
            aimRef={aimRef}
            colliders={layout.colliders}
            zoom={zoom}
            flightMode={flightMode}
            aimMode={aimMode}
            gimbalRef={gimbalRef}
          />
        </Canvas>
      </Box>

      <DamageVignette ref={vignetteRef} lowHp={hp === 1} />

      <Box
        ref={hudRef}
        data-testid="strike-hud"
        data-alt="2.0"
        data-speed="0.0"
        data-x="0.00"
        data-z="18.00"
        data-yaw="0.000"
        data-wave={wave}
        data-wave-state={phase}
        data-score="0"
        data-shots="0"
        data-hits="0"
        data-targets-left="0"
        data-lock="-1"
        data-proj="0"
        data-hp="3"
        data-crash-state="none"
        data-safe="off"
        data-tgt-kind="none"
        data-input-source="touch"
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.4),
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        ALT 2.0m · SPD 0.0
      </Box>

      <Box
        ref={scoreChipRef}
        data-testid="strike-score"
        data-score="0"
        data-wave={wave}
        data-best-score={bestScore}
        data-best-wave={bestWave}
        sx={{
          position: 'absolute',
          top: 36,
          left: 8,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.4),
          color: '#ffca28',
          fontFamily: 'monospace',
          fontSize: 12,
          pointerEvents: 'none',
        }}
      >
        {`WAVE ${wave} · SCORE 0`}
      </Box>

      {bestScore > 0 && (
        <Box
          data-testid="strike-best"
          sx={{
            position: 'absolute',
            top: 64,
            left: 8,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: alpha('#000', 0.4),
            color: '#80deea',
            fontFamily: 'monospace',
            fontSize: 12,
            pointerEvents: 'none',
          }}
        >
          {`BEST ${bestScore} · W${bestWave}`}
        </Box>
      )}

      {battery && (
        <Box
          data-testid="strike-battery"
          sx={{
            position: 'absolute',
            top: bestScore > 0 ? (hpVisible ? 120 : 92) : hpVisible ? 92 : 64,
            left: 8,
            width: 92,
            height: 8,
            borderRadius: 1,
            bgcolor: alpha('#000', 0.45),
            border: `1px solid ${alpha('#fff', 0.3)}`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Box
            ref={batteryBarRef}
            data-testid="strike-battery-fill"
            data-level="100"
            sx={{ height: '100%', width: '100%', bgcolor: '#66bb6a' }}
          />
        </Box>
      )}

      {hpVisible && (
        <Box
          data-testid="strike-hp"
          data-hp={hp}
          sx={{
            position: 'absolute',
            top: bestScore > 0 ? 92 : 64,
            left: 8,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: alpha('#000', 0.4),
            color: '#ef5350',
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: 2,
            pointerEvents: 'none',
          }}
        >
          {'♥'.repeat(hp) + '♡'.repeat(Math.max(0, PLAYER_HP - hp))}
        </Box>
      )}

      <Box
        ref={padChipRef}
        data-testid="strike-pad-chip"
        data-pad-state="off"
        // display/text/state are written by StrikeRig on the telemetry tick
        sx={{
          display: 'none',
          position: 'absolute',
          top: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.5),
          color: '#69f0ae',
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: 0.5,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      />

      {banner && (
        <Box
          data-testid="strike-wave"
          sx={{
            position: 'absolute',
            top: '38%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            px: 2,
            py: 1,
            borderRadius: 1.5,
            bgcolor: alpha('#000', 0.55),
            color: '#ffca28',
            fontFamily: 'monospace',
            fontSize: 20,
            fontWeight: 700,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {banner}
        </Box>
      )}

      {view === 'fp' && <Reticle ref={reticleRef} zoom={zoom} />}

      <HitMarkers markers={markers} />

      {minimap && (
        <StrikeMinimap
          buildings={layout.buildings}
          droneRef={minimapDroneRef}
          targetRefs={minimapTargetRefs}
          size={fullscreen ? 140 : 100}
        />
      )}

      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 0.5,
          borderRadius: 1,
          bgcolor: alpha('#000', 0.4),
        }}
      >
        <Tooltip title={view === 'fp' ? 'Switch to chase view' : 'Switch to FPV gun cam'}>
          <IconButton
            size="small"
            data-testid="strike-view-toggle"
            data-view={view}
            onClick={toggleView}
            sx={{ color: '#fff' }}
          >
            <CameraswitchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Restart from wave 1">
          <IconButton
            size="small"
            data-testid="strike-restart"
            onClick={requestRestart}
            sx={{ color: '#fff' }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings (combat, flight, world)">
          <IconButton
            size="small"
            data-testid="strike-settings"
            onClick={() => setSettingsOpen(true)}
            sx={{ color: '#fff' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <StrikeSettingsPanel
        id={id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        autoFire={autoFire}
        aimAssist={aimAssist}
        aimMode={aimMode}
        gyroAim={gyroMode}
        crashes={crashes}
        battery={battery}
        weather={weather}
        richWorld={richWorld}
        minimap={minimap}
        flightMode={flightMode}
        rateSpeed={rateSpeed}
        rateYaw={rateYaw}
        stickExpo={stickExpo}
        turbo={turbo}
        onNewWorld={requestNewWorld}
        onResetDefaults={resetDefaults}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'shuffle' ? 'New city?' : 'Restart the run?'}
        message={
          confirm === 'shuffle'
            ? 'Shuffling the buildings restarts the run from wave 1 and clears the session score. Your best score and wave are kept.'
            : 'Restarting returns to wave 1 and clears the session score. Your best score and wave are kept.'
        }
        confirmLabel={confirm === 'shuffle' ? 'Shuffle' : 'Restart'}
        cancelLabel="Keep playing"
        onConfirm={() => {
          if (confirm === 'shuffle') shuffleWorld()
          else restart()
        }}
        onCancel={() => setConfirm(null)}
      />

      <VirtualJoystick
        size={stickSize}
        label="THR · YAW"
        testId="strike-joystick-left"
        onChange={onLeftStick}
        sx={{
          position: 'absolute',
          left: stickInset,
          bottom: bottomBase === '0px' ? 0 : bottomBase,
        }}
      />
      <VirtualJoystick
        size={stickSize}
        label="MOVE"
        testId="strike-joystick-right"
        onChange={onRightStick}
        sx={{
          position: 'absolute',
          right: stickInset,
          bottom: bottomBase === '0px' ? 0 : bottomBase,
        }}
      />
      <FireButton
        size={fireSize}
        fireHeldRef={fireHeldRef}
        testId="strike-fire"
        sx={{
          position: 'absolute',
          right: fireRight,
          bottom: `calc(${bottomBase} + ${fireBottom}px)`,
        }}
      />
      {view === 'fp' && (
        <ScopeButton
          size={scopeSize}
          zoom={zoom}
          onToggle={() => setZoom((z) => !z)}
          sx={{
            position: 'absolute',
            right: scopeRight,
            bottom: `calc(${bottomBase} + ${scopeBottom}px)`,
          }}
        />
      )}
    </Box>
  )
}
