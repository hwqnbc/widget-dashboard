/**
 * Wing Flyer assists suite (node only — no browser): drives the bundled
 * pure `assists` + `planeModel` with scripted stick positions, for BOTH
 * airframes, and checks each level's promise (docs/wing-flyer.md §4):
 * Trainer self-levels and holds altitude on release, keeps its 45° bank
 * limit, is stall-proof under a held full pull, and its auto-throttle holds
 * cruise; Normal banks to 60° at speed but STALL_PREVENTION shrinks the
 * limit toward 25° when slow, levels on release, and CAN stall on a hard
 * pull with the throttle cut; Acro rolls at rate and holds attitude
 * (inverted) on a centred stick; Panic recovers from inverted nose-down;
 * the hand-launch autopilot climbs to the hand-over height without
 * stalling, and a right-stick input hands control over early.
 */
import { reporter } from './helpers.mjs'
import {
  STEP_DT,
  attitudeOf,
  createPlaneState,
  quatFromEuler,
  resetPlane,
  stallSpeed,
  stepPlane,
} from './.bundle/planeModel.js'
import { AIRFRAMES } from './.bundle/airframes.js'
import {
  LAUNCH_HANDOVER_AGL,
  MIN_PROTECTED_BANK,
  NORMAL_BANK,
  PANIC_TIME,
  protectedBank,
  createAssist,
  startLaunch,
  stepAssist,
  triggerPanic,
} from './.bundle/assists.js'

const { check, finish } = reporter('wing-assists')
const DEG = Math.PI / 180
const att = { heading: 0, pitch: 0, bank: 0 }

const sticks = (rx = 0, ry = 0, lx = 0, ly = 0) => ({ left: { x: lx, y: ly }, right: { x: rx, y: ry } })

/** Fly `seconds` with a fixed or per-step stick function; `every` sees
 * (state, assist, cmd) after each step. Ground at y = 0 (agl = y). */
function fly(sim, seconds, stickFn, every) {
  const { s, spec, a, level, cmd, opts } = sim
  const n = Math.round(seconds / STEP_DT)
  for (let i = 0; i < n; i++) {
    const st = typeof stickFn === 'function' ? stickFn(s, i) : stickFn
    stepAssist(a, level, s, spec, st, { agl: s.pos.y, onGround: false, landable: false }, STEP_DT, cmd, opts)
    stepPlane(s, spec, cmd, STEP_DT, opts)
    every?.(s, a, cmd)
  }
}

function sim(id, level, { alt = 150, speedK = 1, heading = 0, pitch = 0, bank = 0, throttle = 0.4 } = {}) {
  const spec = AIRFRAMES[id]
  const s = createPlaneState()
  resetPlane(s, { x: 0, y: alt, z: 0 }, heading, spec.vAuthority * speedK, 0, throttle)
  if (pitch || bank) quatFromEuler(heading, pitch, bank, s.q)
  return { s, spec, a: createAssist(), level, cmd: { roll: 0, pitch: 0, yaw: 0, throttle: 0 }, opts: {} }
}

