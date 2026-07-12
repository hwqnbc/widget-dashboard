import { Canvas } from '@react-three/fiber'
import { Box, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from './palettes'

/**
 * The 3D drone simulator. Everything inside <Canvas> renders in a separate
 * React root, so theme-derived values are resolved here and passed as props.
 */
export default function DroneSimBody({ id }: WidgetProps) {
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE

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
          <color attach="background" args={[palette.sky]} />
        </Canvas>
      </Box>
    </Box>
  )
}
