import { useCallback, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, alpha, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'
import { createControlInput, createFlightState } from './flightModel'
import WorldScene from './WorldScene'
import DroneRig from './DroneRig'
import VirtualJoystick from './VirtualJoystick'

/**
 * The 3D drone simulator. Everything inside <Canvas> renders in a separate
 * React root, so theme-derived values are resolved here and passed as props.
 * High-frequency state (joystick vectors, flight pose) lives in mutable refs
 * shared between the sticks and the sim loop — flying never re-renders React.
 */
export default function DroneSimBody({ id }: WidgetProps) {
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE

  const controls = useRef(createControlInput()).current
  const flight = useRef(createFlightState()).current
  const hudRef = useRef<HTMLDivElement>(null)

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
          <DroneRig controls={controls} flight={flight} hudRef={hudRef} />
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

      <VirtualJoystick
        size={88}
        label="THR · YAW"
        testId="dronesim-joystick-left"
        onChange={onLeftStick}
        sx={{ position: 'absolute', left: 0, bottom: 0 }}
      />
      <VirtualJoystick
        size={88}
        label="MOVE"
        testId="dronesim-joystick-right"
        onChange={onRightStick}
        sx={{ position: 'absolute', right: 0, bottom: 0 }}
      />
    </Box>
  )
}