for (const id of ['trainer', 'wing']) {
  const spec = AIRFRAMES[id]
  const vs = stallSpeed(spec)
  // Normal/Acro throttle stick for roughly cruise power.
  const cruiseLy = 2 * 0.45 - 1

  // --- Trainer --------------------------------------------------------------
  {
    const t = sim(id, 'trainer', { bank: 70 * DEG, pitch: -30 * DEG })
    fly(t, 6, sticks())
    attitudeOf(t.s.q, att)
    check(`${id} trainer: release from 70° bank / 30° dive → wings level`, Math.abs(att.bank) < 3 * DEG && Math.abs(t.s.vel.y) < 1.5, `bank ${(att.bank / DEG).toFixed(1)}°, vs ${t.s.vel.y.toFixed(2)}`)
    const alt0 = t.s.pos.y
    fly(t, 10, sticks())
    check(`${id} trainer: hands-off holds altitude`, Math.abs(t.s.pos.y - alt0) < 3, `Δalt ${(t.s.pos.y - alt0).toFixed(2)} m`)
    check(`${id} trainer: auto-throttle holds cruise`, Math.abs(t.s.airspeed - spec.vAuthority) < 1.5, `${t.s.airspeed.toFixed(1)} m/s (cruise ${spec.vAuthority})`)
  }
  {
    const t = sim(id, 'trainer')
    let maxBank = 0
    fly(t, 6, sticks(1, 0), (s) => {
      attitudeOf(s.q, att)
      maxBank = Math.max(maxBank, Math.abs(att.bank))
    })
    check(`${id} trainer: full roll stick stays inside 45°`, maxBank < 47 * DEG && maxBank > 40 * DEG, `max ${(maxBank / DEG).toFixed(1)}°`)
  }
  {
    // Full back stick AND the speed stick at minimum, for 25 s.
    const t = sim(id, 'trainer')
    let stalls = 0
    let minV = Infinity
    fly(t, 25, sticks(0, 1, 0, -1), (s) => {
      if (s.stalled) stalls++
      minV = Math.min(minV, s.airspeed)
    })
    check(`${id} trainer: held full pull never stalls`, stalls === 0 && minV > vs, `min ${minV.toFixed(1)} m/s (v_s ${vs.toFixed(1)}), stalled steps ${stalls}`)
  }

  // --- Normal -----------------------------------------------------------------
  {
    const n = sim(id, 'normal', { speedK: 1.3, throttle: 0.8 })
    let maxBank = 0
    fly(n, 4, sticks(1, 0, 0, 1), (s) => {
      attitudeOf(s.q, att)
      maxBank = Math.max(maxBank, Math.abs(att.bank))
    })
    check(`${id} normal: full roll at speed banks to ~60°`, maxBank > 55 * DEG && maxBank < 62 * DEG, `max ${(maxBank / DEG).toFixed(1)}°`)
    fly(n, 4, sticks(0, 0, 0, cruiseLy))
    attitudeOf(n.s.q, att)
    check(`${id} normal: release levels the wings`, Math.abs(att.bank) < 3 * DEG, `bank ${(att.bank / DEG).toFixed(1)}°`)
  }
  {
    // Slow: the bank limit follows the CURRENT airspeed (STALL_PREVENTION),
    // floored at 25°. Throttle idle, full roll, 3 s: the bank never exceeds
    // the limit for the speed it is flying at.
    check(`${id} normal: protected bank is 25° near the stall, 60° fast`,
      Math.abs(protectedBank(spec, vs * 1.1, NORMAL_BANK) - MIN_PROTECTED_BANK) < 1e-9 &&
        Math.abs(protectedBank(spec, vs * 3, NORMAL_BANK) - NORMAL_BANK) < 1e-9,
      `${(protectedBank(spec, vs * 1.5, NORMAL_BANK) / DEG).toFixed(1)}° at 1.5 v_s`)
    const n = sim(id, 'normal', { speedK: 0, throttle: 0 })
    n.s.vel.z = -vs * 1.3
    let worst = -Infinity
    let maxBank = 0
    fly(n, 3, sticks(1, 0, 0, -1), (s) => {
      attitudeOf(s.q, att)
      maxBank = Math.max(maxBank, Math.abs(att.bank))
      worst = Math.max(worst, Math.abs(att.bank) - protectedBank(spec, s.airspeed, NORMAL_BANK))
    })
    check(`${id} normal: slow → bank stays inside the speed-based limit`, worst < 4 * DEG && maxBank < 55 * DEG, `max ${(maxBank / DEG).toFixed(1)}°, worst overshoot ${(worst / DEG).toFixed(1)}°`)
  }
  {
    const n = sim(id, 'normal', { throttle: 0 })
    let stalled = false
    fly(n, 20, sticks(0, 1, 0, -1), (s) => {
      stalled ||= s.stalled
    })
    check(`${id} normal: a hard pull with the throttle cut CAN stall`, stalled)
  }

  // --- Acro ---------------------------------------------------------------------
  {
    const c = sim(id, 'acro', { speedK: 1.2, throttle: 0.6 })
    let rolled = 0
    let prev = 0
    fly(c, 0.6, sticks(1, 0, 0, cruiseLy), (s) => {
      attitudeOf(s.q, att)
      let d = att.bank - prev
      if (d < -Math.PI) d += 2 * Math.PI
      rolled += d
      prev = att.bank
    })
    check(`${id} acro: full stick rolls at rate`, rolled > 0.6 * spec.maxRoll * 0.6, `${(rolled / DEG).toFixed(0)}° in 0.6 s`)
    // Roll to inverted, then centre the stick: attitude holds.
    const inv = sim(id, 'acro', { speedK: 1.4, bank: 180 * DEG, throttle: 1 })
    fly(inv, 0.8, sticks(0, 0, 0, 1))
    attitudeOf(inv.s.q, att)
    check(`${id} acro: centred stick holds inverted`, Math.abs(Math.abs(att.bank) - Math.PI) < 8 * DEG, `bank ${(att.bank / DEG).toFixed(1)}°`)
  }

  // --- Panic ----------------------------------------------------------------------
  for (const level of ['trainer', 'normal', 'acro']) {
    const p = sim(id, level, { alt: 120, bank: 175 * DEG, pitch: -30 * DEG, throttle: 0 })
    triggerPanic(p.a)
    let minAlt = Infinity
    // Judge just before Panic hands back (PANIC_TIME).
    fly(p, PANIC_TIME - 0.05, sticks(0, 0, 0, -1), (s) => {
      minAlt = Math.min(minAlt, s.pos.y)
    })
    attitudeOf(p.s.q, att)
    check(`${id} ${level}: Panic recovers from inverted 30° dive`, Math.abs(att.bank) < 10 * DEG && att.pitch > -5 * DEG && minAlt > 60, `bank ${(att.bank / DEG).toFixed(1)}°, pitch ${(att.pitch / DEG).toFixed(1)}°, lost ${(120 - minAlt).toFixed(0)} m`)
  }

  // --- Hand launch ------------------------------------------------------------------
  {
    const l = sim(id, 'trainer', { alt: 1.8, speedK: 0, throttle: 0 })
    l.s.vel.z = -vs * 1.1
    startLaunch(l.a)
    let stalled = false
    let handedAt = null
    let minAlt = Infinity
    let t = 0
    fly(l, 5, sticks(), (s, a) => {
      t += STEP_DT
      stalled ||= s.stalled
      minAlt = Math.min(minAlt, s.pos.y)
      if (handedAt === null && a.mode === 'fly') handedAt = { t, alt: s.pos.y }
    })
    check(`${id}: hand launch climbs away without stalling`, !stalled && minAlt > 0.3 && handedAt !== null, `min alt ${minAlt.toFixed(2)} m, hand-over at ${handedAt?.t.toFixed(2)} s / ${handedAt?.alt.toFixed(1)} m`)
    check(`${id}: hand-over at ~${LAUNCH_HANDOVER_AGL} m or the time limit`, handedAt && (handedAt.alt >= LAUNCH_HANDOVER_AGL - 0.5 || handedAt.t >= 2.9), '')
  }
  {
    const l = sim(id, 'normal', { alt: 1.8, speedK: 0, throttle: 0 })
    l.s.vel.z = -vs * 1.1
    startLaunch(l.a)
    let handedAt = null
    let t = 0
    fly(l, 2, (s, i) => (i * STEP_DT > 0.8 ? sticks(0.6, 0, 0, 1) : sticks(0, 0, 0, 1)), (s, a) => {
      t += STEP_DT
      if (handedAt === null && a.mode === 'fly') handedAt = t
    })
    check(`${id}: right stick takes control early during launch`, handedAt !== null && handedAt < 0.85, `hand-over at ${handedAt?.toFixed(2)} s`)
    // Normal pilots get exactly what they ask for; the Trainer (below) keeps
    // climbing after an early take-over.
  }
}

