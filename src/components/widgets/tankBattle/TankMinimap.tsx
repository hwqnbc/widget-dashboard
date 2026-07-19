import type { RefObject } from 'react'
import { Box, alpha } from '@mui/material'
import type { TerrainSpec } from './terrain'
import { TANK_SPAWN, TANK_WORLD_HALF } from './terrain'
import { MAX_TANK_TARGETS } from './battleLayout'

/**
 * Top-down tactical map. The terrain reads as soft contour blobs — one
 * translucent circle per seeded hill (dark = high ground, faint ring =
 * basin) — plus rock dots, the spawn ring, enemy blips and the player
 * marker. Blips and the marker are written imperatively by TankRig on the
 * telemetry tick; everything else is static per terrain.
 */
export default function TankMinimap({
  terrain,
  tankRef,
  targetRefs,
  size,
}: {
  terrain: TerrainSpec
  tankRef: RefObject<SVGGElement | null>
  targetRefs: RefObject<(SVGCircleElement | null)[]>
  size: number
}) {
  const H = TANK_WORLD_HALF
  return (
    <Box
      data-testid="tank-minimap"
      sx={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: size,
        height: size,
        borderRadius: 1,
        bgcolor: alpha('#12240f', 0.55),
        border: `1px solid ${alpha('#fff', 0.25)}`,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <svg viewBox={`-${H} -${H} ${H * 2} ${H * 2}`} width="100%" height="100%">
        {/* contour blobs: high ground darkens, basins ring faintly */}
        {terrain.hills.map((h, i) =>
          h.h >= 0 ? (
            <circle
              key={i}
              cx={h.x}
              cy={h.z}
              r={h.r}
              fill={alpha('#2e4d24', Math.min(0.7, 0.18 + h.h * 0.06))}
            />
          ) : (
            <circle
              key={i}
              cx={h.x}
              cy={h.z}
              r={h.r * 0.8}
              fill="none"
              stroke={alpha('#9ecbff', 0.25)}
              strokeWidth={1.2}
            />
          ),
        )}
        <g fill={alpha('#c9cdd2', 0.55)}>
          {terrain.rocks.map((r, i) => (
            <circle key={i} cx={r.x} cy={r.z} r={Math.max(0.8, r.r * 0.7)} />
          ))}
        </g>

        <circle
          cx={TANK_SPAWN.x}
          cy={TANK_SPAWN.z}
          r={3.4}
          fill="none"
          stroke="#ffca28"
          strokeWidth={1}
        />

        {/* enemy blips: cx/cy/fill/display written by TankRig on the tick */}
        {Array.from({ length: MAX_TANK_TARGETS }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              targetRefs.current[i] = el
            }}
            r={2}
            display="none"
          />
        ))}

        {/* player marker: transform written by TankRig on the tick */}
        <g ref={tankRef} data-testid="tank-minimap-marker">
          <polygon
            points="0,-4.4 3,3.2 0,1.6 -3,3.2"
            fill="#ffffff"
            stroke="#000"
            strokeWidth={0.4}
          />
        </g>
      </svg>
    </Box>
  )
}
