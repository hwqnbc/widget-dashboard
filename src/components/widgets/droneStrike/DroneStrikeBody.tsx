import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, DUSK_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import type { Tuning, Weather } from '../droneSim/flightModel'
import {
  coerceWeather,
  createControlInput,
  createFlightState,
  resetFlightState,
} from '../droneSim/flightModel'
import { DEFAULT_SEED, buildWorldLayout } from '../droneSim/worldLayout'
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
import { coerceStrikeView, createAimOffset } from './aimModel'
import StrikeCameraRig from './StrikeCameraRig'
import StrikeRig from './StrikeRig'
import Targets from './Targets'
import EnemyDrones from './EnemyDrones'
import Tracers from './Tracers'
import Reticle from './Reticle'
import FireButton from './FireButton'
import type { HitMarker } from './HitMarkers'
import HitMarkers from './HitMarkers'
import StrikeMinimap from './StrikeMinimap'

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
  const richWorld = useWidgetField(id, 'richWorld', true)
  const rateSpeed = useWidgetField(id, 'rateSpeed', 1, coerceRate)
  const rateYaw = useWidgetField(id, 'rateYaw', 1, coerceRate)
  const stickExpo = useWidgetField(id, 'stickExpo', 0, coerceExpo)

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
  const minimapDroneRef = useRef<SVGGElement>(null)
  const minimapTargetRefs = useRef<(SVGCircleElement | null)[]>([])
  const markerId = useRef(0)

  const [wave, setWave] = useState(1)
  const [phase, setPhase] = useState<WavePhase>('intro')
  const [banner, setBanner] = useState<string | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [hp, setHp] = useState(PLAYER_HP)
  const [markers, setMarkers] = useState<HitMarker[]>([])

  // Wave state machine: intro (banner) → active (targets live) → cleared
  // (banner) → next intro; a failed wave (hp 0) restarts itself with fresh
  // targets and hp. Timers cleaned up on every transition/unmount.
  useEffect(() => {
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
    setHp((h) => Math.max(0, h - 1))
  }, [])

  const restart = () => {
    setConfirmRestart(false)
    resetFlightState(flight)
    resetCombatState(combat)
    for (const t of targets) t.alive = false
    scoreRef.current = 0
    setMarkers([])
    setWave(1)
    setPhase('intro')
  }

  const requestRestart = () => {
    // Only bother confirming when there's progress to lose.
    if (wave > 1 || scoreRef.current > 0) {
      setConfirmRestart(true)
    } else {
      restart()
    }
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
      if (!keys.delete(e.code)) return
      push()
    }
    const onBlur = () => {
      fireHeldRef.current = false
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

  const tuning = useMemo<Tuning>(
    () => ({ speed: rateSpeed, yaw: rateYaw, expo: stickExpo }),
    [rateSpeed, rateYaw, stickExpo],
  )

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

  const stickSize = fullscreen ? 140 : 88
  const stickInset = fullscreen ? 16 : 0
  const fireSize = fullscreen ? 96 : 64

  return (
    <Box
      className="widget-no-drag"
      data-testid="drone-strike-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      data-view={view}
      data-auto-fire={autoFire ? 'on' : 'off'}
      data-aim-assist={aimAssist}
      data-weather={weather}
      data-rich={richWorld ? 'on' : 'off'}
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
        data-testid="strike-canvas"
        sx={{ position: 'absolute', inset: 0 }}
        // Desktop convenience: the mouse fires directly on the scene. Touch
        // uses the dedicated button only (a stray palm must not shoot).
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button === 0) fireHeldRef.current = true
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') fireHeldRef.current = false
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') fireHeldRef.current = false
        }}
      >
        <Canvas
          frameloop="always"
          dpr={[1, 1.75]}
          camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 26] }}
        >
          <WorldScene palette={palette} buildings={layout.buildings} />
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
            colliders={layout.colliders}
            weather={weather}
            windRef={windRef}
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
            waveState={phase}
            hp={hp}
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
          />
        </Canvas>
      </Box>

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

      {wave >= ENEMY_FIRE_WAVE && (
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

      {view === 'fp' && <Reticle ref={reticleRef} />}

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
      </Box>

      <ConfirmDialog
        open={confirmRestart}
        title="Restart the run?"
        message="Restarting returns to wave 1 and clears the session score. Your best score and wave are kept."
        confirmLabel="Restart"
        cancelLabel="Keep playing"
        onConfirm={restart}
        onCancel={() => setConfirmRestart(false)}
      />

      <VirtualJoystick
        size={stickSize}
        label="THR · YAW"
        testId="strike-joystick-left"
        onChange={onLeftStick}
        sx={{
          position: 'absolute',
          left: stickInset,
          bottom: fullscreen ? `max(${stickInset}px, env(safe-area-inset-bottom))` : 0,
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
          bottom: fullscreen ? `max(${stickInset}px, env(safe-area-inset-bottom))` : 0,
        }}
      />
      <FireButton
        size={fireSize}
        fireHeldRef={fireHeldRef}
        testId="strike-fire"
        sx={{
          position: 'absolute',
          right: stickInset + 8,
          bottom: fullscreen
            ? `calc(max(${stickInset}px, env(safe-area-inset-bottom)) + ${stickSize + 64}px)`
            : stickSize + 56,
        }}
      />
    </Box>
  )
}
