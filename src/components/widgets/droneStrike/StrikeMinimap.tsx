import type { RefObject } from 'react'
import { Box, alpha } from '@mui/material'
import { SPAWN, WORLD_HALF } from '../droneSim/flightModel'
import type { BuildingSpec } from '../droneSim/worldLayout'
import { MAX_TARGETS } from './waveLayout'

/**
 * Top-down radar: buildings + spawn pad are static per layout; the drone
 * marker and one blip per target-pool slot are updated imperatively by
 * StrikeRig on the telemetry tick (position, kind colour, visibility), so
 * a drifting gallery or an orbiting enemy never re-renders React.
 */
export default function StrikeMinimap({
  buildings,
  droneRef,
  targetRefs,
  size,
}: {
  buildings: readonly BuildingSpec[]
  droneRef: RefObject<SVGGElement | null>
  /** One <circle> per target slot, written on the tick. */
  targetRefs: RefObject<(SVGCircleElement | null)[]>
  size: number
}) {
  return (
    <Box
      data-testid="strike-minimap"
      sx={{
        position: 'absolute',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: size,
        height: size,
        borderRadius: 1,
        bgcolor: alpha('#000', 0.45),
        border: `1px solid ${alpha('#fff', 0.25)}`,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={`-${WORLD_HALF} -${WORLD_HALF} ${WORLD_HALF * 2} ${WORLD_HALF * 2}`}
        width="100%"
        height="100%"
      >
        <g fill={alpha('#ffffff', 0.28)}>
          {buildings.map((b, i) => (
            <rect key={i} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} />
          ))}
        </g>

        <circle
          cx={SPAWN.x}
          cy={SPAWN.z}
          r={2.2}
          fill="none"
          stroke="#ffca28"
          strokeWidth={1}
        />

        {/* target blips: cx/cy/fill/display written by StrikeRig on the tick */}
        {Array.from({ length: MAX_TARGETS }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              targetRefs.current[i] = el
            }}
            r={1.8}
            display="none"
          />
        ))}

        {/* drone marker: transform written by StrikeRig on the tick */}
        <g ref={droneRef} data-testid="strike-minimap-drone">
          <polygon
            points="0,-4 2.6,3 0,1.4 -2.6,3"
            fill="#ffffff"
            stroke="#000"
            strokeWidth={0.4}
          />
        </g>
      </svg>
    </Box>
  )
}
