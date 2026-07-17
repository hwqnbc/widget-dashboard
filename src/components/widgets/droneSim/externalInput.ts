/**
 * Gamepad + keyboard input for the drone sim. Both sources write the same
 * shared mutable `ControlInput` ref the touch joysticks use — zero flight-
 * model changes, and everything downstream (acro, tuning, the manual
 * operator walk) inherits them for free.
 *
 * Arbitration ("last active source wins"): the joysticks only write on
 * pointer events, while a gamepad must be polled every frame — a naive poll
 * would stomp touch input with zeros. So an external source only writes
 * while it is ACTIVE (past its deadzone / keys held); when it goes idle it
 * writes zeros exactly once and releases ownership back to touch.
 */
import type { ControlInput } from './flightModel'

export type ExternalSource = 'gamepad' | 'keyboard'

export interface ExternalSample {
  lx: number
  ly: number
  rx: number
  ry: number
}

export interface ExternalState {
  /** Which external source currently drives the controls (null = touch). */
  owner: ExternalSource | null
}

export const EXT_DEADZONE = 0.12

export function createExternalSample(): ExternalSample {
  return { lx: 0, ly: 0, rx: 0, ry: 0 }
}

export function createExternalState(): ExternalState {
  return { owner: null }
}

/** Deadzone with rescale, so output is continuous from the deadzone edge —
 * the same feel as the on-screen sticks. */
export function applyExtDeadzone(v: number): number {
  const mag = Math.abs(v)
  if (mag < EXT_DEADZONE) return 0
  const scaled = (mag - EXT_DEADZONE) / (1 - EXT_DEADZONE)
  return Math.sign(v) * Math.min(1, scaled)
}

/**
 * Standard-layout gamepad axes → sample. Axes 0/1 = left stick, 2/3 =
 * right stick; gamepad Y is +down, the sim's stick Y is +up.
 * Left stick = throttle/yaw, right stick = strafe/forward (Mode 2).
 */
export function mapGamepadAxes(
  axes: readonly number[],
  out: ExternalSample,
): void {
  out.lx = applyExtDeadzone(axes[0] ?? 0)
  out.ly = applyExtDeadzone(-(axes[1] ?? 0))
  out.rx = applyExtDeadzone(axes[2] ?? 0)
  out.ry = applyExtDeadzone(-(axes[3] ?? 0))
}

/** Keys handled by the keyboard mapping (KeyboardEvent.code — layout-safe). */
export const DRONE_KEYS: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

/**
 * Digital ±1 mirror of the sticks: W/S = climb/descend, A/D = yaw,
 * arrows = forward/back + strafe.
 */
export function keySetToSample(
  keys: ReadonlySet<string>,
  out: ExternalSample,
): void {
  out.lx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
  out.ly = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
  out.rx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
  out.ry = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)
}

/**
 * Feed a source's sample into the shared controls under the ownership rule.
 * Active sample → claim + write. Idle sample → write zeros ONCE if this
 * source was the owner, then hand control back to touch.
 */
export function applyExternal(
  state: ExternalState,
  source: ExternalSource,
  sample: ExternalSample,
  controls: ControlInput,
): void {
  const active =
    sample.lx !== 0 || sample.ly !== 0 || sample.rx !== 0 || sample.ry !== 0
  if (active) {
    state.owner = source
    controls.left.x = sample.lx
    controls.left.y = sample.ly
    controls.right.x = sample.rx
    controls.right.y = sample.ry
  } else if (state.owner === source) {
    state.owner = null
    controls.left.x = 0
    controls.left.y = 0
    controls.right.x = 0
    controls.right.y = 0
  }
}

/** Scratch sample reused by the per-frame poll (allocation-free loop). */
const gpSample = createExternalSample()

/** Poll the first connected gamepad (if the API exists) into the controls.
 * Called from the sim loop every frame. */
export function pollGamepad(state: ExternalState, controls: ControlInput): void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return
  const pads = navigator.getGamepads()
  let pad: Gamepad | null = null
  for (const p of pads) {
    if (p) {
      pad = p
      break
    }
  }
  if (!pad) {
    // Pad unplugged while owning the controls: release cleanly.
    if (state.owner === 'gamepad') {
      gpSample.lx = 0
      gpSample.ly = 0
      gpSample.rx = 0
      gpSample.ry = 0
      applyExternal(state, 'gamepad', gpSample, controls)
    }
    return
  }
  mapGamepadAxes(pad.axes, gpSample)
  applyExternal(state, 'gamepad', gpSample, controls)
}
