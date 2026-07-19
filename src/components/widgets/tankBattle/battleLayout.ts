/**
 * Seeded battle generation for Tank Battle. Two modes share one enemy pool:
 *
 *  - 'waves': the Drone Strike loop — wave N spawns a seeded pack of enemy
 *    tanks in the middle band of the map; clear it, the next is bigger and
 *    meaner. Wave 1 is a passive practice pack (they patrol, never fire).
 *  - 'roam': a patrol hunt — one seeded garrison spread across the WHOLE
 *    map; hunt all of them down, against the clock (best time persists).
 *
 * Placement is rejection-sampled on the same terrain the game plays on:
 * anchors keep off steep slopes, spread apart, and carry their whole patrol
 * envelope (lesson #44) so a patrolling enemy never grinds into a rock.
 */
import type { Vec3 } from '../droneSim/flightModel'
import type { TerrainSpec } from './terrain'
import { TANK_SPAWN, TANK_WORLD_HALF, gradientAt, heightAt } from './terrain'

export type BattleMode = 'waves' | 'roam'

export const coerceBattleMode = (v: unknown): BattleMode | undefined =>
  v === 'waves' || v === 'roam' ? v : undefined

/** Enemies return fire from this wave (wave 1 is target practice). */
export const ENEMY_FIRE_WAVE = 2
/** Simultaneous enemy cap (perf: individually posed tank models). */
export const MAX_TANK_TARGETS = 10
/** The roam garrison size. */
export const ROAM_ENEMIES = 8

export const POINTS_LIGHT = 25
export const POINTS_HEAVY = 40

export interface TankTargetSpec {
  x: number
  z: number
  hullYaw: number
  /** Patrol circle radius around the anchor (0 = holds position). */
  patrolR: number
  heavy: boolean
  hp: number
  points: number
  fires: boolean
  /** Aim scatter radius (u) at the player — skill floor per wave. */
  aimErr: number
  /** Seeded phase: patrol start angle / fire stagger. */
  phase: number
}

export interface BattleSpec {
  mode: BattleMode
  /** 1-based wave index ('roam' always 1). */
  index: number
  targets: TankTargetSpec[]
  enemiesShoot: boolean
}

/** Same PRNG as the terrain builder (copied — module independence). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const scratchGrad = { x: 0, z: 0 }

function placeAnchors(
  rand: () => number,
  terrain: TerrainSpec,
  count: number,
  minDist: number,
  maxDist: number,
  gap: number,
): { x: number; z: number }[] {
  const anchors: { x: number; z: number }[] = []
  for (let i = 0; i < count; i++) {
    let placed = false
    for (let attempt = 0; attempt < 140 && !placed; attempt++) {
      const ang = rand() * Math.PI * 2
      const dist = minDist + rand() * (maxDist - minDist)
      const x = TANK_SPAWN.x + Math.sin(ang) * dist
      const z = TANK_SPAWN.z - Math.abs(Math.cos(ang)) * dist // bias north, into the map
      if (Math.abs(x) > TANK_WORLD_HALF - 10 || Math.abs(z) > TANK_WORLD_HALF - 10) {
        continue
      }
      gradientAt(terrain, x, z, scratchGrad)
      if (Math.hypot(scratchGrad.x, scratchGrad.z) > 0.35) continue
      if (anchors.some((a) => Math.hypot(x - a.x, z - a.z) < gap)) continue
      // Keep the whole patrol envelope clear of rocks (lesson #44).
      if (terrain.rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + 14)) continue
      anchors.push({ x, z })
      placed = true
    }
    if (!placed) {
      // Sampling exhausted: fall back to a clear ring position mid-map.
      const ang = (i / count) * Math.PI * 2
      anchors.push({
        x: Math.sin(ang) * 40,
        z: -10 + Math.cos(ang) * 30,
      })
    }
  }
  return anchors
}

/** Build wave `waveIndex` (1-based). Own PRNG stream per wave (seed ⊕ wave
 * hash), independent of the terrain stream. */
