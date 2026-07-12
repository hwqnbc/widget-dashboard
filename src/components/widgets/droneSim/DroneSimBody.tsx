import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Box, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'
import { SPAWN, createControlInput } from './flightModel'
import WorldScene from './WorldScene'
import DroneModel from './DroneModel'

/**
 * The 3D drone simulator. Everything inside <Canvas> renders in a separate
 * React root, so theme-derived values are resolved here and passed as props.
 */
export default function DroneSimBody({ id }: WidgetProps) {
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE
  // Live joystick values — mutated by the sticks, read by the sim loop each
  // frame. Never goes through React state (pointer moves fire 60-120 Hz).
  const controls = useRef(createControlInput()).current

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
          <group position={[SPAWN.x, SPAWN.y, SPAWN.z]}>
            <DroneModel controls={controls} />
          </group>
        </Canvas>
      </Box>
    </Box>
  )
}
