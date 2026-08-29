/**
 * Archery's pure core: world geometry, the flight resolver, and the shot
 * quantization that makes two-device play deterministic.
 *
 * Extracted from `ArcheryWidget` when it gained a 2 Devices mode. The widget
 * used to decide hits by sampling the closed-form flight at rAF frame times,
 * with the obstacle and platform phases read off a device-local animation
 * clock — two devices replaying the same shot would not reliably agree. Here
 * the same closed-form flight is sampled at a FIXED step with every input
 * passed in explicitly, so the same packed shot resolves identically
 * everywhere: on the shooter, on the other device, and in the test bundle.
 *
 * No rAF, no Date, no Math.random.
 */

export type ArcherySeat = 'toy' | 'ninja'

// World = SVG viewBox units. Width depends on the Range setting; height fixed.
export const H = 260
export const GROUND = 238
export const MARGIN = 50 // archer inset from each side
export const FIG_H = 58
export const G = 520 // gravity (units/s²)
export const VMAX = 620
export const K = 6.8 // drag(world) → speed
export const WIN = 5
export const MIN_Y = 84
export const MAX_Y = 206
export const GAP = 32
export const WIND_MIN = 70
export const WIND_MAX = 170
// Obstacle (bobbing block)
export const OBS_MID = 118
export const OBS_AMP = 58
export const OBS_PERIOD = 2200
export const OBS_HW = 13
export const OBS_HH = 26
// Moving platforms (archers ride up/down)
export const AMP_P = 34
export const PERIOD_P = 2400

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const worldW = (d: 'short' | 'long') => (d === 'long' ? 560 : 400)
export const otherSeat = (p: ArcherySeat): ArcherySeat => (p === 'toy' ? 'ninja' : 'toy')
export const facing = (p: ArcherySeat) => (p === 'toy' ? 1 : -1)
export const archerX = (p: ArcherySeat, w: number) => (p === 'toy' ? MARGIN : w - MARGIN)
export const phaseOf = (p: ArcherySeat) => (p === 'toy' ? 0 : Math.PI)

export const launchOriginAt = (p: ArcherySeat, w: number, y: number) => ({
  x: archerX(p, w) + facing(p) * 6,
  y: y - 34,
})
export const hitboxAt = (p: ArcherySeat, w: number, y: number) => {
  const x = archerX(p, w)
  return { x0: x - 16, x1: x + 16, y0: y - FIG_H, y1: y }
}

/** A platform's centre is the dealt height clamped so the bob stays in range. */
export const platCenter = (feetY: number) => clamp(feetY, MIN_Y + AMP_P, MAX_Y - AMP_P)
/** Feet height of a bobbing archer, `phase` in radians. */
export const platYAt = (feetY: number, phase: number) =>
  platCenter(feetY) + AMP_P * Math.sin(phase)
/** Obstacle block centre for a given phase (radians). */
export const blockCyAt = (phase: number) => OBS_MID + OBS_AMP * Math.sin(phase)

/** Same seeded PRNG the other game models use, kept module-private. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The wind for shot number `shot` (0-based), derived from a shared seed so
 * both devices know every turn's wind without messaging it. Zero when the
 * wind mode is off — the caller gates that.
 */
export function windAt(seed: number, shot: number): number {
  const rand = mulberry32((seed ^ (shot * 0x9e3779b9)) >>> 0)
  const mag = Math.round(WIND_MIN + rand() * (WIND_MAX - WIND_MIN))
  return rand() < 0.5 ? -mag : mag
}

/** Seeded archer heights — a restart can re-deal identically on both devices. */
export function dealHeightsFrom(seed: number): { p1y: number; p2y: number } {
  const rand = mulberry32(seed)
  const randY = () => MIN_Y + rand() * (MAX_Y - MIN_Y)
  const a = randY()
  let b = randY()
  for (let i = 0; i < 24 && Math.abs(a - b) < GAP; i++) b = randY()
  return { p1y: Math.round(a), p2y: Math.round(b) }
}

// ---------------------------------------------------------------- the shot

/** Everything a flight's outcome depends on, all explicit. Phases are the
 * animation phase (radians) AT FIRE; the resolver advances them with t. */
export interface ShotParams {
  w: number
  shooter: ArcherySeat
  /** Launch vector, world units/s. */
  vx: number
  vy: number
  /** The shooter's feet Y at release (their platform height if riding one). */
  shooterY: number
  /** The opponent's dealt height. */
  oppFeetY: number
  /** Opponent rides a platform: their phase at fire, or null if still. */
  oppPhase: number | null
  wind: number
  /** Obstacle mode: the block's phase at fire, or null if off. */
  obstaclePhase: number | null
}

export interface ShotOutcome {
  hit: boolean
  blocked: boolean
  /** Flight time until it ended (hit, block, ground or out), seconds. */
  tEnd: number
}

