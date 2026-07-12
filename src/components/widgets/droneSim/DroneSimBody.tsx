import { useCallback, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { usePresentation } from '../../fullscreen/presentation'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'
import type { DroneView } from './flightModel'
import {
  coerceView,
  createControlInput,
  createFlightState,
  resetFlightState,
} from './flightModel'
import { GATES } from './worldLayout'
import WorldScene from './WorldScene'
import DroneRig from './DroneRig'
import CameraRig from './CameraRig'
import GateRings from './GateRings'
import type { GateFlash } from './GateRings'
import VirtualJoystick from './VirtualJoystick'

/**
 * The 3D drone simulator. Everything inside <Canvas> renders in a separate
 * React root, so theme-derived values are resolved here and passed as props.
 * High-frequency state (joystick vectors, flight pose) lives in mutable refs
 * shared between the sticks and the sim loop — flying never re-renders React.
 */
export default function DroneSimBody({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE
  const { fullscreen } = usePresentation()
  const view = useWidgetField<DroneView>(id, 'view', 'tp', coerceView)
  const score = useWidgetField(id, 'score', 0)

  const controls = useRef(createControlInput()).current
  const flight = useRef(createFlightState()).current
  const hudRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<GateFlash>({ gate: -1, until: 0 })
  // Which ring must be flown through next; transient — a reload (or reset)
  // restarts the course, only the score persists.
  const [activeGate, setActiveGate] = useState(0)

  const onGatePass = useCallback(() => {
    setActiveGate((gate) => {
      if (gate < GATES.length - 1) return gate + 1
      dispatch(updateWidgetData({ id, data: { score: score + 1 } }))
      return 0
    })
  }, [dispatch, id, score])

  const resetSim = () => {
    resetFlightState(flight)
    setActiveGate(0)
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
          <WorldScene palette={palette} />
          <GateRings palette={palette} activeGate={activeGate} flashRef={flashRef} />
          <DroneRig
            controls={controls}
            flight={flight}
            hudRef={hudRef}
            activeGate={activeGate}
            onGatePass={onGatePass}
            flashRef={flashRef}
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
        {`GATE ${activeGate + 1}/${GATES.length} · SCORE ${score}`}
      </Box>

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
      </Box>

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
