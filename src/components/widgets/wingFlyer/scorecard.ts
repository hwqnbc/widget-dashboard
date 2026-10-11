/**
 * The landing scorecard — pure, React-free (Round 1b "Score it",
 * docs/wing-flyer.md §7 / §13). ONE card for every Landing mission and the
 * touch-and-go chain, so the player learns to read a single number:
 *
 *   score = (spot + centreline) × smoothness          0 … 100
 *
 * - **spot** (0–50): how close along the runway the wheels touched to the
 *   touchdown zone — the runway's CENTRE, 100 m in from either threshold.
 *   (The hoop line's foot is 50 m earlier; a flared Trainer floats ~80 m
 *   from there, which is how a real landing works: aim point, then
 *   flare, then touch.) Full marks inside SPOT_FULL, fading to 0 at
 *   SPOT_ZERO.
 * - **centreline** (0–50): sideways distance from the runway centreline;
 *   full marks inside CENTRE_FULL, 0 at the runway edge.
 * - **smoothness** (×0.3 … ×1): the touchdown sink rate — ×1 at or under
 *   SMOOTH_SINK, sliding to ×0.3 at the landing limit (LAND_SINK) — and
 *   every bounce on the way in costs another ×BOUNCE_FACTOR.
 *
 * Off the runway (grass) both position marks are 0, so the score is 0:
 * every mission needs the runway. Stars: ≥ 40 ★, ≥ 70 ★★, ≥ 90 ★★★.
 */
import { LAND_SINK } from './ground'
import { STRIP } from './islandLayout'

export const SPOT_FULL = 15
export const SPOT_ZERO = 70
export const CENTRE_FULL = 2
export const SMOOTH_SINK = 0.5
export const SMOOTH_FLOOR = 0.3
export const BOUNCE_FACTOR = 0.7
export const STAR_1 = 40
export const STAR_2 = 70
export const STAR_3 = 90

export interface LandingFacts {
  /** Touchdown point. */
  x: number
  z: number
  /** The runway end landed on (−1 = eastbound, over the west end). */
  end: -1 | 1
  /** Touchdown sink rate, m/s (≥ 0). */
  sink: number
  onRunway: boolean
  /** Bounces before this touchdown. */
  bounces: number
}

export interface LandingScore {
  spot: number
  centre: number
  /** The smoothness multiplier, 0.3 … 1. */
  smooth: number
  /** Metres from the aim point along the runway (+ = long). */
  alongM: number
  /** Metres off the centreline (unsigned). */
  acrossM: number
  /** The touchdown sink rate, m/s (echoed for the panel). */
  sink: number
  score: number
  stars: 0 | 1 | 2 | 3
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The touchdown zone centre: the runway centre, whichever end. */
export const TOUCHDOWN_X = STRIP.x

export function starsFor(score: number): 0 | 1 | 2 | 3 {
  if (score >= STAR_3) return 3
  if (score >= STAR_2) return 2
  if (score >= STAR_1) return 1
  return 0
}

export function scoreLanding(f: LandingFacts): LandingScore {
  // Along the landing direction: end −1 lands eastbound (x increasing).
  const alongM = (f.x - TOUCHDOWN_X) * -f.end
  const acrossM = Math.abs(f.z - STRIP.z)
  let spot = 0
  let centre = 0
  if (f.onRunway) {
    const a = Math.abs(alongM)
    spot = 50 * (1 - clamp01((a - SPOT_FULL) / (SPOT_ZERO - SPOT_FULL)))
    centre = 50 * (1 - clamp01((acrossM - CENTRE_FULL) / (STRIP.width / 2 - CENTRE_FULL)))
  }
  let smooth = 1 - (1 - SMOOTH_FLOOR) * clamp01((f.sink - SMOOTH_SINK) / (LAND_SINK - SMOOTH_SINK))
  smooth *= Math.pow(BOUNCE_FACTOR, Math.max(0, Math.floor(f.bounces)))
  const score = Math.round((spot + centre) * smooth)
  return { spot: Math.round(spot), centre: Math.round(centre), smooth, alongM, acrossM, sink: f.sink, score, stars: starsFor(score) }
}
