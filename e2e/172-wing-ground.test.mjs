/**
 * Wing Flyer ground suite (node only — no browser): flies the bundled pure
 * `wingSim.stepSim` (assist → planeModel → ground → buildings, the exact
 * code the rig runs) over the real seeded island. Covers: touchdown
 * classification (landed / bounce / crash, attitude and surface limits),
 * the approach path geometry, the Trainer's automatic runway take-off
 * (straight, rotates, lifts off on the runway, climbs out), a Trainer
 * approach + landing on the runway that rolls out and stops on it, a
 * touch-and-go, the FPV wing's belly landing on grass, a hard landing that
 * crashes, water is not landable, and the hand launch's preflight → flying.
 */
import { reporter } from './helpers.mjs'
import { STEP_DT, attitudeOf, stallSpeed } from './.bundle/planeModel.js'
import { AIRFRAMES } from './.bundle/airframes.js'
import {
  BOUNCE_SINK,
  GEAR,
  LAND_SINK,
  classifyTouchdown,
} from './.bundle/ground.js'
import {
  GLIDE_SLOPE,
  LAKE,
  STRIP,
  STRIP_Y,
  approachPath,
  buildIsland,
  isLandable,
  islandHeight,
  onStrip,
} from './.bundle/islandLayout.js'
import {
  createWingSim,
  launchSim,
  resetSim,
  stepSim,
} from './.bundle/wingSim.js'
import { quatFromEuler, resetPlane } from './.bundle/planeModel.js'

const { check, finish } = reporter('wing-ground')
const DEG = Math.PI / 180
const island = buildIsland()
const att = { heading: 0, pitch: 0, bank: 0 }

// --- classification -------------------------------------------------------
{
  const gear = GEAR.trainer
  const level = { heading: 0, pitch: 2 * DEG, bank: 0 }
  check('gentle sink, level → landed', classifyTouchdown(gear, 0.8, level, true) === 'landed')
  check(`sink between ${LAND_SINK} and ${BOUNCE_SINK} m/s → bounce`, classifyTouchdown(gear, 2.6, level, true) === 'bounce')
  check('hard sink → crash', classifyTouchdown(gear, 5, level, true) === 'crash')
  check('steep bank at touchdown → crash', classifyTouchdown(gear, 0.8, { ...level, bank: 40 * DEG }, true) === 'crash')
  check('nose-down touchdown → not a landing', classifyTouchdown(gear, 0.8, { ...level, pitch: -20 * DEG }, true) !== 'landed')
  check('unlandable surface → crash', classifyTouchdown(gear, 0.5, level, false) === 'crash')
  check('the lake is not landable; the runway and the apron are', !isLandable(island, LAKE.x, LAKE.z) && isLandable(island, STRIP.x, STRIP.z) && isLandable(island, STRIP.x, STRIP.z + STRIP.width / 2 + 6))
}

// --- approach path ----------------------------------------------------------
{
  const east = approachPath(-1)
  const west = approachPath(1)
  const desc = east.every((p, i) => i === 0 || p.y < east[i - 1].y)
  const slope = (east[0].y - east[east.length - 1].y) / Math.abs(east[0].x - east[east.length - 1].x)
  check('approach hoops descend toward the runway on the glide slope', desc && Math.abs(Math.atan(slope) - GLIDE_SLOPE) < 0.2 * DEG, `${(Math.atan(slope) / DEG).toFixed(2)}°`)
  check('approach paths line up with the centreline, outside each end', east.every((p) => p.z === STRIP.z && p.x < STRIP.x) && west.every((p) => p.z === STRIP.z && p.x > STRIP.x))
  check('lowest hoop sits a little above the runway', east[east.length - 1].y > STRIP_Y + 1 && east[east.length - 1].y < STRIP_Y + 12)
}

const sticks = (sim, rx = 0, ry = 0, lx = 0, ly = -1) => {
  sim.sticks.right.x = rx
  sim.sticks.right.y = ry
  sim.sticks.left.x = lx
  sim.sticks.left.y = ly
}

function run(sim, level, airframe, seconds, every) {
  const n = Math.round(seconds / STEP_DT)
  for (let i = 0; i < n; i++) {
    every?.(sim, i)
    const ev = stepSim(sim, level, airframe, island, STEP_DT)
    if (ev && sim.onEvent) sim.onEvent(ev)
    if (sim.phase === 'crashed') return
  }
}

