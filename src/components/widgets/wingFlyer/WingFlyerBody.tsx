import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Box, useTheme } from '@mui/material'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { DAY_PALETTE, NIGHT_PALETTE } from '../droneSim/palettes'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import { DEFAULT_ISLAND_SEED, STRIP, STRIP_Y, buildIsland } from './islandLayout'
import IslandScene, { FOG_FAR } from './IslandScene'

const coerceSeed = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Step-3 overview camera: a slow orbit around the airstrip so the island
 * can be checked before the plane exists (replaced by the chase cam). */
function OverviewCamera() {
  const t = useRef(0)
  useFrame(({ camera }, dt) => {
    t.current += dt * 0.05
    const a = t.current
    camera.position.set(STRIP.x + Math.sin(a) * 260, STRIP_Y + 110, STRIP.z + Math.cos(a) * 260)
    camera.lookAt(0, 20, 0)
  })
  return null
}

/**
 * Wing Flyer body — the lazy three.js chunk (the shell in WingFlyerWidget
 * stays chunk-free). Builds the seeded island and renders it.
 */
export default function WingFlyerBody({ id }: WidgetProps) {
  const worldSeed = useWidgetField(id, 'worldSeed', DEFAULT_ISLAND_SEED, coerceSeed)
  const island = useMemo(() => buildIsland(worldSeed), [worldSeed])
  const mode = useTheme().palette.mode
  const palette = mode === 'dark' ? NIGHT_PALETTE : DAY_PALETTE

  return (
    <Box
      className="widget-no-drag"
      data-testid="wingflyer-root"
      data-widget-id={id}
      data-world-seed={worldSeed}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        position: 'relative',
        height: '100%',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: palette.sky,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Box data-testid="wingflyer-canvas" sx={{ position: 'absolute', inset: 0 }}>
        <Canvas frameloop="always" dpr={[1, 1.75]} camera={{ fov: 60, near: 0.5, far: FOG_FAR + 60 }}>
          <IslandScene spec={island} palette={palette} />
          <OverviewCamera />
        </Canvas>
      </Box>
    </Box>
  )
}
