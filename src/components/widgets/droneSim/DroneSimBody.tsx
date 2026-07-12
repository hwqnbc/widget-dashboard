import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ShuffleIcon from '@mui/icons-material/Shuffle'
import ThunderstormIcon from '@mui/icons-material/Thunderstorm'
import WbSunnyIcon from '@mui/icons-material/WbSunny'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import ShieldIcon from '@mui/icons-material/Shield'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, DUSK_PALETTE, NIGHT_PALETTE } from './palettes'
import type { DroneView, Weather } from './flightModel'
import {
  coerceView,
  coerceWeather,
  createControlInput,
  createFlightState,
  resetFlightState,
} from './flightModel'
import { DEFAULT_SEED, buildWorldLayout } from './worldLayout'
import { createLapState, fmtLap, resetLapState } from './lapTimer'
import { GATE_PULSE, LAP_PULSE, vibrate } from './haptics'
import ConfirmDialog from '../ConfirmDialog'
import WorldScene from './WorldScene'
import DroneRig from './DroneRig'
import type { CrashState } from './DroneRig'
import CameraRig from './CameraRig'
import GateRings from './GateRings'
import type { GateFlash } from './GateRings'
import GhostLine from './GhostLine'
import RainField from './RainField'
import VirtualJoystick from './VirtualJoystick'

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
  const layout = useMemo(() => buildWorldLayout(worldSeed), [worldSeed])
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
  // Which ring must be flown through next (GATES.length = all passed, return
  // to the pad); transient — reload/reset restarts the lap, only score and
  // best lap persist.
  const [activeGate, setActiveGate] = useState(0)
  const [banner, setBanner] = useState<string | null>(null)
  const [confirmShuffle, setConfirmShuffle] = useState(false)
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
    crashRef.current.active = false
    setActiveGate(0)
    setBanner(null)
  }

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

  const shuffleCourse = () => {
    setConfirmShuffle(false)
    dispatch(
      updateWidgetData({
        id,
        data: {
          worldSeed: Math.floor(Math.random() * 0x100000000),
          score: 0,
          bestLapMs: 0,
          bestLapPath: [],
        },
      }),
    )
    resetSim()
  }

  const requestShuffle = () => {
    // Destroys a recorded best (or an in-progress lap) — confirm first.
    if (bestLapMs > 0 || lap.status === 'running') setConfirmShuffle(true)
    else shuffleCourse()
  }

  const stickSize = fullscreen ? 140 : 88
  const stickInset = fullscreen ? 16 : 0

  const toggleView = () =>
    dispatch(updateWidgetData({ id, data: { view: view === 'tp' ? 'fp' : 'tp' } }))

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
            hudRef={hudRef}
            timerRef={timerRef}
            colliders={layout.colliders}
            gates={layout.gates}
            weather={weather}
            windRef={windRef}
            crashMode={crashes}
            crashRef={crashRef}
            onCrash={onCrash}
            onCrashEnd={onCrashEnd}
            activeGate={activeGate}
            onGatePass={onGatePass}
            flashRef={flashRef}
            lap={lap}
            bestLapMs={bestLapMs}
            onLapComplete={onLapComplete}
          />
          <CameraRig view={view} flight={flight} />
        </Canvas>
      </Box>

      <Box
        ref={hudRef}
        data-testid="dronesim-hud"
        data-alt="2.0"
        data-speed="0.0"
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
        <Tooltip title={view === 'tp' ? 'Switch to first person' : 'Switch to third person'}>
          <IconButton
            size="small"
            data-testid="dronesim-view-toggle"
            data-view={view}
            aria-pressed={view === 'fp'}
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
        <Tooltip title={weather === 'storm' ? 'Clear weather' : 'Storm weather (wind + rain)'}>
          <IconButton
            size="small"
            data-testid="dronesim-weather-toggle"
            data-weather={weather}
            aria-pressed={weather === 'storm'}
            onClick={() =>
              dispatch(
                updateWidgetData({
                  id,
                  data: { weather: weather === 'storm' ? 'clear' : 'storm' },
                }),
              )
            }
            sx={{ color: '#fff' }}
          >
            {weather === 'storm' ? (
              <WbSunnyIcon fontSize="small" />
            ) : (
              <ThunderstormIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={crashes ? 'Safe mode (no crashes)' : 'Crash mode (hard impacts tumble)'}>
          <IconButton
            size="small"
            data-testid="dronesim-crash-toggle"
            data-crashes={crashes ? 'on' : 'off'}
            aria-pressed={crashes}
            onClick={() =>
              dispatch(updateWidgetData({ id, data: { crashes: !crashes } }))
            }
            sx={{ color: '#fff' }}
          >
            {crashes ? (
              <ShieldIcon fontSize="small" />
            ) : (
              <LocalFireDepartmentIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="New course (shuffle buildings & gates)">
          <IconButton
            size="small"
            data-testid="dronesim-new-course"
            onClick={requestShuffle}
            sx={{ color: '#fff' }}
          >
            <ShuffleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <ConfirmDialog
        open={confirmShuffle}
        title="New course?"
        message="Shuffling the buildings and gates clears your lap count, best time and ghost line for this course."
        confirmLabel="Shuffle"
        cancelLabel="Keep course"
        onConfirm={shuffleCourse}
        onCancel={() => setConfirmShuffle(false)}
      />

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