// --- Trainer runway take-off ------------------------------------------------
{
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'runway')
  let liftX = null
  let maxDev = 0
  sim.onEvent = (ev) => {
    if (ev.kind === 'liftoff' && liftX === null) liftX = sim.s.pos.x
  }
  run(sim, 'trainer', 'trainer', 14, (s) => {
    sticks(s)
    if (sim.g.onGround) maxDev = Math.max(maxDev, Math.abs(sim.s.pos.z - STRIP.z))
  })
  const agl = sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z)
  check('trainer: runway take-off lifts off ON the runway', liftX !== null && onStrip(liftX, STRIP.z), `lift-off at x=${liftX?.toFixed(1)} (runway ${-STRIP.length / 2}…${STRIP.length / 2})`)
  check('trainer: stays on the centreline during the roll', maxDev < 1, `max ${maxDev.toFixed(2)} m off`)
  check('trainer: climbs out and hands over to flying', sim.phase === 'flying' && agl > 10 && sim.a.mode === 'fly', `agl ${agl.toFixed(1)} m, mode ${sim.a.mode}`)
  check('wing: a runway start falls back to the hand (no wheels)', (() => {
    const w = createWingSim()
    resetSim(w, 'wing', island, 'runway')
    return w.start === 'hand' && w.phase === 'preflight'
  })())
}

// --- Trainer approach + landing on the runway --------------------------------
function trainerApproach(sim, { goAround = false } = {}) {
  const path = approachPath(-1)
  const p0 = path[0]
  resetSim(sim, 'trainer', island, 'hand')
  resetPlane(sim.s, { x: p0.x, y: p0.y, z: p0.z }, STRIP.heading, AIRFRAMES.trainer.vAuthority, 0, 0.3)
  sim.phase = 'flying'
  const aimX = STRIP.x - STRIP.length / 4
  let touch = null
  sim.onEvent = (ev) => {
    if (ev.kind === 'touchdown' && touch === null) touch = { ...ev, x: sim.s.pos.x }
  }
  run(sim, 'trainer', 'trainer', 40, (s) => {
    const yT = STRIP_Y + 1.5 + Math.max(0, aimX - sim.s.pos.x) * Math.tan(GLIDE_SLOPE)
    const agl = sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z)
    // Follow the glide path with the pitch stick; let go low (auto-flare).
    const ry = agl < 4 ? 0 : Math.max(-1, Math.min(1, 0.3 * (yT - sim.s.pos.y)))
    const roll = Math.max(-1, Math.min(1, -0.05 * (sim.s.pos.z - STRIP.z)))
    // Go-around: once down, let go of the pitch stick and push the
    // throttle stick up (the Trainer takes off again by itself).
    if (goAround && touch) return sticks(s, 0, 0, 0, 1)
    sticks(s, agl < 4 ? 0 : roll, ry, 0, -1)
  })
  return touch
}
{
  const sim = createWingSim()
  const touch = trainerApproach(sim)
  check('trainer: approach → touchdown is a landing on the runway', touch && touch.result === 'landed' && touch.onRunway, touch ? `${touch.result}, sink ${touch.sink.toFixed(2)} m/s at x=${touch.x.toFixed(0)}` : 'no touchdown')
  check('trainer: auto-flare keeps the touchdown soft (< 1 m/s)', touch && touch.sink < 1, touch ? `sink ${touch.sink.toFixed(2)}` : '')
  check('trainer: rolls out and STOPS on the runway', sim.phase === 'landed' && onStrip(sim.s.pos.x, sim.s.pos.z), `phase ${sim.phase} at x=${sim.s.pos.x.toFixed(0)}, landings ${sim.landings}`)
}
{
  const sim = createWingSim()
  let lifted = false
  sim.onEvent = () => {}
  trainerApproach(sim, { goAround: true })
  // trainerApproach pushes the throttle stick up after touchdown → touch-and-go.
  lifted = !sim.g.onGround && sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z) > 5
  check('trainer: throttle up after touchdown → touch-and-go', lifted && sim.landings === 1 && sim.phase === 'flying' && sim.crashes === 0, `agl ${(sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z)).toFixed(1)}, mode ${sim.a.mode}`)
}

