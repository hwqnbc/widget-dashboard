/**
 * The walking operator — a pure, mutate-in-place, React-free state machine
 * (like `lapTimer`). In the 'walk' view the operator follows the drone on
 * foot to keep it in sight, and when the battery kills the drone at ground
 * level, walks over, picks it up and carries it back to the charging pad
 * (auto-walking by default; the right stick steers instead while the drone
 * is down). Deliberately slow: WALK_SPEED is a human pace — losing sight of
 * a fast drone is the intended trade-off of the mode, not a bug.
 */
import type { Collider, Vec2 } from './flightModel'
import { DRONE_RADIUS, OPERATOR, SPAWN, WORLD_HALF } from './flightModel'
import { PAD_CENTER, PAD_START_RADIUS } from './lapTimer'

export type OperatorMode = 'idle' | 'follow' | 'retrieve' | 'carry'

export interface OperatorState {
  x: number
  z: number
  /** Facing, drone-yaw convention (-Z forward at 0). */
  heading: number
  mode: OperatorMode
  /** Total distance walked — drives the figure/camera bob. */
  walkPhase: number
}

/** Hard walking-speed cap (u/s) — ~18% of the drone's top speed. */
export const WALK_SPEED = 2.2
/** Follow hysteresis: start walking beyond START, stop inside STOP. STOP is
 * the persisted, user-preferred follow distance (a high-hovering drone makes
 * a close stop a neck-craning look-up); START is always STOP + the band. */
export const FOLLOW_STOP = 7
export const FOLLOW_BAND = 3
export const FOLLOW_START = FOLLOW_STOP + FOLLOW_BAND
export const MIN_FOLLOW = 5
export const MAX_FOLLOW = 18

export const coerceFollowDist = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(MAX_FOLLOW, Math.max(MIN_FOLLOW, Math.round(v)))
    : undefined
export const PICKUP_DIST = 1.3
export const OP_RADIUS = 0.4
/** A dead drone is reachable on foot only at ground level (roofs aren't —
 * reset remains the rescue there). */
export const GROUND_EPS = 0.15
/** Carried drones ride at hand height this far in front of the operator. */
export const CARRY_HEIGHT = 1.0
export const CARRY_REACH = 0.5

/** What the walker needs to know about the drone this frame. */
export interface DroneSummary {
  x: number
  z: number
  /** Battery-dead (sticks are DEAD_INPUT for the drone). */
  dead: boolean
  /** Resting at ground level (pos.y ≤ DRONE_RADIUS + GROUND_EPS). */
  grounded: boolean
}

export type WalkerEvent = 'pickup' | 'place'

const INITIAL_HEADING = Math.atan2(OPERATOR.x - SPAWN.x, OPERATOR.z - SPAWN.z)
/** Colliders are pre-inflated by DRONE_RADIUS; widen to the operator. */
const EXTRA = OP_RADIUS - DRONE_RADIUS

export function createOperatorState(): OperatorState {
  return {
    x: OPERATOR.x,
    z: OPERATOR.z,
    heading: INITIAL_HEADING,
    mode: 'idle',
    walkPhase: 0,
  }
}

export function resetOperatorState(op: OperatorState): void {
  op.x = OPERATOR.x
  op.z = OPERATOR.z
  op.heading = INITIAL_HEADING
  op.mode = 'idle'
  op.walkPhase = 0
}

/** Push the operator out of building footprints along the axis of least
 * penetration (x/z only — the op walks on the ground), so walking toward a
 * target slides along walls instead of entering them. */
function resolveOperator(op: OperatorState, colliders: readonly Collider[]): void {
  for (const c of colliders) {
    const minX = c.minX - EXTRA
    const maxX = c.maxX + EXTRA
    const minZ = c.minZ - EXTRA
    const maxZ = c.maxZ + EXTRA
    if (op.x <= minX || op.x >= maxX || op.z <= minZ || op.z >= maxZ) continue
    const pushW = op.x - minX
    const pushE = maxX - op.x
    const pushN = op.z - minZ
    const pushS = maxZ - op.z
    const min = Math.min(pushW, pushE, pushN, pushS)
    if (min === pushW) op.x = minX
    else if (min === pushE) op.x = maxX
    else if (min === pushN) op.z = minZ
    else op.z = maxZ
  }
}

/**
 * Advance the operator one frame. Returns 'pickup' the frame the dead drone
 * is grabbed, 'place' the frame it is set down on the pad, else null.
 * `stick` is the right-stick vector — while the drone is down it steers the
 * walk (world-aligned: y = -Z/"up the map", x = +X) instead of the autopilot.
 * `hold` freezes the FOLLOW autopilot (stand at the current spot); a rescue
 * (retrieve/carry) deliberately overrides it — fetching the drone is why
 * you walked out here.
 */
export function stepOperator(
  op: OperatorState,
  dt: number,
  drone: DroneSummary,
  stick: Vec2,
  colliders: readonly Collider[],
  hold = false,
  followDist: number = FOLLOW_STOP,
): WalkerEvent | null {
  const step = Math.min(dt, 0.05)

  // Mode transitions. Carry survives everything except the drone reviving
  // under us (reset refilled it) — then the job is moot.
  if (op.mode === 'carry') {
    if (!drone.dead) op.mode = 'follow'
  } else if (drone.dead && drone.grounded) {
    op.mode = 'retrieve'
  } else if (op.mode === 'retrieve') {
    op.mode = 'follow' // revived / respawned mid-walk
  }

  let tx: number
  let tz: number
  if (op.mode === 'carry') {
    tx = PAD_CENTER.x
    tz = PAD_CENTER.z
    if (Math.hypot(op.x - tx, op.z - tz) <= PAD_START_RADIUS - 0.4) {
      op.mode = 'follow'
      return 'place'
    }
  } else if (op.mode === 'retrieve') {
    tx = drone.x
    tz = drone.z
    if (Math.hypot(op.x - tx, op.z - tz) <= PICKUP_DIST) {
      op.mode = 'carry'
      return 'pickup'
    }
  } else {
    if (hold) {
      op.mode = 'idle'
      return null
    }
    const d = Math.hypot(op.x - drone.x, op.z - drone.z)
    if (op.mode !== 'follow' && d > followDist + FOLLOW_BAND) op.mode = 'follow'
    else if (op.mode === 'follow' && d <= followDist) op.mode = 'idle'
    if (op.mode !== 'follow') return null
    tx = drone.x
    tz = drone.z
  }

  let dirX: number
  let dirZ: number
  const stickMag = Math.hypot(stick.x, stick.y)
  if ((op.mode === 'carry' || op.mode === 'retrieve') && stickMag > 0.15) {
    dirX = stick.x / stickMag
    dirZ = -stick.y / stickMag
  } else {
    const dx = tx - op.x
    const dz = tz - op.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-6) return null
    dirX = dx / d
    dirZ = dz / d
  }

  const move = WALK_SPEED * step
  op.x += dirX * move
  op.z += dirZ * move
  op.walkPhase += move
  op.heading = Math.atan2(-dirX, -dirZ)
  op.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, op.x))
  op.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, op.z))
  resolveOperator(op, colliders)
  return null
}
