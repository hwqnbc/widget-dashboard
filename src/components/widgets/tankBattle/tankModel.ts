/**
 * Pure tank driving model — no React, no three.js, mutate-in-place and
 * allocation-free (the flightModel discipline).
 *
 * Controls follow the mobile tank-game convention (WoT Blitz style), NOT the
 * drone's fly-to-aim:
 *   - Left stick drives the hull: y = throttle (reverse is slower), x =
 *     track turning (tanks pivot in place at zero throttle).
 *   - Right stick orbits the camera aim (`CamAim`); the TURRET CHASES the
 *     camera yaw with a rate-limited traverse — the visible lag between
 *     "where you look" and "where the gun points" is core tank feel.
 *   - Gun elevation is automatic: the reticle ray resolves an aim point and
 *     `solveShellPitch` finds the low ballistic arc that converges on it
 *     (out-of-arc solutions grey the reticle instead).
 *
 * The tank is glued to the heightfield: position.y and the damped visual
 * pitch/roll come from sampling `heightAt` under the four track corners
 * (the standard arcade four-point grounding), and steep grades slow then
 * block the climb, which is what makes ridges cover and routes decisions.
 */
import type { ControlInput, Tuning, Vec3 } from '../droneSim/flightModel'
import { MAX_DT, NEUTRAL_TUNING, applyExpo, damp } from '../droneSim/flightModel'
import type { TerrainSpec } from './terrain'
import { TANK_SPAWN, TANK_WORLD_HALF, heightAt } from './terrain'

/** Top forward speed, world-units/s (tanks are deliberate, not drones). */
export const TANK_MAX_SPEED = 9
/** Reverse gear fraction of forward speed. */
export const REVERSE_FACTOR = 0.55
/** Exponential response toward the speed target — heavy-vehicle inertia. */
export const TANK_ACCEL = 2.2
/** Hull turn rate, rad/s (full stick, pivot-in-place capable). */
export const HULL_TURN_RATE = 1.5
/** Turret traverse rate, rad/s — the readable chase-the-camera lag. */
export const TURRET_TRAVERSE = 1.6
/** Camera orbit rates, rad/s at full stick. */
export const CAM_YAW_RATE = 2.4
export const CAM_PITCH_RATE = 1.3
/** Camera aim elevation limits (radians; negative = looking down). */
export const CAM_PITCH_MIN = -0.5
export const CAM_PITCH_MAX = 0.4
/** Gun elevation arc (radians): −22° depression to +20° elevation. The
 * depression is deliberately generous for a tank game played entirely on
 * hills — a scale −8° made every downhill shot unsolvable in practice. */
export const BARREL_PITCH_MIN = -0.38
export const BARREL_PITCH_MAX = 0.35
/** Grade (rise/run) at which the climb stalls completely (~35°). */
export const MAX_GRADE = 0.7
/** Half-length / half-width of the track footprint (grounding samples). */
export const TANK_HALF_L = 1.6
export const TANK_HALF_W = 1.05
/** Collision circle against rocks / enemy hulls. */
export const TANK_RADIUS = 1.6
/** Rock/bound impact above this speed rattles the haptics. */
export const TANK_THUD_SPEED = 3
/** Turret ring height above the ground contact point. */
export const TURRET_HEIGHT = 1.55
/** Muzzle sits this far ahead of the turret ring along the barrel. */
export const MUZZLE_AHEAD = 2.3
/** How fast the visual pitch/roll follow the terrain under the tracks. */
const POSE_RESPONSE = 6

export interface TankState {
  /** Ground contact position — y is the terrain height under the tank. */
  pos: Vec3
  /** Velocity (derived each step) — feeds the rain adapter and telemetry. */
  vel: Vec3
  hullYaw: number
  /** Signed forward speed along the hull heading, u/s. */
  speed: number
  /** Damped terrain-follow attitude (radians; pitch > 0 = nose up). */
  pitch: number
  roll: number
  /** Turret yaw relative to the hull (the traverse chases the camera). */
  turretRel: number
  /** Damped visual barrel elevation (the fire path uses the live solve). */
  barrelPitch: number
}

/** Camera orbit aim — owned by the body as a shared ref, stepped by the rig,
 * read by the camera and the fire path (so the reticle is exact). */
export interface CamAim {
  yaw: number
  pitch: number
}

export function createTankState(): TankState {
  return {
    pos: { x: TANK_SPAWN.x, y: 0, z: TANK_SPAWN.z },
    vel: { x: 0, y: 0, z: 0 },
    hullYaw: 0,
    speed: 0,
    pitch: 0,
    roll: 0,
    turretRel: 0,
    barrelPitch: 0,
  }
}

export function resetTankState(t: TankState): void {
  t.pos.x = TANK_SPAWN.x
  t.pos.y = 0
  t.pos.z = TANK_SPAWN.z
  t.vel.x = 0
  t.vel.y = 0
  t.vel.z = 0
  t.hullYaw = 0
  t.speed = 0
  t.pitch = 0
  t.roll = 0
  t.turretRel = 0
  t.barrelPitch = 0
}