// --- FPV wing: belly landing on grass ---------------------------------------
{
  const sim = createWingSim()
  resetSim(sim, 'wing', island, 'hand')
  // Low over the flat apron north of the runway, heading east, Trainer assist.
  const z = STRIP.z - STRIP.width / 2 - 8
  const y = islandHeight(island, -60, z) + 3
  resetPlane(sim.s, { x: -60, y, z }, STRIP.heading, AIRFRAMES.wing.vAuthority * 0.8, 0, 0.2)
  sim.phase = 'flying'
  let touch = null
  sim.onEvent = (ev) => {
    if (ev.kind === 'touchdown' && touch === null) touch = ev
  }
  run(sim, 'trainer', 'wing', 20, (s) => sticks(s))
  check('wing: belly-lands on grass (off the runway)', touch && touch.result === 'landed' && !touch.onRunway, touch ? `${touch.result}, sink ${touch.sink.toFixed(2)}` : 'no touchdown')
  check('wing: skids to a stop', sim.phase === 'landed', `phase ${sim.phase}`)
}

// --- a hard landing crashes ----------------------------------------------------
{
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'hand')
  resetPlane(sim.s, { x: 0, y: STRIP_Y + 25, z: STRIP.z }, STRIP.heading, 16, 0, 1)
  quatFromEuler(STRIP.heading, -35 * DEG, 0, sim.s.q)
  sim.phase = 'flying'
  // Acro: the forward stick is a pitch RATE, so a full push holds the dive
  // (Normal's push is rate-limited to 3 m/s now and would recover).
  run(sim, 'acro', 'trainer', 8, (s) => sticks(s, 0, -1, 0, 1))
  check('a steep powered dive into the runway → crash', sim.phase === 'crashed' && sim.crashes === 1, `phase ${sim.phase}, last ${sim.g.lastResult} sink ${sim.g.lastSink.toFixed(1)}`)
}

// --- hand launch: preflight → flying ---------------------------------------------
{
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'hand')
  const before = sim.phase
  // A thumb resting on the right stick at launch must not cancel the climb.
  run(sim, 'trainer', 'trainer', 1, (s) => sticks(s, 0.6, 0))
  const stillHeld = sim.phase === 'preflight'
  launchSim(sim, 'trainer')
  let maxAgl = 0
  run(sim, 'trainer', 'trainer', 4, (s, i) => {
    sticks(s, i * STEP_DT < 0.4 ? 0.6 : 0, 0)
    maxAgl = Math.max(maxAgl, sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z))
  })
  attitudeOf(sim.s.q, att)
  check('hand launch: preflight holds until Launch, then flies', before === 'preflight' && stillHeld && sim.phase === 'flying')
  check('hand launch: climbs away despite a stale thumb on the stick', maxAgl > 8 && sim.crashes === 0, `max agl ${maxAgl.toFixed(1)} m`)
  void stallSpeed
}

// --- soft boundary: Trainer/Normal bank home past the island edge -----------
for (const level of ['trainer', 'normal']) {
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'hand')
  // Beyond the east edge, flying further east.
  resetPlane(sim.s, { x: 470, y: 80, z: 0 }, Math.PI / 2, 14, 0, 0.5)
  sim.phase = 'flying'
  run(sim, level, 'trainer', 25, (s) => sticks(s, 0, 0, 0, 0))
  attitudeOf(sim.s.q, att)
  const r = Math.hypot(sim.s.pos.x, sim.s.pos.z)
  check(`${level}: past the edge with sticks released it turns back inside`, r < 440 && sim.crashes === 0, `r ${r.toFixed(0)} m, heading ${(att.heading / DEG).toFixed(0)}°`)
}

