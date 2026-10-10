/**
 * Wing Flyer physics suite (node only — no browser): flies the bundled pure
 * `planeModel` with a tiny test autopilot and measures the figures the
 * design note promises (docs/wing-flyer.md §3, §5) for BOTH airframes:
 * stall speed, top speed, hands-off trim speed, best glide ratio and the
 * steady-turn radius r = v²/(g·tanφ). Also checks the attitude helpers
 * round-trip, the fixed-step accumulator caps sub-steps, stalls drop the
 * nose, sideslip weathervanes away and the model is deterministic.
 */
import { reporter } from './helpers.mjs'
import {
  GRAVITY,
  MAX_SUBSTEPS,
  STEP_DT,
  advanceFixed,
  attitudeOf,
  bestGlideRatio,
  bestGlideSpeed,
  createPlaneState,
  quatFromEuler,
  resetPlane,
  stallSpeed,
  stepPlane,
} from './.bundle/planeModel.js'
import { AIRFRAMES } from './.bundle/airframes.js'

const { check, finish } = reporter('wing-physics')
const DEG = Math.PI / 180
const att = { heading: 0, pitch: 0, bank: 0 }
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b)

// --- attitude helpers -----------------------------------------------------
{
  const q = { x: 0, y: 0, z: 0, w: 1 }
  let worst = 0
  for (const [h, p, b] of [
    [0, 0, 0],
    [30, 10, 20],
    [-120, -25, -45],
    [170, 40, 60],
  ]) {
    quatFromEuler(h * DEG, p * DEG, b * DEG, q)
    attitudeOf(q, att)
    worst = Math.max(
      worst,
      Math.abs(att.heading / DEG - h),
      Math.abs(att.pitch / DEG - p),
      Math.abs(att.bank / DEG - b),
    )
  }
  check('attitude helpers round-trip heading/pitch/bank', worst < 1e-6, `worst ${worst.toExponential(1)}°`)
}

// --- fixed-step accumulator ----------------------------------------------
{
  let n = 0
  let acc = advanceFixed(0, 1 / 60, () => n++)
  check('60 fps frame runs 2 sub-steps', n === 2 && acc < 1e-9, `n=${n}`)
  n = 0
  acc = advanceFixed(0, 0.5, () => n++)
  check('a 0.5 s stutter is capped (slow-motion, no jump)', n === MAX_SUBSTEPS && acc < 1e-9, `n=${n}`)
}

// --- test autopilots ---------------------------------------------------------
// Just enough control to fly measurement profiles. Altitude hold: a PI on
// vertical speed → pitch-rate command. Airspeed hold (glide): a PI on pitch
// ATTITUDE whose target is nudged gently by the speed error and its trend —
// holding speed straight through the pitch rate excites the phugoid.
function pilot(spec) {
  let integ = 0
  let thetaInteg = 0
  let prevV = null
  let dvdt = 0
  const clBg = Math.sqrt(spec.cd0 / spec.k)
  const thetaBase = (clBg - spec.cl0) / spec.clAlpha - Math.atan(1 / bestGlideRatio(spec))
  return (s, { bank = 0, alt = null, speed = null, throttle = 0 }) => {
    attitudeOf(s.q, att)
    const roll = (bank - att.bank) * 4
    let pitch
    if (alt !== null) {
      const vsTarget = Math.max(-3, Math.min(3, 0.5 * (alt - s.pos.y)))
      const err = (vsTarget - s.vel.y) * 0.08
      integ = Math.max(-1, Math.min(1, integ + err * STEP_DT * 2))
      pitch = (err * 4 + integ * 3) / Math.cos(Math.min(1.2, Math.abs(att.bank)))
    } else {
      const v = s.airspeed
      if (prevV !== null) dvdt += ((v - prevV) / STEP_DT - dvdt) * 0.05
      prevV = v
      const thetaCmd = thetaBase + 0.02 * (v - speed) + 0.1 * dvdt
      const e = thetaCmd - att.pitch
      thetaInteg = Math.max(-0.5, Math.min(0.5, thetaInteg + e * STEP_DT))
      pitch = 3 * e + 2 * thetaInteg
    }
    return { roll, pitch: Math.max(-spec.maxPitch, Math.min(spec.maxPitch, pitch)), yaw: 0, throttle }
  }
}

function fly(s, spec, seconds, fly1, every) {
  const steps = Math.round(seconds / STEP_DT)
  for (let i = 0; i < steps; i++) {
    stepPlane(s, spec, fly1(s), STEP_DT)
    every?.(s, i)
  }
}

