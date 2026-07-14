import type { RefObject } from 'react'
import { Box, alpha } from '@mui/material'
import { OPERATOR, SPAWN, WORLD_HALF } from './flightModel'
import type { BuildingSpec, LandingPadSpec, RingSpec } from './worldLayout'
import { RING_RADIUS } from './worldLayout'

const DONE_COLOR = '#4caf50'
const ACTIVE_COLOR = '#ffca28'
const UPCOMING_COLOR = '#9aa2b1'

/**
 * Top-down inset map. svgX = worldX and svgY = worldZ, so the drone's initial
 * forward direction (-Z) points up. Everything here is static per
 * layout/gate-state render EXCEPT the drone marker: its `transform` is
 * written imperatively by DroneRig on the telemetry tick, so flying never
 * re-renders the map. `pointerEvents: 'none'` keeps it purely decorative.
 */
export default function Minimap({
  buildings,
  rings,
  activeGate,
  bestLapPath,
  landingPads,
  droneRef,
  operatorRef,
  size,
}: {
  buildings: readonly BuildingSpec[]
  rings: readonly RingSpec[]
  activeGate: number
  bestLapPath: readonly number[]
  /** Empty unless the landing challenge is active. */
  landingPads: readonly LandingPadSpec[]
  droneRef: RefObject<SVGGElement | null>
  /** Walking-operator dot — transform written on the tick like the drone. */
  operatorRef: RefObject<SVGGElement | null>
  size: number
}) {
  const ghostPoints: string[] = []
  for (let i = 0; i + 2 < bestLapPath.length; i += 3) {
    ghostPoints.push(`${bestLapPath[i]},${bestLapPath[i + 2]}`)
  }

  return (
    <Box
      data-testid="dronesim-minimap"
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

        {ghostPoints.length > 1 && (
          <polyline
            points={ghostPoints.join(' ')}
            fill="none"
            stroke={ACTIVE_COLOR}
            strokeOpacity={0.4}
            strokeWidth={0.8}
          />
        )}

        <circle
          cx={SPAWN.x}
          cy={SPAWN.z}
          r={2.2}
          fill="none"
          stroke={ACTIVE_COLOR}
          strokeWidth={1}
        />

        {rings.map((r, i) => {
          const state = i < activeGate ? 'done' : i === activeGate ? 'active' : 'upcoming'
          const color =
            state === 'done' ? DONE_COLOR : state === 'active' ? ACTIVE_COLOR : UPCOMING_COLOR
          return (
            <circle
              key={i}
              data-gate-state={state}
              cx={r.x}
              cy={r.z}
              r={RING_RADIUS}
              fill={color}
              fillOpacity={state === 'active' ? 0.9 : 0.6}
            />
          )
        })}

        {landingPads.map((p, i) => (
          <circle
            key={`pad-${i}`}
            data-landing-pad
            cx={p.x}
            cy={p.z}
            r={p.r + 0.8}
            fill="#26c6da"
            fillOpacity={0.85}
          />
        ))}

        {/* operator dot: transform written by DroneRig on the telemetry tick */}
        <g
          ref={operatorRef}
          data-testid="dronesim-minimap-operator"
          transform={`translate(${OPERATOR.x} ${OPERATOR.z})`}
        >
          <circle r={1.6} fill="#ffab40" stroke="#000" strokeWidth={0.4} />
        </g>

        {/* drone marker: transform written by DroneRig on the telemetry tick */}
        <g ref={droneRef} data-testid="dronesim-minimap-drone">
          <polygon points="0,-4 2.6,3 0,1.4 -2.6,3" fill="#ffffff" stroke="#000" strokeWidth={0.4} />
        </g>
      </svg>
    </Box>
  )
}