/** Closed-form flight position at time t. */
export const flightAt = (
  origin: { x: number; y: number },
  vx: number,
  vy: number,
  wind: number,
  t: number,
) => ({
  x: origin.x + vx * t + 0.5 * wind * t * t,
  y: origin.y + vy * t + 0.5 * G * t * t,
})

/** Fixed sampling step. 120 Hz beats any real display so the deterministic
 * outcome is at least as fine-grained as the old frame-sampled one. */
const DT = 1 / 120
const T_MAX = 6

/**
 * Resolve a shot. The SAME function runs on the shooter, on the other device
 * and in the tests — sampling at a fixed step with explicit phases is what
 * makes that possible; rAF sampling made the outcome frame-rate-dependent.
 */
export function resolveShot(p: ShotParams): ShotOutcome {
  const opp = otherSeat(p.shooter)
  const origin = launchOriginAt(p.shooter, p.w, p.shooterY)
  for (let t = DT; t <= T_MAX; t += DT) {
    const { x, y } = flightAt(origin, p.vx, p.vy, p.wind, t)
    const oppY =
      p.oppPhase === null
        ? p.oppFeetY
        : platYAt(p.oppFeetY, p.oppPhase + (t * 1000 * Math.PI * 2) / PERIOD_P)
    const target = hitboxAt(opp, p.w, oppY)
    const blocked =
      p.obstaclePhase !== null &&
      x >= p.w / 2 - OBS_HW &&
      x <= p.w / 2 + OBS_HW &&
      y >= blockCyAt(p.obstaclePhase + (t * 1000 * Math.PI * 2) / OBS_PERIOD) - OBS_HH &&
      y <= blockCyAt(p.obstaclePhase + (t * 1000 * Math.PI * 2) / OBS_PERIOD) + OBS_HH
    if (blocked) return { hit: false, blocked: true, tEnd: t }
    if (x >= target.x0 && x <= target.x1 && y >= target.y0 && y <= target.y1) {
      return { hit: true, blocked: false, tEnd: t }
    }
    if (y > GROUND || x < -12 || x > p.w + 12) return { hit: false, blocked: false, tEnd: t }
  }
  return { hit: false, blocked: false, tEnd: T_MAX }
}

// ------------------------------------------------------------ quantization

/**
 * Pack a shot into one safe integer, so a real-valued move can ride the wire
 * protocol's existing `move: number` with no protocol change.
 *
 * Layout (46 bits, well under 2^53):
 *   vx, vy      11 bits each — rounded to 1 unit/s, offset by VMAX
 *   shooterY     8 bits     — feet Y at release, rounded (world is 260 tall)
 *   oppPhase     8 bits     — opponent platform phase at fire (255 = still)
 *   obsPhase     8 bits     — obstacle phase at fire (255 = no obstacle)
 *
 * Quantizing is not just compression: both devices UNPACK the identical
 * integers, so identical floats enter the identical resolver. The shooter's
 * own aim is quantized the same way before resolving, so what you saw fly is
 * exactly what the other device concludes.
 */
const V_OFF = 1024 // covers ±VMAX with margin
const PH_STEPS = 254 // 0..254 real phases; 255 = "none"
const PH_NONE = 255

const packPhase = (phase: number | null): number => {
  if (phase === null) return PH_NONE
  const norm = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return Math.min(PH_STEPS - 1, Math.round((norm / (Math.PI * 2)) * PH_STEPS))
}
const unpackPhase = (q: number): number | null =>
  q === PH_NONE ? null : (q / PH_STEPS) * Math.PI * 2

export interface PackedShotParts {
  vx: number
  vy: number
  shooterY: number
  oppPhase: number | null
  obstaclePhase: number | null
}

export function packShot(p: PackedShotParts): number {
  const vxQ = clamp(Math.round(p.vx) + V_OFF, 0, 2047)
  const vyQ = clamp(Math.round(p.vy) + V_OFF, 0, 2047)
  const syQ = clamp(Math.round(p.shooterY), 0, 255)
  const opQ = packPhase(p.oppPhase)
  const obQ = packPhase(p.obstaclePhase)
  return (((vxQ * 2048 + vyQ) * 256 + syQ) * 256 + opQ) * 256 + obQ
}

export function unpackShot(packed: number): PackedShotParts | null {
  if (!Number.isSafeInteger(packed) || packed < 0) return null
  let rest = packed
  const obQ = rest % 256
  rest = (rest - obQ) / 256
  const opQ = rest % 256
  rest = (rest - opQ) / 256
  const syQ = rest % 256
  rest = (rest - syQ) / 256
  const vyQ = rest % 2048
  rest = (rest - vyQ) / 2048
  const vxQ = rest
  if (vxQ > 2047) return null
  return {
    vx: vxQ - V_OFF,
    vy: vyQ - V_OFF,
    shooterY: syQ,
    oppPhase: unpackPhase(opQ),
    obstaclePhase: unpackPhase(obQ),
  }
}