export function createCamAim(): CamAim {
  return { yaw: 0, pitch: -0.08 }
}

export function resetCamAim(a: CamAim): void {
  a.yaw = 0
  a.pitch = -0.08
}

export const wrapAngle = (a: number): number =>
  Math.atan2(Math.sin(a), Math.cos(a))

/** Ground pose under a hull footprint: y from the four-corner average,
 * pitch/roll from the corner differences. Writes into `out`. */
export function groundPose(
  spec: TerrainSpec,
  x: number,
  z: number,
  yaw: number,
  out: { y: number; pitch: number; roll: number },
): void {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  // right = forward × up
  const rx = -fz
  const rz = fx
  const hF = heightAt(spec, x + fx * TANK_HALF_L, z + fz * TANK_HALF_L)
  const hB = heightAt(spec, x - fx * TANK_HALF_L, z - fz * TANK_HALF_L)
  const hR = heightAt(spec, x + rx * TANK_HALF_W, z + rz * TANK_HALF_W)
  const hL = heightAt(spec, x - rx * TANK_HALF_W, z - rz * TANK_HALF_W)
  out.y = (hF + hB + hR + hL) / 4
  out.pitch = Math.atan2(hF - hB, 2 * TANK_HALF_L)
  out.roll = Math.atan2(hR - hL, 2 * TANK_HALF_W)
}

/** Scratch pose reused by every step (allocation-free loop). */
const stepPose = { y: 0, pitch: 0, roll: 0 }
/** Grade probe distance ahead of the tracks. */
const GRADE_PROBE = 3

/**
 * One driving frame. Returns the impact speed absorbed by a rock or the
 * world bounds this step (0 when driving clean) — the haptic/thud trigger.
 */
export function stepTank(
  t: TankState,
  input: ControlInput,
  dt: number,
  spec: TerrainSpec,
  tuning: Tuning = NEUTRAL_TUNING,
): number {
  const step = Math.min(dt, MAX_DT)
  const throttle = applyExpo(input.left.y, tuning.expo)
  const turn = applyExpo(input.left.x, tuning.expo)

  // Track steering: stick right turns the hull right (the drone convention).
  t.hullYaw -= turn * HULL_TURN_RATE * step
  const fx = -Math.sin(t.hullYaw)
  const fz = -Math.cos(t.hullYaw)

  // Grade limit along the direction of intended motion: uphill scrubs speed
  // off linearly and stalls entirely at MAX_GRADE. Downhill is free.
  let slopeScale = 1
  if (throttle !== 0) {
    const dir = throttle > 0 ? 1 : -1
    const hHere = heightAt(spec, t.pos.x, t.pos.z)
    const hAhead = heightAt(
      spec,
      t.pos.x + fx * GRADE_PROBE * dir,
      t.pos.z + fz * GRADE_PROBE * dir,
    )
    const grade = (hAhead - hHere) / GRADE_PROBE
    if (grade > 0) slopeScale = Math.max(0, 1 - grade / MAX_GRADE)
  }

  const maxFwd = TANK_MAX_SPEED * tuning.speed
  const target =
    throttle * maxFwd * (throttle < 0 ? REVERSE_FACTOR : 1) * slopeScale
  t.speed = damp(t.speed, target, TANK_ACCEL, step)

  const prevX = t.pos.x
  const prevZ = t.pos.z
  t.pos.x += fx * t.speed * step
  t.pos.z += fz * t.speed * step

  let impact = 0

  // World bounds: stop dead at the edge (an invisible wall, but a gentle one
  // at tank speeds).
  const bound = TANK_WORLD_HALF - 1
  if (t.pos.x > bound || t.pos.x < -bound || t.pos.z > bound || t.pos.z < -bound) {
    t.pos.x = Math.min(bound, Math.max(-bound, t.pos.x))
    t.pos.z = Math.min(bound, Math.max(-bound, t.pos.z))
    impact = Math.max(impact, Math.abs(t.speed))
    t.speed = 0
  }

  // Rocks: circle push-out; driving into one thuds and stops the tracks.
  for (const r of spec.rocks) {
    const dx = t.pos.x - r.x
    const dz = t.pos.z - r.z
    const minD = r.r + TANK_RADIUS
    const d = Math.hypot(dx, dz)
    if (d >= minD || d === 0) continue
    const push = (minD - d) / d
    t.pos.x += dx * push
    t.pos.z += dz * push
    impact = Math.max(impact, Math.abs(t.speed))
    t.speed *= 0.1
  }

  // Four-point grounding: y snaps to the track average, attitude damps
  // toward the terrain so crossing a ridge never pops.
  groundPose(spec, t.pos.x, t.pos.z, t.hullYaw, stepPose)
  t.pos.y = stepPose.y
  t.pitch = damp(t.pitch, stepPose.pitch, POSE_RESPONSE, step)
  t.roll = damp(t.roll, stepPose.roll, POSE_RESPONSE, step)

  if (step > 0) {
    t.vel.x = (t.pos.x - prevX) / step
    t.vel.z = (t.pos.z - prevZ) / step
    t.vel.y = 0
  }

  return impact
}

