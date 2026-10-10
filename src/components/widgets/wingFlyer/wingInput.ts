/**
 * Wing Flyer input — merges touch, keyboard and gamepad into the assist's
 * stick convention (`AssistSticks`). Pure and allocation-free; the rig calls
 * `mergeInput` once per frame.
 *
 * Throttle is a LATCHED value (`throttle`, −1 idle … +1 full) that every
 * source moves: the touch stick writes it directly (VirtualJoystick
 * `latchY` + `latchRef`), W/S and the gamepad's left stick RAMP it (they
 * spring back, a real throttle does not). Everything else is "last active
 * source wins", like the drone (lesson: a polled-but-idle pad must never
 * stomp the touch sticks).
 *
 * Pitch follows the RC convention: pulling the stick back (down / ↓ key)
 * raises the nose. `invertPitch` flips it.
 */
import { applyExtDeadzone } from '../droneSim/externalInput'
import type { AssistSticks } from './assists'

export interface WingInput {
  /** Touch sticks, raw from VirtualJoystick (y = +1 pushed up). */
  touchLeftX: number
  touchRightX: number
  touchRightY: number
  /** Latched throttle −1..1 (shared with the touch stick's `latchRef`). */
  throttle: { current: number }
  /** Held keys (KeyboardEvent.code). */
  keys: Set<string>
  /** Panic requested this frame (Space / gamepad A) — consumed by the rig. */
  panic: boolean
  /** Who last drove the attitude sticks: for the HUD contract. */
  source: 'touch' | 'keyboard' | 'gamepad'
}

export const WING_KEYS: ReadonlySet<string> = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
])

/** Throttle ramp rates, per second of full deflection. */
export const KEY_THROTTLE_RATE = 0.9
export const PAD_THROTTLE_RATE = 1.2

export function createWingInput(): WingInput {
  return {
    touchLeftX: 0,
    touchRightX: 0,
    touchRightY: 0,
    throttle: { current: -1 },
    keys: new Set(),
    panic: false,
    source: 'touch',
  }
}

const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v)

/**
 * Merge every source into `out` (assist convention: right.y + = nose up).
 * `pad` is the standard-layout axes array of a connected gamepad, or null.
 */
export function mergeInput(
  inp: WingInput,
  pad: readonly number[] | null,
  dt: number,
  invertPitch: boolean,
  out: AssistSticks,
): void {
  const k = inp.keys
  const keyRoll = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
  // ↓ = pull back = nose up.
  const keyPitch = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0)
  const keyRudder = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
  const keyThr = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)

  const padLx = pad ? applyExtDeadzone(pad[0] ?? 0) : 0
  const padLy = pad ? applyExtDeadzone(-(pad[1] ?? 0)) : 0
  const padRx = pad ? applyExtDeadzone(pad[2] ?? 0) : 0
  // Gamepad Y is +down: stick pulled back (down) → nose up, directly.
  const padRy = pad ? applyExtDeadzone(pad[3] ?? 0) : 0

  // Throttle: ramps from keys / pad, set directly by touch.
  if (keyThr !== 0) inp.throttle.current = clamp1(inp.throttle.current + keyThr * KEY_THROTTLE_RATE * dt)
  else if (padLy !== 0) inp.throttle.current = clamp1(inp.throttle.current + padLy * PAD_THROTTLE_RATE * dt)

  let roll: number
  let pitch: number
  let rudder: number
  if (keyRoll !== 0 || keyPitch !== 0 || keyRudder !== 0) {
    roll = keyRoll
    pitch = keyPitch
    rudder = keyRudder
    inp.source = 'keyboard'
  } else if (padRx !== 0 || padRy !== 0 || padLx !== 0) {
    roll = padRx
    pitch = padRy
    rudder = padLx
    inp.source = 'gamepad'
  } else {
    roll = inp.touchRightX
    // Touch y is +up (pushed forward = nose down).
    pitch = -inp.touchRightY
    rudder = inp.touchLeftX
    if (roll !== 0 || pitch !== 0 || rudder !== 0) inp.source = 'touch'
  }
  out.right.x = roll
  out.right.y = invertPitch ? -pitch : pitch
  out.left.x = rudder
  out.left.y = inp.throttle.current
}
