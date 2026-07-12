/**
 * Time-trial lap state machine — pure, React-free, mutate-in-place like
 * stepFlight. A lap runs pad → all gates in order → back to the pad:
 *
 *   ready ──(drone leaves the pad radius)──▶ running ──(all gates passed
 *   AND drone re-enters the pad radius)──▶ 'finished' event, back to ready.
 *
 * Timing uses wall-clock milliseconds supplied by the caller
 * (performance.now()), not the canvas clock.
 */
import { SPAWN } from './flightModel'

export interface LapState {
  status: 'ready' | 'running'
  /** Wall-clock ms at lap start; meaningful only while running. */
  startMs: number
}

export type LapEvent = 'started' | 'finished'

export const PAD_CENTER = { x: SPAWN.x, z: SPAWN.z }
/** Matches the landing-pad cylinder radius in the scene. */
export const PAD_START_RADIUS = 2.2

export function createLapState(): LapState {
  return { status: 'ready', startMs: 0 }
}

export function resetLapState(lap: LapState): void {
  lap.status = 'ready'
  lap.startMs = 0
}

/**
 * Advance the lap state for this frame. `activeGate === gateCount` means all
 * gates have been passed (the "return to pad" phase). Returns an event when
 * the state changed, else null. `selfPropelled` is whether the drone's own
 * velocity is carrying it (vs. drifting on storm wind, which moves position
 * without velocity) — only deliberate flight starts the clock.
 */
export function updateLap(
  lap: LapState,
  pos: { x: number; z: number },
  activeGate: number,
  gateCount: number,
  nowMs: number,
  selfPropelled = true,
): LapEvent | null {
  const onPad =
    Math.hypot(pos.x - PAD_CENTER.x, pos.z - PAD_CENTER.z) <= PAD_START_RADIUS
  if (lap.status === 'ready') {
    if (!onPad && selfPropelled) {
      lap.status = 'running'
      lap.startMs = nowMs
      return 'started'
    }
    return null
  }
  if (activeGate === gateCount && onPad) {
    lap.status = 'ready'
    return 'finished'
  }
  // Back on the pad with no gates passed yet: silently re-arm so the pilot
  // can retry a start without the clock already running.
  if (activeGate === 0 && onPad) {
    lap.status = 'ready'
    lap.startMs = 0
  }
  return null
}

/** Format a lap time: "45.3s" under a minute, "1:23.4" above. */
export function fmtLap(ms: number): string {
  const totalSec = ms / 1000
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec - min * 60
  return `${min}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`
}