export function buildTankWave(
  seed: number,
  waveIndex: number,
  terrain: TerrainSpec,
): BattleSpec {
  const rand = mulberry32((seed ^ Math.imul(waveIndex, 0x9e3779b1)) >>> 0)
  const count = Math.min(waveIndex + 1, 6)
  const heavies = waveIndex >= 4 ? Math.min(1 + Math.floor((waveIndex - 4) / 2), 2) : 0
  const fires = waveIndex >= ENEMY_FIRE_WAVE
  const aimErr = Math.max(1.4, 4 - waveIndex * 0.35)
  const maxDist = Math.min(75, 55 + waveIndex * 4)

  const anchors = placeAnchors(rand, terrain, count, 32, maxDist, 20)
  const targets: TankTargetSpec[] = anchors.map((a, i) => {
    const heavy = i < heavies
    return {
      x: a.x,
      z: a.z,
      hullYaw: rand() * Math.PI * 2,
      patrolR: 5 + rand() * 6,
      heavy,
      hp: heavy ? 4 : 2,
      points: heavy ? POINTS_HEAVY : POINTS_LIGHT,
      fires,
      aimErr: heavy ? aimErr * 0.8 : aimErr,
      phase: rand() * Math.PI * 2,
    }
  })

  return { mode: 'waves', index: waveIndex, targets, enemiesShoot: fires }
}

/** Build the roam garrison: ROAM_ENEMIES tanks spread across the whole map,
 * all armed. Own stream (seed ⊕ constant). */
export function buildRoam(seed: number, terrain: TerrainSpec): BattleSpec {
  const rand = mulberry32((seed ^ 0x51ed270b) >>> 0)
  const anchors = placeAnchors(rand, terrain, ROAM_ENEMIES, 35, 105, 24)
  const targets: TankTargetSpec[] = anchors.map((a, i) => {
    const heavy = i % 4 === 3
    return {
      x: a.x,
      z: a.z,
      hullYaw: rand() * Math.PI * 2,
      patrolR: 6 + rand() * 8,
      heavy,
      hp: heavy ? 4 : 2,
      points: heavy ? POINTS_HEAVY : POINTS_LIGHT,
      fires: true,
      aimErr: 2.8,
      phase: rand() * Math.PI * 2,
    }
  })
  return { mode: 'roam', index: 1, targets, enemiesShoot: true }
}

/* --------------------------- runtime enemy pool -------------------------- */

export interface TankTargetState {
  alive: boolean
  /** Ground position (y = terrain height under the tracks). */
  pos: Vec3
  /** Live velocity — feeds shot leading. */
  vel: Vec3
  hullYaw: number
  /** World turret yaw (the AI slews it toward the player). */
  turretYaw: number
  barrelPitch: number
  /** Damped terrain attitude for rendering. */
  pitch: number
  roll: number
  speed: number
  radius: number
  hp: number
  points: number
  heavy: boolean
  fires: boolean
  aimErr: number
  anchor: { x: number; z: number }
  patrolR: number
  phase: number
  hitFlash: number
}

export function createTankTargets(): TankTargetState[] {
  return Array.from({ length: MAX_TANK_TARGETS }, () => ({
    alive: false,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    hullYaw: 0,
    turretYaw: 0,
    barrelPitch: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    radius: 1.6,
    hp: 2,
    points: POINTS_LIGHT,
    heavy: false,
    fires: false,
    aimErr: 3,
    anchor: { x: 0, z: 0 },
    patrolR: 0,
    phase: 0,
    hitFlash: 0,
  }))
}

/** Load a battle spec into the pool (slots beyond it go dormant). */
export function loadBattle(
  states: TankTargetState[],
  battle: BattleSpec,
  terrain: TerrainSpec,
): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i]
    const spec = battle.targets[i]
    if (!spec) {
      s.alive = false
      continue
    }
    s.alive = true
    s.pos.x = spec.x
    s.pos.z = spec.z
    s.pos.y = heightAt(terrain, spec.x, spec.z)
    s.vel.x = 0
    s.vel.y = 0
    s.vel.z = 0
    s.hullYaw = spec.hullYaw
    s.turretYaw = spec.hullYaw
    s.barrelPitch = 0
    s.pitch = 0
    s.roll = 0
    s.speed = 0
    s.radius = spec.heavy ? 1.9 : 1.6
    s.hp = spec.hp
    s.points = spec.points
    s.heavy = spec.heavy
    s.fires = spec.fires
    s.aimErr = spec.aimErr
    s.anchor.x = spec.x
    s.anchor.z = spec.z
    s.patrolR = spec.patrolR
    s.phase = spec.phase
    s.hitFlash = 0
  }
}

export function aliveTankCount(states: readonly TankTargetState[]): number {
  let n = 0
  for (const s of states) if (s.alive) n++
  return n
}
