import { useEffect, useState } from 'react'
import type { FlightGroundPoint } from './FlightBinding'
import { planFlight, type Building, type FlightPlan } from './flightPlanModel'
import { bboxAround, fetchBuildings } from './overpass'

export type FlightPlanStatus = 'idle' | 'planning' | 'ready' | 'error'

export interface FlightPlanState {
  plan: FlightPlan
  /** 'error' = building data unreachable — the plan flew direct instead. */
  status: FlightPlanStatus
}

const EMPTY: FlightPlanState = {
  plan: { legs: [], path: [], climbs: 0, detours: 0, blocked: 0 },
  status: 'idle',
}

/**
 * Waypoints + settings → the building-aware flight plan. Debounced 400 ms
 * (clicks come in bursts), abort-on-change; when Overpass is unreachable
 * the plan is computed against the drawn zones alone and status flips to
 * 'error' so the control can say the building data is missing. `zones`
 * are user-drawn no-fly shapes — Infinity-height Buildings the planner
 * can never climb over, only detour around.
 */
export function useFlightPlan(
  points: FlightGroundPoint[],
  cruise: number,
  allowClimb: boolean,
  ceiling: number,
  zones: Building[],
): FlightPlanState {
  const [state, setState] = useState<FlightPlanState>(EMPTY)

  useEffect(() => {
    if (points.length < 2) {
      setState({
        plan: planFlight(points, zones, { cruise, allowClimb, ceiling }),
        status: 'idle',
      })
      return
    }
    const abort = new AbortController()
    setState((prev) => ({ ...prev, status: 'planning' }))
    const timer = setTimeout(async () => {
      const bbox = bboxAround(points)
      let buildings: Awaited<ReturnType<typeof fetchBuildings>> = []
      let failed = false
      try {
        buildings = bbox ? await fetchBuildings(bbox, abort.signal) : []
      } catch {
        if (abort.signal.aborted) return
        failed = true
      }
      if (abort.signal.aborted) return
      setState({
        plan: planFlight(points, [...buildings, ...zones], { cruise, allowClimb, ceiling }),
        status: failed ? 'error' : 'ready',
      })
    }, 400)
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [points, cruise, allowClimb, ceiling, zones])

  return state
}