/**
 * One camera-orbit frame: the right stick is a rate control on the aim
 * yaw/pitch. `sens` folds in the traverse tuning and the ADS slowdown.
 */
export function stepCamAim(
  aim: CamAim,
  input: ControlInput,
  dt: number,
  sens: number,
  expo: number,
): void {
  const step = Math.min(dt, MAX_DT)
  const rx = applyExpo(input.right.x, expo)
  const ry = applyExpo(input.right.y, expo)
  aim.yaw -= rx * CAM_YAW_RATE * sens * step
  aim.pitch = Math.min(
    CAM_PITCH_MAX,
    Math.max(CAM_PITCH_MIN, aim.pitch + ry * CAM_PITCH_RATE * sens * step),
  )
}

/**
 * One turret frame: the traverse chases the camera yaw at a constant rate
 * (rate-limited, not damped — constant slew reads as machinery). Returns
 * the remaining yaw error so the HUD can show gun-vs-view divergence.
 */
export function stepTurret(
  t: TankState,
  camYaw: number,
  dt: number,
  traverseMult: number,
): number {
  const step = Math.min(dt, MAX_DT)
  const target = wrapAngle(camYaw - t.hullYaw)
  const delta = wrapAngle(target - t.turretRel)
  const maxStep = TURRET_TRAVERSE * traverseMult * step
  t.turretRel = wrapAngle(
    t.turretRel + Math.min(maxStep, Math.max(-maxStep, delta)),
  )
  return wrapAngle(target - t.turretRel)
}

/** The turret's world yaw (hull + traverse). */
export const turretWorldYaw = (t: TankState): number =>
  wrapAngle(t.hullYaw + t.turretRel)

/** Muzzle world position for a tank at `pos` firing along `yaw`/`pitch`.
 * Writes into `out`. */
export function muzzlePos(
  pos: Vec3,
  yaw: number,
  pitch: number,
  out: Vec3,
): void {
  const cosP = Math.cos(pitch)
  out.x = pos.x + -Math.sin(yaw) * cosP * MUZZLE_AHEAD
  out.y = pos.y + TURRET_HEIGHT + Math.sin(pitch) * MUZZLE_AHEAD
  out.z = pos.z + -Math.cos(yaw) * cosP * MUZZLE_AHEAD
}

/** Camera pivot height above the tank's ground contact. */
export const CAM_PIVOT_Y = 2.3
/** Chase boom length (shortens against terrain in the camera rig). */
export const CAM_BOOM = 9

/** Unit forward vector for an aim yaw/pitch (writes into `out`). Shared by
 * the camera rig and the fire path so the reticle is exact. */
export function camForward(yaw: number, pitch: number, out: Vec3): void {
  const cosP = Math.cos(pitch)
  out.x = -Math.sin(yaw) * cosP
  out.y = Math.sin(pitch)
  out.z = -Math.cos(yaw) * cosP
}

/**
 * Low ballistic arc that lands a shell (muzzle speed `v`, gravity `g`) on a
 * target `dxz` ahead and `dy` above the muzzle, or null when out of reach.
 * θ = atan((v² − √(v⁴ − g(g·d² + 2·h·v²))) / (g·d)) — the classic solution.
 */
export function solveShellPitch(
  v: number,
  g: number,
  dxz: number,
  dy: number,
): number | null {
  if (dxz < 0.5) return null
  const v2 = v * v
  const disc = v2 * v2 - g * (g * dxz * dxz + 2 * dy * v2)
  if (disc < 0) return null
  return Math.atan((v2 - Math.sqrt(disc)) / (g * dxz))
}

/**
 * The complete firing solution from a tank toward a world aim point: yaw
 * from the muzzle to the point, ballistic pitch from the solver, clamped to
 * the gun's arc. Returns false (and leaves `dirOut` untouched) when no
 * in-arc solution exists — the greyed-reticle state. On success writes the
 * unit fire direction into `dirOut` and the muzzle into `muzzleOut`.
 */
export function fireSolution(
  t: TankState,
  aimPoint: Vec3,
  shellSpeed: number,
  shellGravity: number,
  dirOut: Vec3,
  muzzleOut: Vec3,
): boolean {
  const baseYaw = Math.atan2(-(aimPoint.x - t.pos.x), -(aimPoint.z - t.pos.z))
  muzzlePos(t.pos, baseYaw, 0, muzzleOut)
  const dxz = Math.hypot(aimPoint.x - muzzleOut.x, aimPoint.z - muzzleOut.z)
  const dy = aimPoint.y - muzzleOut.y
  const pitch = solveShellPitch(shellSpeed, shellGravity, dxz, dy)
  if (pitch === null || pitch < BARREL_PITCH_MIN || pitch > BARREL_PITCH_MAX) {
    return false
  }
  const cosP = Math.cos(pitch)
  dirOut.x = -Math.sin(baseYaw) * cosP
  dirOut.y = Math.sin(pitch)
  dirOut.z = -Math.cos(baseYaw) * cosP
  muzzlePos(t.pos, baseYaw, pitch, muzzleOut)
  return true
}