// --- Free Flight objective (objective.ts) -------------------------------------
{
  const { COME_BACK_DIST, FLY_OUT_DIST, createObjective, currentStep, resetObjective, stepObjective } = await import('./.bundle/objective.js')
  const o = createObjective()
  const landed = (onRunway, sink = 0.6) => ({ result: 'landed', sink, onRunway })
  check('objective starts on "take off"', currentStep(o) === 'takeoff')
  stepObjective(o, { airborne: true, homeDist: 10, touchdown: null })
  check('airborne → take-off ✓, now "fly out"', o.takeoff && currentStep(o) === 'flyout')
  stepObjective(o, { airborne: true, homeDist: 60, touchdown: landed(true) })
  check('a landing BEFORE flying out does not complete the goal', !o.land && o.completed === 0)
  stepObjective(o, { airborne: true, homeDist: FLY_OUT_DIST + 1, touchdown: null })
  check('past 150 m → fly-out ✓, now "land"', o.flyout && !o.back && currentStep(o) === 'land')
  stepObjective(o, { airborne: true, homeDist: COME_BACK_DIST + 50, touchdown: landed(false) })
  check('a landing far out on the grass does not complete the goal (not back yet)', !o.land)
  stepObjective(o, { airborne: true, homeDist: COME_BACK_DIST - 1, touchdown: null })
  check('inside 100 m → back', o.back)
  const done = stepObjective(o, { airborne: false, homeDist: 30, touchdown: landed(false, 0.9) })
  check('landing on the grass completes the goal (no runway mark)', done && o.land && !o.runway && o.sink === 0.9 && o.completed === 1 && currentStep(o) === null)
  resetObjective(o)
  check('reset keeps the completed count, clears the steps', o.completed === 1 && currentStep(o) === 'takeoff' && o.maxDist === 0)
  stepObjective(o, { airborne: true, homeDist: 200, touchdown: null })
  stepObjective(o, { airborne: true, homeDist: 50, touchdown: null })
  stepObjective(o, { airborne: false, homeDist: 20, touchdown: landed(true, 0.4) })
  check('a runway landing earns the runway mark', o.land && o.runway && o.completed === 2)
  check('a crash or bounce never completes it', (() => { const c = createObjective(); stepObjective(c, { airborne: true, homeDist: 200, touchdown: null }); stepObjective(c, { airborne: true, homeDist: 50, touchdown: null }); stepObjective(c, { airborne: false, homeDist: 20, touchdown: { result: 'bounce', sink: 3, onRunway: true } }); return !c.land })())
}

// --- the objective through the real sim: the Trainer approach from above completes it ---
{
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'hand')
  // A launch, then teleport 200 m out and fly the approach (the approach
  // helper starts the plane on the outermost hoop, ~210 m from the centre).
  const touch = trainerApproach(sim)
  check('real sim: launch → out past 150 m → runway landing completes the goal with the runway mark', touch?.result === 'landed' && sim.objective.land && sim.objective.runway && sim.objective.completed === 1, `land ${sim.objective.land} runway ${sim.objective.runway} maxDist ${sim.objective.maxDist.toFixed(0)}`)
}

// --- landing hints (objective.ts landingHint) -----------------------------------
{
  const { HINT_LOW_AGL, HINT_MAX_BEARING, HINT_MAX_DIST, landingHint } = await import('./.bundle/objective.js')
  const base = { landStep: true, airborne: true, homeDist: 200, homeRel: 0.1, linedUp: false, agl: 30 }
  check('hint: far, heading home, not lined up → "line up"', landingHint(base) === 'lineup')
  check('hint: lined up → "follow"', landingHint({ ...base, linedUp: true }) === 'follow')
  check('hint: under the flare height → "low" (even off the centreline)', landingHint({ ...base, agl: HINT_LOW_AGL - 1 }) === 'low')
  check('hint: none when flying away from the runway', landingHint({ ...base, homeRel: HINT_MAX_BEARING + 0.1 }) === null)
  check('hint: none when still far out', landingHint({ ...base, homeDist: HINT_MAX_DIST + 1 }) === null)
  check('hint: none before the "land" step, or on the ground', landingHint({ ...base, landStep: false }) === null && landingHint({ ...base, airborne: false }) === null)
}

