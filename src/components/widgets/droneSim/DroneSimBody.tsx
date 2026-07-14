import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import ManIcon from '@mui/icons-material/Man'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { defaultWidgetData } from '../../../features/widgets/widgetCatalog'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, DUSK_PALETTE, NIGHT_PALETTE } from './palettes'
import type { BatteryEvent, BatteryState, DroneView, FlightMode, Tuning, Weather } from './flightModel'
import {
  MAX_SPEED_MULT,
  TURBO_BOOST,
  coerceFlightMode,
  coerceView,
  coerceWeather,
  createBatteryState,
  createControlInput,
  createFlightState,
  resetBatteryState,
  resetFlightState,
} from './flightModel'

const clampNum = (lo: number, hi: number) => (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : undefined
const coerceRate = clampNum(0.5, 2)
const coerceExpo = clampNum(0, 0.8)
import { DEFAULT_SEED, buildWorldLayout, coerceGateCount } from './worldLayout'
import { createLapState, fmtLap, resetLapState } from './lapTimer'
import { CRASH_PULSE, GATE_PULSE, LAP_PULSE, vibrate } from './haptics'
import ConfirmDialog from '../ConfirmDialog'
import WorldScene from './WorldScene'
import DroneRig from './DroneRig'
import type { CrashState } from './DroneRig'
import CameraRig from './CameraRig'
import GateRings from './GateRings'
import type { GateFlash } from './GateRings'
import GhostLine from './GhostLine'
import RainField from './RainField'
import RichWorld from './RichWorld'
import LandingPads from './LandingPads'
import Minimap from './Minimap'
import OperatorFigure from './OperatorFigure'
import type { WalkerEvent } from './operatorWalk'
import {
  coerceFollowDist,
  createOperatorState,
  resetOperatorState,
} from './operatorWalk'
import SettingsPanel from './SettingsPanel'
import VirtualJoystick from './VirtualJoystick'

/** What "Reset settings" restores: every settings-panel field, sourced from
 * the catalog defaults. Records (score/best/ghost/landingBest), the camera
 * view and the world seed are deliberately NOT settings. */
const SETTING_KEYS = [
  'flightMode',
  'crashes',
  'landing',
  'battery',
  'weather',
  'richWorld',
  'minimap',
  'followDist',
  'rateSpeed',
  'rateYaw',
  'stickExpo',
  'turbo',
  'gateCount',
] as const
const SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  SETTING_KEYS.map((k) => [k, defaultWidgetData('droneSim')[k]]),
)
const DEFAULT_GATES = coerceGateCount(SETTING_DEFAULTS.gateCount) ?? 3

const EMPTY_PATH: number[] = []
const coercePath = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((n) => typeof n === 'number')
    ? (v as number[])
    : undefined

/**
 * The 3D drone simulator. Everything inside <Canvas> renders in a separate
 * React root, so theme-derived values are resolved here and passed as props.
 * High-frequency state (joystick vectors, flight pose) lives in mutable refs
 * shared between the sticks and the sim loop — flying never re-renders React.
 */