for (const id of ['trainer', 'wing']) {
  const spec = AIRFRAMES[id]
  const target = id === 'trainer' ? { stall: 7, top: 20, glide: 8 } : { stall: 9, top: 30, glide: 12 }

  // Analytic figures match the design targets.
  check(`${id}: analytic stall speed ≈ ${target.stall} m/s`, near(stallSpeed(spec), target.stall, 0.06), stallSpeed(spec).toFixed(2))
  check(`${id}: analytic best glide ≈ ${target.glide}`, near(bestGlideRatio(spec), target.glide, 0.06), bestGlideRatio(spec).toFixed(2))

  // Top speed: full throttle, hold altitude, 40 s.
  {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 200, z: 0 }, 0, target.stall * 1.6, 0, 1)
    const ap = pilot(spec)
    fly(s, spec, 40, (st) => ap(st, { alt: 200, throttle: 1 }))
    check(`${id}: level top speed ≈ ${target.top} m/s`, near(s.airspeed, target.top, 0.1), `${s.airspeed.toFixed(2)} m/s, alt ${s.pos.y.toFixed(1)}`)
  }

  // Stall: hold altitude while the throttle is cut; the speed bleeds off
  // until the wing passes its critical angle.
  {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 200, z: 0 }, 0, target.stall * 1.6, 0, 0)
    const ap = pilot(spec)
    let stallAt = null
    fly(s, spec, 30, (st) => ap(st, { alt: 200, throttle: 0 }), (st) => {
      if (stallAt === null && st.stalled) stallAt = st.airspeed
    })
    const vs = stallSpeed(spec)
    check(`${id}: stalls near v_s when slowed in level flight`, stallAt !== null && near(stallAt, vs, 0.1), `stalled at ${stallAt?.toFixed(2)} (v_s ${vs.toFixed(2)})`)
  }

  // Stall drops the nose: from a stalled attitude, hands off, AoA recovers.
  {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 200, z: 0 }, 0, target.stall * 0.8, 25 * DEG, 0)
    // Velocity level, nose 25° up → α ≈ 25°: stalled.
    s.vel.y = 0
    const v = Math.hypot(s.vel.x, s.vel.z)
    s.vel.z = -v
    s.vel.x = 0
    let wasStalled = false
    fly(s, spec, 0.05, () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0 }), (st) => {
      wasStalled ||= st.stalled
    })
    fly(s, spec, 4, () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0 }))
    check(`${id}: stall drops the nose and recovers hands-off`, wasStalled && !s.stalled && Math.abs(s.aoa) < spec.alphaCrit, `aoa ${(s.aoa / DEG).toFixed(1)}°`)
  }

  // Best glide: engine off, hold best-glide airspeed, measure distance/height.
  {
    const s = createPlaneState()
    const vbg = bestGlideSpeed(spec)
    resetPlane(s, { x: 0, y: 400, z: 0 }, 0, vbg, -5 * DEG, 0)
    const ap = pilot(spec)
    fly(s, spec, 10, (st) => ap(st, { speed: vbg }))
    const x0 = Math.hypot(s.pos.x, s.pos.z)
    const y0 = s.pos.y
    fly(s, spec, 30, (st) => ap(st, { speed: vbg }))
    const ratio = (Math.hypot(s.pos.x, s.pos.z) - x0) / (y0 - s.pos.y)
    check(`${id}: measured glide ratio ≈ ${target.glide}`, near(ratio, target.glide, 0.12), `${ratio.toFixed(2)} at ${s.airspeed.toFixed(1)} m/s`)
  }

  // Hands-off trim: neutral stick, cruise-ish throttle → settles near a
  // steady airspeed without diverging (speed stability).
  {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 300, z: 0 }, 0, target.stall * 1.5, 0, 0.35)
    const speeds = []
    fly(s, spec, 60, () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0.35 }), (st, i) => {
      if (i % 120 === 0) speeds.push(st.airspeed)
    })
    const last = speeds.slice(-10)
    const spread = Math.max(...last) - Math.min(...last)
    check(`${id}: hands-off flight is speed-stable (no divergence)`, spread < 1.5 && !s.stalled && s.airspeed > stallSpeed(spec), `last 10 s ${Math.min(...last).toFixed(1)}–${Math.max(...last).toFixed(1)} m/s`)
  }

  // Steady 30° and 45° banked turns: radius matches v²/(g·tanφ).
  for (const bankDeg of [30, 45]) {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 200, z: 0 }, 0, target.stall * 1.8, 0, 0.6)
    const ap = pilot(spec)
    fly(s, spec, 10, (st) => ap(st, { bank: bankDeg * DEG, alt: 200, throttle: 0.6 }))
    // Measure heading rate of the velocity vector over 5 s.
    const h0 = Math.atan2(s.vel.x, -s.vel.z)
    let unwrapped = 0
    let prev = h0
    let vSum = 0
    let n = 0
    fly(s, spec, 5, (st) => ap(st, { bank: bankDeg * DEG, alt: 200, throttle: 0.6 }), (st) => {
      const h = Math.atan2(st.vel.x, -st.vel.z)
      let d = h - prev
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      unwrapped += d
      prev = h
      vSum += Math.hypot(st.vel.x, st.vel.z)
      n++
    })
    const omega = unwrapped / 5
    const v = vSum / n
    const measured = v / Math.abs(omega)
    const theory = (v * v) / (GRAVITY * Math.tan(bankDeg * DEG))
    check(`${id}: ${bankDeg}° turn radius ≈ v²/(g·tanφ)`, omega > 0 && near(measured, theory, 0.12), `r ${measured.toFixed(1)} m vs ${theory.toFixed(1)} m at ${v.toFixed(1)} m/s`)
  }

  // Sideslip weathervanes away.
  {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 200, z: 0 }, 0, target.stall * 1.8, 0, 0.4)
    s.vel.x = 4 // shove sideways → β ≈ 0.25 rad
    const b0 = Math.abs(s.slip || 0.2)
    fly(s, spec, 2, () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0.4 }))
    check(`${id}: sideslip decays (weathervane)`, Math.abs(s.slip) < 0.2 * b0, `β ${(s.slip / DEG).toFixed(2)}°`)
  }
}

// --- determinism ---------------------------------------------------------
{
  const spec = AIRFRAMES.wing
  const run = () => {
    const s = createPlaneState()
    resetPlane(s, { x: 0, y: 100, z: 0 }, 0.3, 15, 0, 0.5)
    for (let i = 0; i < 2400; i++) {
      stepPlane(s, spec, { roll: Math.sin(i / 50), pitch: Math.cos(i / 70) * 0.5, yaw: 0, throttle: 0.6 }, STEP_DT, { wingDrop: true })
    }
    return [s.pos.x, s.pos.y, s.pos.z, s.q.w].join(',')
  }
  check('same inputs → identical state (deterministic)', run() === run())
}

await finish()
