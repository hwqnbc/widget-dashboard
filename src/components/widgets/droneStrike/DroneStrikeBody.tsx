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
import { unlockAudio } from '../droneSim/webAudio'
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
import type { AimAssistLevel, HeatEvent, WeaponId } from './combatModel'
import {
  BOLT,
  WEAPON_IDS,
  WEAPON_SPECS,
  clearProjectiles,
  coerceAimAssist,
  coerceWeapon,
  createCombatState,
  createLaserBeams,
  resetCombatState,
} from './combatModel'
import type { CrateLoot, Difficulty } from './waveLayout'
import {
  CRATE_SCORE,
  DIFFICULTY,
  ENEMY_FIRE_WAVE,
  MILESTONE_SCORE,
  buildWave,
  coerceDifficulty,
  createTargetStates,
  enemyAggressionScale,
  isBossWave,
  loadWave,
  resolveCrateGrant,
} from './waveLayout'
import { createEnemyAIStates, seedEnemyAIStates } from './enemyAI'
import type { StrikeView } from './aimModel'
import {
  coerceStrikeView,
  coerceZoomPower,
  createAimOffset,
  zoomFovFor,
  zoomSensFor,
} from './aimModel'
import type { ZoomPower } from './aimModel'
import StrikeCameraRig from './StrikeCameraRig'
import type { CrashState } from './StrikeRig'
import StrikeRig from './StrikeRig'
import Targets from './Targets'
import GroundTargets from './GroundTargets'
import CarTargets from './CarTargets'
import TurretTargets from './TurretTargets'
import SoldierTargets from './SoldierTargets'
import JetTargets from './JetTargets'
import EnemyDrones from './EnemyDrones'
import BossDrone from './BossDrone'
import Tracers from './Tracers'
import EnemyRockets from './EnemyRockets'
import SparkField from './SparkField'
import { createSparkPool } from './sparkModel'
import LaserBeams from './LaserBeams'
import TrajectoryArc from './TrajectoryArc'
import type { AimRay } from './TrajectoryArc'
import WeaponCrates from './WeaponCrates'
import type { CrateState } from './WeaponCrates'
import WeaponChip from './WeaponChip'
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
import { isTypingTarget } from '../../../utils/isTypingTarget'