// --- Trainer: early take-over during launch keeps climbing ---------------------
for (const id of ['trainer', 'wing']) {
  const vs = stallSpeed(AIRFRAMES[id])
  const l = sim(id, 'trainer', { alt: 1.8, speedK: 0, throttle: 0 })
  l.s.vel.z = -vs * 1.1
  startLaunch(l.a)
  let minAlt = Infinity
  // Hold full right roll from 0.6 s (past the stale-thumb grace) for 2 s.
  fly(l, 6, (s, i) => {
    const t = i * STEP_DT
    if (t > 1) minAlt = Math.min(minAlt, s.pos.y)
    return t > 0.6 && t < 2.6 ? sticks(1, 0) : sticks()
  })
  check(`${id} trainer: steering right after launch still climbs to the hand-over height`, l.s.pos.y > 12 && minAlt > 1.5, `alt ${l.s.pos.y.toFixed(1)} m, min ${minAlt.toFixed(1)} m`)
}

// --- Trainer over terrain: hands-off never flies into a hill, and a low turn
// keeps its speed (no spurious approach-speed slowdown) ------------------------
for (const id of ['trainer', 'wing']) {
  const spec = AIRFRAMES[id]
  // Ground rises 1 m per 8 m flown (12 %), from 0 at x = 0.
  const ground = (x) => Math.max(0, x / 8)
  const t = sim(id, 'trainer', { alt: 15, heading: Math.PI / 2, throttle: 0.4 })
  let minAgl = Infinity
  {
    const { s, a, cmd, opts } = t
    for (let i = 0; i < Math.round(40 / STEP_DT); i++) {
      const agl = s.pos.y - ground(s.pos.x)
      stepAssist(a, 'trainer', s, spec, sticks(), { agl, onGround: false, landable: true }, STEP_DT, cmd, opts)
      stepPlane(s, spec, cmd, STEP_DT, opts)
      if (i > 120) minAgl = Math.min(minAgl, s.pos.y - ground(s.pos.x))
    }
  }
  check(`${id} trainer: hands-off over rising ground climbs with it (≥ 9 m AGL)`, minAgl > 9 && !t.s.stalled, `min ${minAgl.toFixed(1)} m AGL, climbed to ${t.s.pos.y.toFixed(0)} m`)

  const u = sim(id, 'trainer', { alt: 15, throttle: 0.4 })
  let minV = Infinity
  let minAlt = Infinity
  fly(u, 20, sticks(1, 0), (s, i) => {
    if (i > 240) {
      minV = Math.min(minV, s.airspeed)
      minAlt = Math.min(minAlt, s.pos.y)
    }
  })
  check(`${id} trainer: a sustained full-bank turn at 15 m keeps speed and height`, minV > spec.vAuthority * 0.85 && minAlt > 12, `min ${minV.toFixed(1)} m/s, min alt ${minAlt.toFixed(1)} m`)

  // The terrain floor demanding a climb WHILE banked (ground always 1 m
  // under the plane): airspeed must win — no stall, no sink, speed ≥ approach.
  const w = sim(id, 'trainer', { alt: 30, throttle: 0.4 })
  let wMinV = Infinity
  let wMinAlt = Infinity
  let wStalled = false
  {
    const { s, a, cmd, opts } = w
    for (let i = 0; i < Math.round(25 / STEP_DT); i++) {
      stepAssist(a, 'trainer', s, spec, sticks(1, 0), { agl: 1, onGround: false, landable: false }, STEP_DT, cmd, opts)
      stepPlane(s, spec, cmd, STEP_DT, opts)
      if (i > 240) {
        wMinV = Math.min(wMinV, s.airspeed)
        wMinAlt = Math.min(wMinAlt, s.pos.y)
        wStalled ||= s.stalled
      }
    }
  }
  check(`${id} trainer: a banked turn under a terrain-floor climb demand keeps speed and never sinks`, !wStalled && wMinV > stallSpeed(spec) * 1.4 && wMinAlt > 27, `min ${wMinV.toFixed(1)} m/s, min alt ${wMinAlt.toFixed(1)} m`)
}

await finish()
