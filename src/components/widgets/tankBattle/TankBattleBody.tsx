import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { defaultWidgetData } from '../../../features/widgets/widgetCatalog'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, DUSK_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import type { FlightState, Vec2, Weather } from '../droneSim/flightModel'
import { coerceWeather, createControlInput } from '../droneSim/flightModel'
import {
  DRONE_KEYS,
  applyExternal,
  createExternalSample,
  createExternalState,
  keySetToSample,
} from '../droneSim/externalInput'
import VirtualJoystick from '../droneSim/VirtualJoystick'
import RainField from '../droneSim/RainField'
import ConfirmDialog from '../ConfirmDialog'
import Reticle from '../droneStrike/Reticle'
import FireButton from '../droneStrike/FireButton'
import ScopeButton from '../droneStrike/ScopeButton'
import DamageVignette from '../droneStrike/DamageVignette'
import type { HitMarker } from '../droneStrike/HitMarkers'
import HitMarkers from '../droneStrike/HitMarkers'
import { createAimOffset } from '../droneStrike/aimModel'
import type { GyroMode } from '../droneStrike/gyroAim'
import { attachGyro, coerceGyroMode, createGyroState } from '../droneStrike/gyroAim'
import type { Roughness } from './terrain'
import { DEFAULT_TANK_SEED, buildTerrain, coerceRoughness } from './terrain'
import {
  createCamAim,
  createTankState,
  resetCamAim,
  resetTankState,
} from './tankModel'
import type { AimAssistLevel } from './shellModel'
import {
  clearShells,
  coerceAimAssist,
  createShellCombat,
  resetShellCombat,
} from './shellModel'
import type { BattleMode } from './battleLayout'
import {
  ENEMY_FIRE_WAVE,
  ROAM_ENEMIES,
  buildRoam,
  buildTankWave,
  coerceBattleMode,
  createTankTargets,
  loadBattle,
} from './battleLayout'
import { createTankAIStates, seedTankAIStates } from './tankAI'
import { MAX_TANK_TARGETS } from './battleLayout'
import TerrainMesh from './TerrainMesh'
import TankRig from './TankRig'
import TankCameraRig from './TankCameraRig'
import EnemyTanks from './EnemyTanks'
import ShellTracers from './ShellTracers'
import TankMinimap from './TankMinimap'
import TankSettingsPanel from './TankSettingsPanel'
import TankHelpDialog from './TankHelpDialog'
import TankSafePad from './TankSafePad'

const clampNum = (lo: number, hi: number) => (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : undefined
const coerceRate = clampNum(0.5, 2)
const coerceExpo = clampNum(0, 0.8)

type BattlePhase = 'intro' | 'active' | 'cleared' | 'failed'

const INTRO_MS = 1600
const CLEARED_MS_WAVES = 2000
const CLEARED_MS_ROAM = 3800
const FAILED_MS = 2500
/** Hits the player survives: per wave attempt / per roam run. */
const PLAYER_HP_WAVES = 3
const PLAYER_HP_ROAM = 5

/** What "Reset settings" restores. The game mode, terrain roughness, seed
 * and bests are deliberately kept — they're the battlefield, not settings. */
const SETTING_KEYS = [
  'autoFire',
  'autoTurn',
  'aimAssist',
  'gyroAim',
  'weather',
  'minimap',
  'rateSpeed',
  'rateTraverse',
  'stickExpo',
] as const
const SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  SETTING_KEYS.map((k) => [k, defaultWidgetData('tankBattle')[k]]),
)