export default function DroneSimBody({ id }: WidgetProps) {
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
  const view = useWidgetField<DroneView>(id, 'view', 'tp', coerceView)
  const score = useWidgetField(id, 'score', 0)
  const bestLapMs = useWidgetField(id, 'bestLapMs', 0)
  const bestLapPath = useWidgetField<number[]>(id, 'bestLapPath', EMPTY_PATH, coercePath)
  const worldSeed = useWidgetField(id, 'worldSeed', DEFAULT_SEED)
  const gateSetting = useWidgetField(id, 'gateCount', 3, coerceGateCount)
  const layout = useMemo(
    () => buildWorldLayout(worldSeed, gateSetting),
    [worldSeed, gateSetting],
  )
  const gateCount = layout.gates.length

  const controls = useRef(createControlInput()).current
  const flight = useRef(createFlightState()).current
  const lap = useRef(createLapState()).current
  const hudRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<GateFlash>({ gate: -1, until: 0 })
  // Shared between the sim loop (which samples it) and the rain (which
  // drifts with it) — mutable, never re-renders.
  const windRef = useRef({ x: 0, y: 0 })
  const crashRef = useRef<CrashState>({
    active: false,
    until: 0,
    spinX: 0,
    spinZ: 0,
  })
  const crashes = useWidgetField(id, 'crashes', true)
  const flightMode = useWidgetField<FlightMode>(id, 'flightMode', 'hold', coerceFlightMode)
  const minimap = useWidgetField(id, 'minimap', true)
  const richWorld = useWidgetField(id, 'richWorld', true)
  const landing = useWidgetField(id, 'landing', false)
  const landingBest = useWidgetField(id, 'landingBest', 0)
  const battery = useWidgetField(id, 'battery', false)
  const batteryRef = useRef<BatteryState>(createBatteryState())
  const batteryBarRef = useRef<HTMLDivElement>(null)
  const minimapDroneRef = useRef<SVGGElement>(null)
  const minimapOperatorRef = useRef<SVGGElement>(null)
  const operatorRef = useRef(createOperatorState())
  const followDist = useWidgetField(id, 'followDist', 7, coerceFollowDist)
  const pilotChipRef = useRef<HTMLDivElement>(null)
  // Hold position: freezes the walking pilot's follow autopilot so the op
  // stands wherever it is (transient, like the op position itself).
  const [opHold, setOpHold] = useState(false)
  const rateSpeed = useWidgetField(id, 'rateSpeed', 1, coerceRate)
  const rateYaw = useWidgetField(id, 'rateYaw', 1, coerceRate)
  const stickExpo = useWidgetField(id, 'stickExpo', 0, coerceExpo)
  const turbo = useWidgetField(id, 'turbo', false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Toggling battery mode always restarts from a full charge.
  useEffect(() => {
    resetBatteryState(batteryRef.current)
  }, [battery])
  const tuning = useMemo<Tuning>(() => {
    const boost = turbo ? TURBO_BOOST : 1
    return {
      speed: Math.min(MAX_SPEED_MULT, rateSpeed * boost),
      yaw: Math.min(MAX_SPEED_MULT, rateYaw * boost),
      expo: stickExpo,
    }
  }, [rateSpeed, rateYaw, stickExpo, turbo])
  // Which ring must be flown through next (GATES.length = all passed, return
  // to the pad); transient — reload/reset restarts the lap, only score and
  // best lap persist.
  const [activeGate, setActiveGate] = useState(0)
  const [banner, setBanner] = useState<string | null>(null)
  // Pending course change awaiting confirmation: 'shuffle' re-rolls the
  // seed, a number is a new gate count, 'defaults' restores all settings
  // (guarded only when that reverts the gate count). All clear laps/best/ghost.
  const [confirmCourse, setConfirmCourse] = useState<'shuffle' | 'defaults' | number | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    },
    [],
  )

  const onGatePass = useCallback(() => {
    vibrate(GATE_PULSE)
    setActiveGate((gate) => Math.min(gate + 1, gateCount))
  }, [gateCount])

  const onLapComplete = useCallback(
    (lapMs: number, path: number[]) => {
      vibrate(LAP_PULSE)
      const isBest = bestLapMs === 0 || lapMs < bestLapMs
      dispatch(
        updateWidgetData({
          id,
          data: {
            score: score + 1,
            ...(isBest
              ? { bestLapMs: Math.round(lapMs), bestLapPath: path }
              : {}),
          },
        }),
      )
      setActiveGate(0)
      setBanner(`LAP ${fmtLap(lapMs)}${isBest ? ' · NEW BEST!' : ''}`)
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => setBanner(null), 3000)
    },
    [bestLapMs, dispatch, id, score],
  )

  const resetSim = () => {
    resetFlightState(flight)
    resetLapState(lap)
    resetBatteryState(batteryRef.current)
    resetOperatorState(operatorRef.current)
    setOpHold(false)
    crashRef.current.active = false
    setActiveGate(0)
    setBanner(null)
  }

  const showBanner = useCallback((text: string, ms = 2500) => {
    setBanner(text)
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBanner(null), ms)
  }, [])

  const onBatteryEvent = useCallback(
    (event: BatteryEvent) => {
      if (event === 'low') {
        vibrate(GATE_PULSE)
        showBanner('LOW BATTERY!')
      } else if (event === 'died') {
        vibrate(CRASH_PULSE)
        showBanner('BATTERY DEAD — AUTO-LANDING')
      } else {
        showBanner('RECHARGED!')
      }
    },
    [showBanner],
  )

  const onCrash = useCallback(() => {
    // A crash voids the lap in progress.
    resetLapState(lap)
    setActiveGate(0)
    setBanner('CRASHED!')
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setBanner(null), 2500)
  }, [lap])

  const onCrashEnd = useCallback(() => {
    resetFlightState(flight) // respawn on the pad; jump guard covers the leap
  }, [flight])

  const onWalkerEvent = useCallback(
    (event: WalkerEvent) => {
      vibrate(GATE_PULSE)
      showBanner(
        event === 'pickup' ? 'DRONE PICKED UP — CARRYING TO PAD' : 'DRONE PLACED ON PAD',
      )
    },
    [showBanner],
  )

  const onLanding = useCallback(
    (points: number) => {
      vibrate(LAP_PULSE)
      const isBest = points > landingBest
      if (isBest) {
        dispatch(updateWidgetData({ id, data: { landingBest: points } }))
      }
      setBanner(`LANDED! ${points} pts${isBest ? ' · NEW BEST!' : ''}`)
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => setBanner(null), 2500)
    },
    [dispatch, id, landingBest],
  )

  const applyCourseChange = (change: 'shuffle' | 'defaults' | number) => {
    setConfirmCourse(null)
    if (change === 'defaults') {
      const courseChanges = gateSetting !== DEFAULT_GATES
      dispatch(
        updateWidgetData({
          id,
          data: {
            ...SETTING_DEFAULTS,
            ...(courseChanges
              ? { score: 0, bestLapMs: 0, bestLapPath: [] }
              : {}),
          },
        }),
      )
      if (courseChanges) resetSim()
      return
    }
    dispatch(
      updateWidgetData({
        id,
        data: {
          ...(change === 'shuffle'
            ? { worldSeed: Math.floor(Math.random() * 0x100000000) }
            : { gateCount: change }),
          score: 0,
          bestLapMs: 0,
          bestLapPath: [],
        },
      }),
    )
    resetSim()
  }

  const requestCourseChange = (change: 'shuffle' | 'defaults' | number) => {
    if (typeof change === 'number' && change === gateSetting) return
    // Destroys a recorded best (or an in-progress lap) — confirm first.
    // Resetting settings only rebuilds the course when the gate count moves.
    const changesCourse = change !== 'defaults' || gateSetting !== DEFAULT_GATES
    if (changesCourse && (bestLapMs > 0 || lap.status === 'running')) {
      setConfirmCourse(change)
    } else {
      applyCourseChange(change)
    }
  }

  const stickSize = fullscreen ? 140 : 88
  const stickInset = fullscreen ? 16 : 0

  // Cycle chase -> FPV -> standing pilot -> walking pilot -> chase.
  const NEXT_VIEW: Record<DroneView, DroneView> = {
    tp: 'fp',
    fp: 'los',
    los: 'walk',
    walk: 'tp',
  }
  const VIEW_TOOLTIP: Record<DroneView, string> = {
    tp: 'Switch to first person (FPV)',
    fp: 'Switch to pilot view (stand at the pad)',
    los: 'Switch to walking pilot (follows the drone)',
    walk: 'Switch to third person (chase)',
  }
  const toggleView = () =>
    dispatch(updateWidgetData({ id, data: { view: NEXT_VIEW[view] } }))

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

  return (
    <Box
      className="widget-no-drag"
      data-testid="dronesim-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      data-gate-count={gateCount}
      data-landing-best={landingBest}
      data-mode={flightMode}
      data-crashes={crashes ? 'on' : 'off'}
      data-landing={landing ? 'on' : 'off'}
      data-battery={battery ? 'on' : 'off'}
      data-weather={weather}
      data-rich={richWorld ? 'on' : 'off'}
      data-minimap={minimap ? 'on' : 'off'}
      data-turbo={turbo ? 'on' : 'off'}
      data-op-hold={opHold ? 'on' : 'off'}
      data-follow-dist={followDist}
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
      <Box data-testid="dronesim-canvas" sx={{ position: 'absolute', inset: 0 }}>
        <Canvas
          frameloop="always"
          dpr={[1, 1.75]}
          camera={{ fov: 60, near: 0.1, far: 400, position: [0, 4, 26] }}
        >
          <WorldScene palette={palette} buildings={layout.buildings} />
          <OperatorFigure
            operator={operatorRef}
            visible={view === 'tp' || view === 'fp'}
          />
          {richWorld && <RichWorld layout={layout} />}
          {landing && <LandingPads pads={layout.landingPads} />}
          <GateRings
            palette={palette}
            rings={layout.rings}
            activeGate={activeGate}
            flashRef={flashRef}
          />
          <GhostLine path={bestLapPath} color={palette.ring} />
          {weather === 'storm' && (
            <RainField flight={flight} wind={windRef.current} />
          )}
          <DroneRig
            controls={controls}
            flight={flight}
            view={view}
            operator={operatorRef}
            operatorHold={opHold}
            followDist={followDist}
            pilotChipRef={pilotChipRef}
            minimapOperatorRef={minimapOperatorRef}
            onWalkerEvent={onWalkerEvent}
            hudRef={hudRef}
            timerRef={timerRef}
            minimapDroneRef={minimapDroneRef}
            colliders={layout.colliders}
            gates={layout.gates}
            weather={weather}
            flightMode={flightMode}
            tuning={tuning}
            windRef={windRef}
            crashMode={crashes}
            crashRef={crashRef}
            onCrash={onCrash}
            onCrashEnd={onCrashEnd}
            landingMode={landing}
            landingPads={layout.landingPads}
            onLanding={onLanding}
            batteryMode={battery}
            batteryRef={batteryRef}
            batteryBarRef={batteryBarRef}
            onBatteryEvent={onBatteryEvent}
            activeGate={activeGate}
            onGatePass={onGatePass}
            flashRef={flashRef}
            lap={lap}
            bestLapMs={bestLapMs}
            onLapComplete={onLapComplete}
          />
          <CameraRig
            view={view}
            flight={flight}
            operator={operatorRef}
            operatorHold={opHold}
            colliders={layout.colliders}
            hudRef={hudRef}
          />
        </Canvas>
      </Box>

      <Box
        ref={hudRef}
        data-testid="dronesim-hud"
        data-alt="2.0"
        data-speed="0.0"
        data-x="0.00"
        data-z="18.00"
        data-yaw="0.000"
        data-wind="0"
        data-crash-state="none"
        data-boom="6.5"
        data-op-x="3.20"
        data-op-z="23.00"
        data-op-mode="idle"
        data-op-heading="0.57"
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
        data-testid="dronesim-gates"
        data-gate={activeGate + 1}
        data-score={score}
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
        {activeGate >= gateCount
          ? `TO PAD · LAPS ${score}`
          : `GATE ${activeGate + 1}/${gateCount} · LAPS ${score}`}
      </Box>

      <Box
        ref={timerRef}
        data-testid="dronesim-timer"
        data-lap-status="ready"
        data-lap-ms="0"
        data-best-ms={bestLapMs}
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
        {bestLapMs > 0 ? `BEST ${fmtLap(bestLapMs)}` : 'BEST —'}
      </Box>

      {battery && (
        <Box
          data-testid="dronesim-battery"
          sx={{
            position: 'absolute',
            top: 92,
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
            data-testid="dronesim-battery-fill"
            data-level="100"
            sx={{ height: '100%', width: '100%', bgcolor: '#66bb6a' }}
          />
        </Box>
      )}

      {(view === 'los' || view === 'walk') && (
        <Box
          ref={pilotChipRef}
          data-testid="dronesim-pilot-chip"
          // text + data-pilot + colour are written by DroneRig on the
          // telemetry tick — the rescue/manual state lives in refs.
          sx={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            bgcolor: alpha('#000', 0.4),
            color: '#b0bec5',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 0.5,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        />
      )}

      {banner && (
        <Box
          data-testid="dronesim-lap-banner"
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
        <Tooltip title={VIEW_TOOLTIP[view]}>
          <IconButton
            size="small"
            data-testid="dronesim-view-toggle"
            data-view={view}
            onClick={toggleView}
            sx={{ color: '#fff' }}
          >
            <CameraswitchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset to landing pad">
          <IconButton
            size="small"
            data-testid="dronesim-reset"
            onClick={resetSim}
            sx={{ color: '#fff' }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {view === 'walk' && (
          <Tooltip
            title={
              opHold
                ? 'Resume autopilot (follow the drone / auto rescue)'
                : 'Autopilot off: hold position — or walk manually with the sticks while the drone is down'
            }
          >
            <IconButton
              size="small"
              data-testid="dronesim-op-hold"
              aria-pressed={opHold}
              onClick={() => setOpHold((h) => !h)}
              sx={{ color: opHold ? '#ffab40' : '#fff' }}
            >
              {opHold ? (
                <ManIcon fontSize="small" />
              ) : (
                <DirectionsWalkIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Settings (modes, environment, tuning)">
          <IconButton
            size="small"
            data-testid="dronesim-settings"
            onClick={() => setSettingsOpen(true)}
            sx={{ color: '#fff' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <SettingsPanel
        id={id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        flightMode={flightMode}
        crashes={crashes}
        landing={landing}
        battery={battery}
        weather={weather}
        richWorld={richWorld}
        minimap={minimap}
        rateSpeed={rateSpeed}
        rateYaw={rateYaw}
        stickExpo={stickExpo}
        turbo={turbo}
        followDist={followDist}
        gateCount={gateSetting}
        onGateCount={requestCourseChange}
        onResetDefaults={() => requestCourseChange('defaults')}
        onNewCourse={() => {
          setSettingsOpen(false)
          requestCourseChange('shuffle')
        }}
      />

      <ConfirmDialog
        open={confirmCourse !== null}
        title={
          confirmCourse === 'shuffle'
            ? 'New course?'
            : confirmCourse === 'defaults'
              ? 'Reset settings?'
              : 'Change gates?'
        }
        message={
          confirmCourse === 'shuffle'
            ? 'Shuffling the buildings and gates clears your lap count, best time and ghost line for this course.'
            : confirmCourse === 'defaults'
              ? `Restoring default settings returns the lap to ${DEFAULT_GATES} gates, clearing your lap count, best time and ghost line.`
              : 'Changing the lap length clears your lap count, best time and ghost line for this course.'
        }
        confirmLabel={
          confirmCourse === 'shuffle'
            ? 'Shuffle'
            : confirmCourse === 'defaults'
              ? 'Reset'
              : 'Change'
        }
        cancelLabel="Keep course"
        onConfirm={() => {
          if (confirmCourse !== null) applyCourseChange(confirmCourse)
        }}
        onCancel={() => setConfirmCourse(null)}
      />

      {minimap && (
        <Minimap
          buildings={layout.buildings}
          rings={layout.rings}
          activeGate={activeGate}
          bestLapPath={bestLapPath}
          landingPads={landing ? layout.landingPads : []}
          droneRef={minimapDroneRef}
          operatorRef={minimapOperatorRef}
          size={fullscreen ? 140 : 100}
        />
      )}

      <VirtualJoystick
        size={stickSize}
        label="THR · YAW"
        testId="dronesim-joystick-left"
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
        testId="dronesim-joystick-right"
        onChange={onRightStick}
        sx={{
          position: 'absolute',
          right: stickInset,
          bottom: fullscreen ? `max(${stickInset}px, env(safe-area-inset-bottom))` : 0,
        }}
      />
    </Box>
  )
}