const clampNum = (lo: number, hi: number) => (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : undefined
const coerceRate = clampNum(0.5, 2)
const coerceExpo = clampNum(0, 0.8)

type WavePhase = 'intro' | 'active' | 'cleared' | 'failed'

/** Pickup banner per crate loot. */
const CRATE_BANNERS: Record<CrateLoot, string> = {
  heart: '\u2665 BONUS HEART',
  score: `SUPPLY CACHE +${CRATE_SCORE}`,
}

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
  'difficulty',
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
  'audio',
  'zoomPower',
  'weapon',
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
  const aimMode = useWidgetField<AimMode>(id, 'aimMode', 'classic', coerceAimMode)
  const difficulty = useWidgetField<Difficulty>(id, 'difficulty', 'easy', coerceDifficulty)
  const richWorld = useWidgetField(id, 'richWorld', true)
  const rateSpeed = useWidgetField(id, 'rateSpeed', 1, coerceRate)
  const rateYaw = useWidgetField(id, 'rateYaw', 1, coerceRate)
  const stickExpo = useWidgetField(id, 'stickExpo', 0, coerceExpo)
  const flightMode = useWidgetField<FlightMode>(id, 'flightMode', 'hold', coerceFlightMode)
  const turbo = useWidgetField(id, 'turbo', false)
  const battery = useWidgetField(id, 'battery', false)
  const crashes = useWidgetField(id, 'crashes', true)
  const audio = useWidgetField(id, 'audio', true)
  const zoomPower = useWidgetField<ZoomPower>(id, 'zoomPower', 2, coerceZoomPower)
  const weaponId = useWidgetField<WeaponId>(id, 'weapon', 'bolt', coerceWeapon)
  const weaponSpec = WEAPON_SPECS[weaponId]
  const zoomFov = zoomFovFor(zoomPower)
  const zoomSens = zoomSensFor(zoomPower)

  // The world is the same seeded city as the drone sim; the course gates are
  // simply unused here (targets come from waveLayout instead).
  const layout = useMemo(() => buildWorldLayout(worldSeed), [worldSeed])

  const controls = useRef(createControlInput()).current
  const flight = useRef(createFlightState()).current
  const combat = useRef(createCombatState()).current
  // Spark-burst pool (muzzle flashes + impact showers) — the rig spawns
  // bursts, SparkField ages + draws them (one Points draw call).
  const sparks = useRef(createSparkPool()).current
  // Laser beam slots — the rig spawns one per hitscan shot, LaserBeams draws.
  const beams = useRef(createLaserBeams()).current
  // Live aim ray (muzzle + fire dir) the rig publishes every frame — read by
  // the ballistic TrajectoryArc hint.
  const aimRay = useRef<AimRay>({
    origin: { x: 0, y: 2, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
  }).current
  // The wave's rooftop supply crate — loaded from the wave spec on each
  // intro, consumed by the rig on touch, drawn by WeaponCrates.
  const crateState = useRef<CrateState>({
    active: false,
    x: 0,
    top: 0,
    z: 0,
    loot: 'heart',
  }).current
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
  const heatBarRef = useRef<HTMLDivElement>(null)
  const bossBarRef = useRef<HTMLDivElement>(null)
  const crashRef = useRef<CrashState>({ active: false, until: 0, spinX: 0, spinZ: 0 })
  const padStateRef = useRef<'idle' | 'active'>('idle')
  const padChipRef = useRef<HTMLDivElement>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minimapDroneRef = useRef<SVGGElement>(null)
  const minimapTargetRefs = useRef<(SVGCircleElement | null)[]>([])
  const minimapCrateRef = useRef<SVGRectElement>(null)
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
  // Enemy movement fed to the rig: the difficulty preset scaled by the
  // wave-aggression throttle, so wave-1 drones are near-static hovers
  // (orbit + evade burst + vertical jink all eased down) ramping to full by
  // ~wave 6. Recomputed on wave/difficulty change (rare — not per frame).
  const enemyMove = useMemo(() => {
    const preset = DIFFICULTY[difficulty]
    const agg = enemyAggressionScale(wave)
    return {
      orbitMult: preset.orbitMult * agg,
      evadeMult: 1 + (preset.evadeMult - 1) * agg,
      evadeTime: preset.evadeTime,
      jinkScale: agg,
      // Kamikaze pursuit speed ramps with the same wave throttle, floored so
      // a wave-3 chaser is a threat, not a hover.
      chaseMult: preset.chaseMult * Math.max(0.5, agg),
    }
  }, [difficulty, wave])
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

  // Autoplay policy: an AudioContext can't start without a user gesture, so
  // resume it on the first interaction of any kind (capture phase, so a
  // child's stopPropagation on the sticks/buttons never hides it; keydown
  // covers the keyboard/Space fire path). unlockAudio is idempotent, so we
  // keep trying until the context is running. Off when sound is muted.
  useEffect(() => {
    if (!audio) return
    const unlock = () => unlockAudio()
    const opts = { capture: true } as const
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('keydown', unlock, opts)
    window.addEventListener('touchstart', unlock, opts)
    return () => {
      window.removeEventListener('pointerdown', unlock, opts)
      window.removeEventListener('keydown', unlock, opts)
      window.removeEventListener('touchstart', unlock, opts)
    }
  }, [audio])

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
      // Every BOSS_EVERY-th wave announces the gunship joining the mix.
      setBanner(isBossWave(wave) ? `WAVE ${wave} — BOSS` : `WAVE ${wave}`)
      setHp(PLAYER_HP)
      const t = setTimeout(() => {
        clearProjectiles(combat)
        const spec = buildWave(worldSeed, wave, layout, difficulty)
        loadWave(targets, spec)
        seedEnemyAIStates(enemyAI, targets)
        // Load (or clear) the wave's rooftop weapon crate.
        if (spec.crate) {
          crateState.active = true
          crateState.x = spec.crate.x
          crateState.top = spec.crate.top
          crateState.z = spec.crate.z
          crateState.loot = spec.crate.loot
        } else {
          crateState.active = false
        }
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
  }, [phase, wave, worldSeed, layout, targets, combat, enemyAI, difficulty, crateState])

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

  const onHeatEvent = useCallback(
    (event: HeatEvent) => {
      if (event === 'overheated') {
        vibrate(CRASH_PULSE)
        showBanner('OVERHEATED!')
      } else {
        showBanner('LASER READY', 1500)
      }
    },
    [showBanner],
  )

  // Switching weapons: despawn in-flight player bolts (they must not
  // retro-inherit the new spec's gravity/maxAge — stepProjectiles sweeps the
  // pool with the CURRENT weapon) and start the new gun cold.
  useEffect(() => {
    for (const p of combat.player) p.active = false
    combat.heat = 0
    combat.overheated = false
    combat.cooldown = 0
  }, [weaponId, combat])

  // Explicit in-game weapon pick (chip swipe/tap/wheel or a 1–5 hotkey):
  // writes the SAME persisted field as the settings picker.
  const onWeaponSelect = useCallback(
    (w: WeaponId) => {
      dispatch(updateWidgetData({ id, data: { weapon: w } }))
    },
    [dispatch, id],
  )

  // Crate pickup — the rig consumed the crate; apply the resolved grant: a
  // heart ALWAYS adds one (deliberately uncapped — stacking a 4th+ heart is
  // the reward for the rooftop detour; only the pad recharge is capped), a
  // cache pays straight into the score (the HUD chip shows it next tick).
  const onCratePickup = useCallback(
    (loot: CrateLoot) => {
      const grant = resolveCrateGrant(loot)
      if (grant.hearts > 0) setHp((h) => h + grant.hearts)
      if (grant.score > 0) scoreRef.current += grant.score
      vibrate(GATE_PULSE)
      showBanner(CRATE_BANNERS[loot])
    },
    [showBanner],
  )

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

  // Score milestones: every MILESTONE_SCORE session points the rig's tick
  // pays a bonus heart — uncapped, the crate-heart stacking rule — so the
  // score caches (and every kill) are deferred healing.
  const onScoreMilestone = useCallback(
    (hearts: number) => {
      setHp((h) => h + hearts)
      vibrate(GATE_PULSE)
      showBanner(`\u2665 ${MILESTONE_SCORE} SCORE \u2014 BONUS HEART`)
    },
    [showBanner],
  )

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
    crateState.active = false
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
    const push = () => {
      keySetToSample(keys, sample)
      applyExternal(externalRef.current, 'keyboard', sample, controls)
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        fireHeldRef.current = true
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setZoom(true) // hold-to-scope on desktop
        return
      }
      // 1–5 direct-select a weapon (same order as the chip/settings picker).
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= WEAPON_IDS.length) {
          onWeaponSelect(WEAPON_IDS[n - 1])
          return
        }
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
  }, [controls, onWeaponSelect])

  // Turbo stacks under the hard cap; scoped aim is slower (the zoom
  // magnifies apparent motion, so yaw scales by 1/power) — flight speed
  // untouched by zoom.
  const tuning = useMemo<Tuning>(() => {
    const boost = turbo ? TURBO_BOOST : 1
    return {
      speed: Math.min(MAX_SPEED_MULT, rateSpeed * boost),
      yaw: Math.min(MAX_SPEED_MULT, rateYaw * boost) * (zoom ? zoomSens : 1),
      expo: stickExpo,
    }
  }, [rateSpeed, rateYaw, stickExpo, turbo, zoom, zoomSens])

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
  // The weapon chip slots between fire and scope in the same column: its pill
  // is fireSize + 8 wide inside a p:1 hit area, so chipRight = fireRight lines
  // the two hit boxes up exactly; the scope moves up one row above it.
  const chipWidth = fireSize + 8
  const chipBottom = fireBottom + fireSize + 26
  const scopeRight = fireRight + Math.round((fireSize + 24 - scopeSize - 16) / 2)
  const scopeBottom = chipBottom + 26 + 20
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
      data-zoom-power={zoomPower}
      data-weapon={weaponId}
      data-weather={weather}
      data-rich={richWorld ? 'on' : 'off'}
      data-mode={flightMode}
      data-turbo={turbo ? 'on' : 'off'}
      data-battery={battery ? 'on' : 'off'}
      data-crashes={crashes ? 'on' : 'off'}
      data-aim-mode={aimMode}
      data-difficulty={difficulty}
      data-audio={audio ? 'on' : 'off'}
      data-boss-wave={isBossWave(wave) ? 'yes' : 'no'}
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
            // Classic mode has no gimbal — drag doesn't aim (a mouse click
            // still fires; the drag just tracks so it isn't a stray shot).
            if (aimMode !== 'classic') {
              const sens = DRAG_SENS * (zoom ? 0.5 : 1)
              // Drag right aims right (yaw decreases — yaw+ is left); drag
              // up aims up.
              slewGimbal(gimbalRef.current, -dx * sens, -dy * sens)
              aimInputRef.current = performance.now()
            }
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
          <GroundTargets targets={targets} />
          <CarTargets targets={targets} />
          <TurretTargets targets={targets} playerPos={flight.pos} />
          <SoldierTargets targets={targets} playerPos={flight.pos} />
          <JetTargets targets={targets} playerPos={flight.pos} />
          <EnemyDrones targets={targets} />
          <BossDrone targets={targets} />
          {/* Player tracers follow the equipped weapon; the enemy pool shares
           * this prop (scaled), so a tracer-less weapon (laser, len 0) falls
           * back to BOLT's length to keep enemy fire visible. */}
          <Tracers combat={combat} tracerLen={weaponSpec.tracerLen > 0 ? weaponSpec.tracerLen : BOLT.tracerLen} />
          {/* rocket-visual projectiles (soldier RPGs / player homing missiles)
           * — the pool-generic warhead + contrail renderer, mounted per pool */}
          <EnemyRockets pool={combat.enemy} />
          <EnemyRockets pool={combat.player} />
          <SparkField sparks={sparks} />
          <LaserBeams beams={beams} />
          {weaponId === 'lob' && <TrajectoryArc aimRay={aimRay} weapon={weaponSpec} />}
          <WeaponCrates crate={crateState} />
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
            sparks={sparks}
            beams={beams}
            aimRay={aimRay}
            crate={crateState}
            onCratePickup={onCratePickup}
            onScoreMilestone={onScoreMilestone}
            minimapCrateRef={minimapCrateRef}
            onHeatEvent={onHeatEvent}
            heatBarRef={heatBarRef}
            bossBarRef={bossBarRef}
            aimRef={aimRef}
            weapon={weaponSpec}
            assist={aimAssist}
            autoFire={autoFire}
            audioOn={audio}
            waveActive={phase === 'active'}
            wave={wave}
            hp={hp}
            zoom={zoom}
            zoomSens={zoomSens}
            onZoomHold={setZoom}
            aimMode={aimMode}
            gimbalRef={gimbalRef}
            aimInputRef={aimInputRef}
            enemyMove={enemyMove}
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
            zoomFov={zoomFov}
            zoomSens={zoomSens}
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
        data-milestones="0"
        data-combo="0"
        data-deflects="0"
        data-boss-active="no"
        data-boss-hp="0"
        data-boss-pods="0"
        data-hp="3"
        data-crash-state="none"
        data-safe="off"
        data-tgt-kind="none"
        data-input-source="touch"
        data-sparks="0"
        data-crate-active="no"
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

      {/* Laser heat — same bar recipe as the battery, stacked below it when
       * both are on (the offset arithmetic mirrors the battery's, +14 when
       * the battery bar occupies the slot). Fill = heat 0→100, rig-written. */}
      {weaponId === 'laser' && (
        <Box
          data-testid="strike-heat"
          sx={{
            position: 'absolute',
            top:
              (bestScore > 0 ? (hpVisible ? 120 : 92) : hpVisible ? 92 : 64) +
              (battery ? 14 : 0),
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
            ref={heatBarRef}
            data-testid="strike-heat-fill"
            data-level="0"
            data-overheated="no"
            sx={{ height: '100%', width: '0%', bgcolor: '#4fc3f7' }}
          />
        </Box>
      )}

      {/* Boss health bar — the wave's gunship, mounted on boss waves only.
        * Wider than the battery/heat bars (it's the fight's status) and
        * centred at the top; the rig writes the fill from the aggregate
        * weak-point hp and hides the whole bar once the boss is down. */}
      {isBossWave(wave) && (
        <Box
          data-testid="strike-boss"
          sx={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '46%',
            maxWidth: 260,
            height: 10,
            borderRadius: 1,
            bgcolor: alpha('#000', 0.5),
            border: `1px solid ${alpha('#ba68c8', 0.7)}`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Box
            ref={bossBarRef}
            data-testid="strike-boss-fill"
            data-level="100"
            data-pods="3"
            sx={{ height: '100%', width: '100%', bgcolor: '#ba68c8' }}
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
          crateRef={minimapCrateRef}
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
        difficulty={difficulty}
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
        audio={audio}
        zoomPower={zoomPower}
        weapon={weaponId}
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
      <WeaponChip
        weapon={weaponId}
        onSelect={onWeaponSelect}
        width={chipWidth}
        sx={{
          position: 'absolute',
          right: fireRight,
          bottom: `calc(${bottomBase} + ${chipBottom}px)`,
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