// --- the approach: end choice, lock, hoop tally, corridor, home target ----------
{
  const A = await import('./.bundle/approach.js')
  const E = Math.PI / 2
  check('nearer end: heading east → east end (lands eastbound, end −1)', A.nearerEnd(E) === -1 && A.nearerEnd(-E) === 1)
  const a = A.createApproach()
  const facts = (x, y, z, heading, landStep = true) => ({ landStep, airborne: true, x, y, z, heading })
  check('before the land step: no end', (A.stepApproach(a, facts(-400, 40, 230, E, false), -401), a.end === null))
  A.stepApproach(a, facts(-400, 40, 230, -E), -399)
  check('land step but still flying AWAY (heading west, west of the runway) → no end yet', a.end === null)
  A.stepApproach(a, facts(-400, 40, 230, E), -401)
  check('heading home (east) far out → east end, not locked', a.end === -1 && !a.locked && a.skipped === 0)
  A.stepApproach(a, facts(-400, 40, 230, -E), -399)
  check('turning away again keeps the chosen end', a.end === -1)
  A.stepApproach(a, facts(-280, 40, 230, E), -281)
  check('heading home inside 300 m → locked', a.locked && a.end === -1)
  A.stepApproach(a, facts(-250, 40, 230, -E), -249)
  check('locked: turning round does not flip the end', a.end === -1)
  // Mid-turn inside 300 m: heading north (both ends 90° away) picks one but
  // must NOT lock; as the turn continues west the choice switches and locks.
  const m = A.createApproach()
  A.stepApproach(m, facts(171, 30, 235, -2 * DEG), 171)
  check('mid-turn (heading north) inside 300 m → an end is chosen but not locked', m.end !== null && !m.locked)
  A.stepApproach(m, facts(165, 30, 230, -60 * DEG), 166)
  check('turn continues west → switches to the west end and locks (committed)', m.end === 1 && m.locked)
  A.stepApproach(m, facts(160, 30, 230, 60 * DEG), 161)
  check('locked: a later wobble does not flip it', m.end === 1)
  // Joining late: coming back WEST from 150 m east of the runway.
  const j = A.createApproach()
  A.stepApproach(j, facts(150, 30, 230, -E), 151)
  check('turning back at 150 m east → west end, the hoops already behind are skipped', j.end === 1 && j.skipped > 0 && j.next === j.skipped && A.hoopsInPlay(j) < 6, `skipped ${j.skipped}`)
  const tj = { x: 0, z: 0 }
  A.homeTarget(j, 150, tj)
  check('…and the arrow points at the next hoop AHEAD (west of the plane)', tj.x < 150 && tj.x > STRIP.x)
  const hoops = A.hoopsOf(-1)
  check(`6 hoops, first ~300 m out at ${hoops[0].y.toFixed(0)} m`, hoops.length === 6 && Math.abs(hoops[0].x + 300) < 1)
  const b = A.createApproach()
  A.stepApproach(b, facts(hoops[0].x - 5, hoops[0].y, STRIP.z, E), hoops[0].x - 6)
  A.stepApproach(b, facts(hoops[0].x + 1, hoops[0].y + 2, STRIP.z + 3, E), hoops[0].x - 5)
  check('crossing hoop 1 within 5 m → passed', b.hoops[0] === 'passed' && b.next === 1 && A.passedCount(b) === 1)
  A.stepApproach(b, facts(hoops[1].x + 1, hoops[1].y + 9, STRIP.z, E), hoops[1].x - 1)
  check('crossing hoop 2 nine metres high → missed, tally moves on', b.hoops[1] === 'missed' && b.next === 2)
  check('lined up = within 10 m of the centreline and 35° of the landing heading', A.linedUp(b, { z: STRIP.z + 9, heading: E + 0.5 }) && !A.linedUp(b, { z: STRIP.z + 11, heading: E }) && !A.linedUp(b, { z: STRIP.z, heading: E + 0.7 }))
  const t = { x: 0, z: 0 }
  A.homeTarget(b, hoops[1].x + 2, t)
  check('home target = the next hoop ahead of the plane', t.x === hoops[2].x && t.z === hoops[2].z)
  A.homeTarget(b, STRIP.x, t)
  check('home target past the last hoop = the far threshold, straight ahead', t.x === STRIP.x + STRIP.length / 2 && t.z === STRIP.z)
  A.homeTarget(A.createApproach(), 0, t)
  check('home target with no end = the runway centre', t.x === STRIP.x && t.z === STRIP.z)
  check('slope target follows the hoop line', Math.abs(A.slopeTarget(b, hoops[2].x) - hoops[2].y) < 1e-9)
  A.resetApproach(b)
  check('reset clears the end, lock and tally', b.end === null && !b.locked && b.next === 0)
}

