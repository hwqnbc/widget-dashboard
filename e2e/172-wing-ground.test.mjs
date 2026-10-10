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
  run(sim, 'normal', 'trainer', 8, (s) => sticks(s, 0, -1, 0, 1))
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

await finish()