const fmtMs = (ms: number): string => {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`
}

/** Flash the damage vignette to full and let it ease back (the strike
 * pattern — imperative writes, back-to-back hits re-trigger cleanly). */
function flashVignette(el: HTMLDivElement | null): void {
  if (!el) return
  el.dataset.flash = String((parseInt(el.dataset.flash ?? '0', 10) || 0) + 1)
  el.style.transition = 'none'
  el.style.opacity = '1'
  void el.offsetWidth
  el.style.transition = 'opacity 600ms ease-out'
  el.style.opacity = ''
}

type Confirm =
  | { kind: 'restart' }
  | { kind: 'shuffle' }
  | { kind: 'mode'; next: BattleMode }
  | { kind: 'roughness'; next: Roughness }

/**
 * The 3D tank combat game. Same architecture as the drone widgets: the
 * canvas is a separate React root (theme resolved out here, passed as
 * props); every high-frequency value — sticks, tank state, camera aim,
 * shell pools, enemy pool — lives in shared mutable refs; React renders
 * only on genuine events (battle phases, hits on the player, settings).
 */
export default function TankBattleBody({ id }: WidgetProps) {
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

  const worldSeed = useWidgetField(id, 'worldSeed', DEFAULT_TANK_SEED)
  const battleMode = useWidgetField<BattleMode>(id, 'battleMode', 'waves', coerceBattleMode)
  const roughness = useWidgetField<Roughness>(id, 'roughness', 'rolling', coerceRoughness)
  const minimap = useWidgetField(id, 'minimap', true)
  const bestWave = useWidgetField(id, 'bestWave', 0)
  const bestScore = useWidgetField(id, 'bestScore', 0)
  const bestRoamMs = useWidgetField(id, 'bestRoamMs', 0)
  const autoFire = useWidgetField(id, 'autoFire', false)
  const autoTurn = useWidgetField(id, 'autoTurn', true)
  const helpSeen = useWidgetField(id, 'helpSeen', false)
  const aimAssist = useWidgetField<AimAssistLevel>(id, 'aimAssist', 'mild', coerceAimAssist)
  const gyroMode = useWidgetField<GyroMode>(id, 'gyroAim', 'off', coerceGyroMode)
  const rateSpeed = useWidgetField(id, 'rateSpeed', 1, coerceRate)
  const rateTraverse = useWidgetField(id, 'rateTraverse', 1, coerceRate)
  const stickExpo = useWidgetField(id, 'stickExpo', 0, coerceExpo)

  const terrain = useMemo(
    () => buildTerrain(worldSeed, roughness),
    [worldSeed, roughness],
  )

  const controls = useRef(createControlInput()).current
  const tank = useRef(createTankState()).current
  const camAim = useRef(createCamAim()).current
  const combat = useRef(createShellCombat()).current
  const targets = useRef(createTankTargets()).current
  const tankAI = useRef(createTankAIStates(MAX_TANK_TARGETS)).current
  const aimOffsetRef = useRef(createAimOffset())
  const externalRef = useRef(createExternalState())
  const fireHeldRef = useRef(false)
  const scoreRef = useRef(0)
  const roamStartRef = useRef(0)
  const roamClearedMsRef = useRef(0)
  const windRef = useRef<Vec2>({ x: 0, y: 0 })
  // Structural FlightState adapter so the drone sim's RainField can centre
  // its cloud on the tank (it only reads .pos).
  const rainAdapterRef = useRef<FlightState>({
    pos: tank.pos,
    vel: tank.vel,
    yaw: 0,
    tiltPitch: 0,
    tiltRoll: 0,
  })
  const hudRef = useRef<HTMLDivElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const scoreChipRef = useRef<HTMLDivElement>(null)
  const vignetteRef = useRef<HTMLDivElement>(null)
  const padStateRef = useRef<'idle' | 'active'>('idle')
  const padChipRef = useRef<HTMLDivElement>(null)
  const minimapTankRef = useRef<SVGGElement>(null)
  const minimapTargetRefs = useRef<(SVGCircleElement | null)[]>([])
  const markerId = useRef(0)
  const gyroRef = useRef(createGyroState())

  // Live root height (ResizeObserver) — drives the touch-control sizing
  // (lesson #53: "fullscreen" is not "big"; a phone in landscape has
  // ~330 CSS px of height). Resize/rotate/fullscreen transitions only.
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
  const [phase, setPhase] = useState<BattlePhase>('intro')
  const [banner, setBanner] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [hp, setHp] = useState(PLAYER_HP_WAVES)
  const [markers, setMarkers] = useState<HitMarker[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  // First-run onboarding: the aiming model is invisible without it. Opens
  // once per widget instance; the ? button reopens it any time.
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen)
  const [zoom, setZoom] = useState(false)

  const enemiesShoot = battleMode === 'roam' || wave >= ENEMY_FIRE_WAVE

  // Gyro fine-aim writes the shared aim offset (camera + fire path).
  useEffect(() => {
    if (gyroMode === 'always' || (gyroMode === 'zoom' && zoom)) {
      return attachGyro(gyroRef.current, aimOffsetRef.current)
    }
  }, [gyroMode, zoom])

  // Battle state machine: intro (banner) → active → cleared/failed → next.
  useEffect(() => {
    if (phase === 'intro') {
      setBanner(
        battleMode === 'waves'
          ? `WAVE ${wave}`
          : `PATROL HUNT — DESTROY ${ROAM_ENEMIES}`,
      )
      setHp(battleMode === 'waves' ? PLAYER_HP_WAVES : PLAYER_HP_ROAM)
      const t = setTimeout(() => {
        clearShells(combat)
        const battle =
          battleMode === 'waves'
            ? buildTankWave(worldSeed, wave, terrain)
            : buildRoam(worldSeed, terrain)
        loadBattle(targets, battle, terrain)
        seedTankAIStates(tankAI, targets)
        roamStartRef.current = performance.now()
        setPhase('active')
        setBanner(null)
      }, INTRO_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'cleared') {
      setBanner(
        battleMode === 'waves'
          ? 'WAVE CLEARED!'
          : `AREA CLEARED — ${fmtMs(roamClearedMsRef.current)}`,
      )
      const t = setTimeout(
        () => {
          if (battleMode === 'waves') {
            setWave((w) => w + 1)
          } else {
            scoreRef.current = 0 // a roam run is a timed unit — fresh hunt
          }
          setPhase('intro')
        },
        battleMode === 'waves' ? CLEARED_MS_WAVES : CLEARED_MS_ROAM,
      )
      return () => clearTimeout(t)
    }
    if (phase === 'failed') {
      setBanner(
        battleMode === 'waves' ? 'WAVE FAILED — TRY AGAIN' : 'TANK DESTROYED — NEW HUNT',
      )
      const t = setTimeout(() => {
        if (battleMode === 'roam') scoreRef.current = 0
        setPhase('intro')
      }, FAILED_MS)
      return () => clearTimeout(t)
    }
  }, [phase, wave, battleMode, worldSeed, terrain, targets, combat, tankAI])

  useEffect(() => {
    if (hp <= 0 && phase === 'active') setPhase('failed')
  }, [hp, phase])

  const onCleared = useCallback(() => {
    const score = scoreRef.current
    const data: Record<string, unknown> = {}
    if (score > bestScore) data.bestScore = score
    if (battleMode === 'waves') {
      if (wave > bestWave) data.bestWave = wave
    } else {
      const elapsed = Math.round(performance.now() - roamStartRef.current)
      roamClearedMsRef.current = elapsed
      if (bestRoamMs === 0 || elapsed < bestRoamMs) data.bestRoamMs = elapsed
    }
    if (Object.keys(data).length > 0) dispatch(updateWidgetData({ id, data }))
    setPhase('cleared')
  }, [battleMode, wave, bestWave, bestScore, bestRoamMs, dispatch, id])

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

  const maxHp = battleMode === 'waves' ? PLAYER_HP_WAVES : PLAYER_HP_ROAM
  const onHeal = useCallback(() => {
    setHp((h) => Math.min(battleMode === 'waves' ? PLAYER_HP_WAVES : PLAYER_HP_ROAM, h + 1))
  }, [battleMode])

  // NOTE: restart deliberately does NOT touch the enemy pool. The canvas is
  // a separate React root whose props lag the body's synchronous mutations
  // by a frame — emptying the pool here let the rig see "battle active,
  // zero alive" and fire a phantom wave-clear. The intro's loadBattle
  // replaces the pool anyway; until then the old enemies just keep
  // patrolling behind the banner.
  const restart = useCallback(() => {
    setConfirm(null)
    resetTankState(tank)
    resetCamAim(camAim)
    resetShellCombat(combat)
    scoreRef.current = 0
    setMarkers([])
    setWave(1)
    setPhase('intro')
  }, [tank, camAim, combat])

  const shuffleWorld = () => {
    dispatch(
      updateWidgetData({
        id,
        data: { worldSeed: Math.floor(Math.random() * 0x100000000) },
      }),
    )
    restart()
  }

  const applyMode = (next: BattleMode) => {
    dispatch(updateWidgetData({ id, data: { battleMode: next } }))
    restart()
  }

  const applyRoughness = (next: Roughness) => {
    dispatch(updateWidgetData({ id, data: { roughness: next } }))
    restart()
  }

  const hasProgress = () => wave > 1 || scoreRef.current > 0

  const guard = (c: Confirm, apply: () => void) => {
    if (hasProgress()) setConfirm(c)
    else apply()
  }

  const requestRestart = () => guard({ kind: 'restart' }, restart)
  const requestNewWorld = () => {
    setSettingsOpen(false)
    guard({ kind: 'shuffle' }, shuffleWorld)
  }
  const requestMode = (next: BattleMode) => {
    if (next === battleMode) return
    setSettingsOpen(false)
    guard({ kind: 'mode', next }, () => applyMode(next))
  }
  const requestRoughness = (next: Roughness) => {
    if (next === roughness) return
    setSettingsOpen(false)
    guard({ kind: 'roughness', next }, () => applyRoughness(next))
  }

  const applyConfirm = () => {
    if (!confirm) return
    if (confirm.kind === 'restart') restart()
    else if (confirm.kind === 'shuffle') shuffleWorld()
    else if (confirm.kind === 'mode') applyMode(confirm.next)
    else applyRoughness(confirm.next)
  }

  const resetDefaults = () => {
    dispatch(updateWidgetData({ id, data: { ...SETTING_DEFAULTS } }))
  }

  const closeHelp = () => {
    setHelpOpen(false)
    if (!helpSeen) dispatch(updateWidgetData({ id, data: { helpSeen: true } }))
  }

  // Keyboard: WASD drives the hull, arrows aim, Space fires, Shift scopes.
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
        setZoom(true)
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

  const tuning = useMemo(
    () => ({ speed: rateSpeed, yaw: rateTraverse, expo: stickExpo }),
    [rateSpeed, rateTraverse, stickExpo],
  )

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

  // Touch-control sizing follows the widget's REAL height (the strike's
  // responsive layout, e8ebe29): fixed fullscreen sizes stacked the fire
  // button onto the toolbar on phone-height viewports.
  const stickMax = fullscreen ? 140 : 88
  const stickSize =
    rootH > 0 ? Math.round(Math.min(stickMax, Math.max(72, rootH * 0.28))) : stickMax
  const stickInset = fullscreen ? 16 : 0
  const fireSize = Math.max(48, Math.round(stickSize * 0.72))
  const scopeSize = Math.max(36, Math.round(stickSize * 0.46))
  // Fire + scope sit in a column INWARD of the right stick — consuming
  // width, which landscape always has, never height.
  const bottomBase = fullscreen ? `max(${stickInset}px, env(safe-area-inset-bottom))` : '0px'
  const fireRight = stickInset + stickSize + 40
  const fireBottom = Math.round(stickSize * 0.35)
  const scopeRight = fireRight + Math.round((fireSize + 24 - scopeSize - 16) / 2)
  const scopeBottom = fireBottom + fireSize + 30
  const showHp = enemiesShoot
  const bestChip =
    battleMode === 'waves'
      ? bestScore > 0
        ? `BEST ${bestScore} · W${bestWave}`
        : null
      : bestRoamMs > 0
        ? `BEST HUNT ${fmtMs(bestRoamMs)}`
        : null

  return (
    <Box
      ref={rootRef}
      className="widget-no-drag"
      data-testid="tank-battle-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      data-mode={battleMode}
      data-roughness={roughness}
      data-auto-fire={autoFire ? 'on' : 'off'}
      data-auto-turn={autoTurn ? 'on' : 'off'}
      data-help-seen={helpSeen ? 'on' : 'off'}
      data-aim-assist={aimAssist}
      data-gyro={gyroMode}
      data-minimap={minimap ? 'on' : 'off'}
      data-zoom={zoom ? 'on' : 'off'}
      data-weather={weather}
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
        data-testid="tank-canvas"
        sx={{ position: 'absolute', inset: 0 }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') return
          if (e.button === 0) fireHeldRef.current = true
          else if (e.button === 2) setZoom(true)
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== 'mouse') return
          if (e.button === 0) fireHeldRef.current = false
          else if (e.button === 2) setZoom(false)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return
          fireHeldRef.current = false
          setZoom(false)
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Canvas
          frameloop="always"
          dpr={[1, 1.75]}
          camera={{ fov: 60, near: 0.1, far: 420, position: [0, 8, 74] }}
        >
          <TerrainMesh spec={terrain} palette={palette} />
          {weather === 'storm' && (
            <RainField flight={rainAdapterRef.current} wind={windRef.current} />
          )}
          <TankSafePad stateRef={padStateRef} terrain={terrain} />
          <EnemyTanks targets={targets} />
          <ShellTracers combat={combat} />
          <TankRig
            controls={controls}
            tank={tank}
            camAim={camAim}
            aimOffset={aimOffsetRef}
            external={externalRef}
            fireHeldRef={fireHeldRef}
            tuning={tuning}
            terrain={terrain}
            targets={targets}
            tankAI={tankAI}
            enemiesShoot={enemiesShoot}
            combat={combat}
            assist={aimAssist}
            autoFire={autoFire}
            autoTurn={autoTurn}
            battleActive={phase === 'active'}
            canHeal={hp < maxHp && phase === 'active'}
            onHeal={onHeal}
            padStateRef={padStateRef}
            padChipRef={padChipRef}
            mode={battleMode}
            wave={wave}
            hp={hp}
            zoom={zoom}
            onZoomHold={setZoom}
            scoreRef={scoreRef}
            onCleared={onCleared}
            onTargetDown={onTargetDown}
            onPlayerHit={onPlayerHit}
            hudRef={hudRef}
            reticleRef={reticleRef}
            scoreChipRef={scoreChipRef}
            minimapTankRef={minimapTankRef}
            minimapTargetRefs={minimapTargetRefs}
          />
          <TankCameraRig
            tank={tank}
            aim={camAim}
            aimOffset={aimOffsetRef}
            terrain={terrain}
            zoom={zoom}
          />
        </Canvas>
      </Box>

      <DamageVignette ref={vignetteRef} lowHp={hp === 1} testId="tank-damage" />

      <Box
        ref={hudRef}
        data-testid="tank-hud"
        data-x="0.00"
        data-z="62.00"
        data-speed="0.0"
        data-hull-yaw="0.000"
        data-turret-yaw="0.000"
        data-wave={wave}
        data-wave-state={phase}
        data-score="0"
        data-shots="0"
        data-hits="0"
        data-targets-left="0"
        data-lock="-1"
        data-sol="ok"
        data-proj="0"
        data-tgt-kind="none"
        data-safe="on"
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
        SPD 0.0 · GUN READY
      </Box>

      <Box
        ref={scoreChipRef}
        data-testid="tank-score"
        data-score="0"
        data-wave={wave}
        data-best-score={bestScore}
        data-best-wave={bestWave}
        data-best-roam-ms={bestRoamMs}
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
        {battleMode === 'waves' ? `WAVE ${wave} · SCORE 0` : 'HUNT · SCORE 0'}
      </Box>

      {bestChip && (
        <Box
          data-testid="tank-best"
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
          {bestChip}
        </Box>
      )}

      {showHp && (
        <Box
          data-testid="tank-hp"
          data-hp={hp}
          sx={{
            position: 'absolute',
            top: bestChip ? 92 : 64,
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
          {'♥'.repeat(hp) +
            '♡'.repeat(
              Math.max(
                0,
                (battleMode === 'waves' ? PLAYER_HP_WAVES : PLAYER_HP_ROAM) - hp,
              ),
            )}
        </Box>
      )}

      <Box
        ref={padChipRef}
        data-testid="tank-pad-chip"
        data-pad-state="off"
        // display/text/state are written by TankRig on the telemetry tick
        sx={{
          display: 'none',
          position: 'absolute',
          top: 8,
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
          data-testid="tank-banner"
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

      <Reticle ref={reticleRef} zoom={zoom} testId="tank-reticle" />

      <HitMarkers markers={markers} />

      {minimap && (
        <TankMinimap
          terrain={terrain}
          tankRef={minimapTankRef}
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
        <Tooltip title="How to play">
          <IconButton
            size="small"
            data-testid="tank-help"
            onClick={() => setHelpOpen(true)}
            sx={{ color: '#fff' }}
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={battleMode === 'waves' ? 'Restart from wave 1' : 'Restart the hunt'}>
          <IconButton
            size="small"
            data-testid="tank-restart"
            onClick={requestRestart}
            sx={{ color: '#fff' }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Settings (battle, combat, driving, world)">
          <IconButton
            size="small"
            data-testid="tank-settings"
            onClick={() => setSettingsOpen(true)}
            sx={{ color: '#fff' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <TankHelpDialog open={helpOpen} onClose={closeHelp} />

      <TankSettingsPanel
        id={id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        battleMode={battleMode}
        onModeChange={requestMode}
        autoFire={autoFire}
        autoTurn={autoTurn}
        aimAssist={aimAssist}
        gyroAim={gyroMode}
        weather={weather}
        roughness={roughness}
        onRoughnessChange={requestRoughness}
        minimap={minimap}
        rateSpeed={rateSpeed}
        rateTraverse={rateTraverse}
        stickExpo={stickExpo}
        onNewWorld={requestNewWorld}
        onResetDefaults={resetDefaults}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'shuffle'
            ? 'New battlefield?'
            : confirm?.kind === 'mode'
              ? 'Switch game mode?'
              : confirm?.kind === 'roughness'
                ? 'Reshape the terrain?'
                : 'Restart the battle?'
        }
        message={
          confirm?.kind === 'shuffle'
            ? 'Rolling new terrain restarts the battle and clears the session score. Your bests are kept.'
            : confirm?.kind === 'mode'
              ? 'Switching between Waves and Roam restarts the battle and clears the session score. Your bests are kept.'
              : confirm?.kind === 'roughness'
                ? 'Changing the terrain roughness rebuilds the battlefield and restarts the battle. Your bests are kept.'
                : 'Restarting clears the session score. Your bests are kept.'
        }
        confirmLabel={
          confirm?.kind === 'shuffle'
            ? 'Shuffle'
            : confirm?.kind === 'mode'
              ? 'Switch'
              : confirm?.kind === 'roughness'
                ? 'Reshape'
                : 'Restart'
        }
        cancelLabel="Keep playing"
        onConfirm={applyConfirm}
        onCancel={() => setConfirm(null)}
      />

      <VirtualJoystick
        size={stickSize}
        label="DRIVE"
        testId="tank-joystick-left"
        onChange={onLeftStick}
        sx={{
          position: 'absolute',
          left: stickInset,
          bottom: bottomBase === '0px' ? 0 : bottomBase,
        }}
      />
      <VirtualJoystick
        size={stickSize}
        label="AIM"
        testId="tank-joystick-right"
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
        testId="tank-fire"
        sx={{
          position: 'absolute',
          right: fireRight,
          bottom: `calc(${bottomBase} + ${fireBottom}px)`,
        }}
      />
      <ScopeButton
        size={scopeSize}
        zoom={zoom}
        onToggle={() => setZoom((z) => !z)}
        testId="tank-zoom"
        sx={{
          position: 'absolute',
          right: scopeRight,
          bottom: `calc(${bottomBase} + ${scopeBottom}px)`,
        }}
      />
    </Box>
  )
}
