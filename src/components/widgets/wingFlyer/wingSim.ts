/**
 * The one shared Wing Flyer sim object (lesson #41): created once by the
 * body, mutated by the rig every frame, read by the DOM layer. Pure.
 */
import type { AssistSticks, AssistState } from './assists'
import { createAssist } from './assists'
import type { PlaneCommand, PlaneState, StepOptions } from './planeModel'
import { createPlaneState } from './planeModel'

/** Everything the rig mutates — one shared object, created once by the body
 * (lesson #41), so the DOM layer and the canvas read the same state. */
export interface WingSim {
  s: PlaneState
  a: AssistState
  cmd: PlaneCommand
  opts: StepOptions
  sticks: AssistSticks
  acc: number
  /** Seconds left in the crash tumble (> 0 = crashed). */
  crash: number
  /** Request flags set by the DOM layer, consumed by the rig. */
  resetRequested: boolean
  /** Count of crashes this session (test contract). */
  crashes: number
}

export function createWingSim(): WingSim {
  return {
    s: createPlaneState(),
    a: createAssist(),
    cmd: { roll: 0, pitch: 0, yaw: 0, throttle: 0 },
    opts: {},
    sticks: { left: { x: 0, y: -1 }, right: { x: 0, y: 0 } },
    acc: 0,
    crash: 0,
    resetRequested: true,
    crashes: 0,
  }
}

