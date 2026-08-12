/**
 * Boss weak-point model for Drone Strike — pure (no React, no three.js).
 *
 * The boss drone's hull is ARMOURED: every shot that lands on it deflects.
 * Damage only lands inside one of three **weak-point pods** riding a
 * horizontal ring around the hull, and a destroyed pod goes inert (hits
 * there deflect too), so the fight is a repositioning puzzle — keep a live
 * pod in view and put shots on it.
 *
 * This module is the SINGLE source of truth for where the pods are: the
 * renderer (`BossDrone`) spins its pod group by the same `podPhase` the
 * rig's hit test resolves against, so what you see is exactly what you can
 * hit. The phase itself is written once per frame by `StrikeRig` onto the
 * target state (the single-writer/aimRefs pattern).
 */
import type { Vec3 } from '../droneSim/flightModel'

/** Weak-point pods per boss. */
export const BOSS_POD_COUNT = 3
/** Pod hit-sphere radius. Sets how forgiving the weak point is: a shot must
 * land within this of a pod centre, so on the hull sphere each pod covers a
 * cap of about ±22° around its own bearing (arccos((hull² + ring² − pod²) /
 * (2·hull·ring))). Generous enough to hit while roughly level with the boss,
 * tight enough that most of the hull is armour. */
export const BOSS_POD_RADIUS = 0.85
/** Distance of a pod centre from the hull centre — just inside the hull
 * surface, so the pods bulge visibly past it (ring + radius > hull) and a
 * shot landing on the hull outward of one counts as a pod hit. */
export const BOSS_POD_RING = 1.9
/** The boss's hull hit sphere (mirrors the seeded BOSS_RADIUS). */
export const BOSS_HULL_R = 2.2
/** Ring rotation rate, rad/s — the pods sweep past, so a firing position
 * only stays good for a few seconds. */
export const BOSS_SPIN = 0.6

/** Angular spacing between pods. */
const POD_STEP = (Math.PI * 2) / BOSS_POD_COUNT

/**
 * World centre of pod `i` for a boss at `pos` with ring phase `phase`.
 * Writes into `out` (allocation-free) and returns it.
 */
export function podCenter(i: number, pos: Vec3, phase: number, out: Vec3): Vec3 {
  const a = phase + i * POD_STEP
  out.x = pos.x + Math.cos(a) * BOSS_POD_RING
  out.y = pos.y
  out.z = pos.z + Math.sin(a) * BOSS_POD_RING
  return out
}

/** Scratch pod centre reused by the queries below (allocation-free). */
const POD: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * Which pod did this impact point land in? Returns the index of the nearest
 * **live** pod (`podHp[i] > 0`) whose sphere contains the point, or -1 when
 * the shot hit bare hull (or a destroyed pod) — armour, no damage.
 */
export function podHitAt(
  impact: Vec3,
  pos: Vec3,
  phase: number,
  podHp: readonly number[],
): number {
  let best = -1
  let bestD = BOSS_POD_RADIUS
  for (let i = 0; i < BOSS_POD_COUNT; i++) {
    if (podHp[i] <= 0) continue
    podCenter(i, pos, phase, POD)
    const d = Math.hypot(impact.x - POD.x, impact.y - POD.y, impact.z - POD.z)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * The live pod nearest `from` — the one facing the shooter. Writes its world
 * centre into `out` and returns its index, or -1 when every pod is dead (the
 * boss is about to die anyway). Used to RETARGET aim assist and the soft
 * track: both otherwise aim at the target centre, which on an armoured boss
 * is exactly where shots do nothing (see docs/lessons.md).
 */
export function nearestLivePod(
  from: Vec3,
  pos: Vec3,
  phase: number,
  podHp: readonly number[],
  out: Vec3,
): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < BOSS_POD_COUNT; i++) {
    if (podHp[i] <= 0) continue
    podCenter(i, pos, phase, POD)
    const d = Math.hypot(from.x - POD.x, from.y - POD.y, from.z - POD.z)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best >= 0) podCenter(best, pos, phase, out)
  return best
}

/** How many pods are still live. */
export function podsLeft(podHp: readonly number[]): number {
  let n = 0
  for (let i = 0; i < BOSS_POD_COUNT; i++) if (podHp[i] > 0) n++
  return n
}