// --- Trainer glide-slope hold through the real sim: lined up at the first hoop,
// hands off → it rides the line down and lands on the runway --------------------
{
  const A = await import('./.bundle/approach.js')
  const sim = createWingSim()
  resetSim(sim, 'trainer', island, 'hand')
  const h0 = A.hoopsOf(-1)[0]
  resetPlane(sim.s, { x: h0.x - 30, y: h0.y + 6, z: STRIP.z + 2 }, STRIP.heading, AIRFRAMES.trainer.vAuthority, 0, 0.35)
  sim.phase = 'flying'
  // Pretend the fly-out is done: we are on the land step, coming back.
  sim.objective.takeoff = sim.objective.flyout = sim.objective.back = true
  let touch = null
  let maxAbove = -Infinity
  sim.onEvent = (ev) => { if (ev.kind === 'touchdown' && touch === null) touch = ev }
  run(sim, 'trainer', 'trainer', 60, (s) => {
    sticks(s)
    if (sim.linedUp && sim.s.pos.x > h0.x && sim.s.pos.x < STRIP.x - STRIP.length / 2) {
      maxAbove = Math.max(maxAbove, sim.s.pos.y - A.slopeTarget(sim.approach, sim.s.pos.x))
    }
  })
  check('slope hold: hands off from the first hoop, lined up → lands on the runway', touch?.result === 'landed' && touch.onRunway && sim.objective.land, `${touch?.result} runway ${touch?.onRunway} sink ${touch?.sink?.toFixed(2)}`)
  check('slope hold: stays within 4 m above the hoop line on the way down', maxAbove < 4, `max ${maxAbove.toFixed(1)} m above`)
  check('slope hold: passes most hoops hands-off', A.passedCount(sim.approach) >= 4, `${A.passedCount(sim.approach)}/6`)
  check('slope hold: tracks the centreline (touchdown within 3 m of it)', Math.abs(sim.s.pos.z - STRIP.z) < 3, `z off ${(sim.s.pos.z - STRIP.z).toFixed(1)} m`)

  // Joined roughly: 8 m off the line and 20° off heading, hands off → the
  // lateral hold brings it in and it still lands on the runway.
  const sim2 = createWingSim()
  resetSim(sim2, 'trainer', island, 'hand')
  resetPlane(sim2.s, { x: h0.x + 40, y: h0.y - 2, z: STRIP.z + 8 }, STRIP.heading - 20 * DEG, AIRFRAMES.trainer.vAuthority, 0, 0.35)
  sim2.phase = 'flying'
  sim2.objective.takeoff = sim2.objective.flyout = sim2.objective.back = true
  let touch2 = null
  sim2.onEvent = (ev) => { if (ev.kind === 'touchdown' && touch2 === null) touch2 = ev }
  run(sim2, 'trainer', 'trainer', 60, (s) => sticks(s))
  check('slope hold: joined 8 m off and 20° off, hands off → still lands on the runway', touch2?.result === 'landed' && touch2.onRunway, `${touch2?.result} runway ${touch2?.onRunway} z off ${(sim2.s.pos.z - STRIP.z).toFixed(1)}`)

  // Capture hysteresis: crossing the corridor at 30° off heading with a
  // 40° bank still rolling out (the live play-test case) — the hold captures
  // on the way through, keeps the line though the plane overshoots the
  // tight corridor, and lands.
  const sim3 = createWingSim()
  resetSim(sim3, 'trainer', island, 'hand')
  resetPlane(sim3.s, { x: h0.x + 60, y: h0.y - 4, z: STRIP.z + 9 }, STRIP.heading - 30 * DEG, AIRFRAMES.trainer.vAuthority, 0, 0.35)
  quatFromEuler(STRIP.heading - 30 * DEG, 0, 40 * DEG, sim3.s.q)
  sim3.phase = 'flying'
  sim3.objective.takeoff = sim3.objective.flyout = sim3.objective.back = true
  let touch3 = null
  let maxOff = 0
  let everCaptured = false
  sim3.onEvent = (ev) => { if (ev.kind === 'touchdown' && touch3 === null) touch3 = ev }
  run(sim3, 'trainer', 'trainer', 60, (s) => {
    sticks(s)
    if (sim3.approach.captured) { everCaptured = true; maxOff = Math.max(maxOff, Math.abs(sim3.s.pos.z - STRIP.z)) }
  })
  check('capture: crossing the corridor banked 40° and 30° off → captured, kept through the overshoot, lands on the runway', everCaptured && touch3?.result === 'landed' && touch3.onRunway, `captured ${everCaptured}, max off while captured ${maxOff.toFixed(1)} m, ${touch3?.result} runway ${touch3?.onRunway}`)
}

await finish()
