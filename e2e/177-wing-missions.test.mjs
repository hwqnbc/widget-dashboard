/**
 * Wing Flyer missions suite (node only — no browser): the Round 1b "Score
 * it" pure modules on the bundled `scorecard` + `missions` + `wingSim`
 * (the exact step the rig runs) over the real seeded island, plus the
 * records slice's star/badge policy. Covers: the one landing scorecard
 * (spot / centreline / smoothness, bands, grass = 0, bounces, both
 * runway ends), the mission ladder data + unlock gate + badge helpers,
 * every mission's pass condition through the real sim with the Trainer
 * (first: hands-off from the first hoop passes; circuit: joining the
 * line late fails on hoops; short: the hands-off float overruns the line,
 * a push-down lands short and passes; crosswind: hands-off drifts onto the
 * grass with the lateral hold off, a crab correction lands it; engine-out:
 * the motor cuts only above CUT_AGL AFTER the fly-out, the Trainer then
 * glides at best-glide speed and a hand-launched run glides home and
 * lands), touch-and-go chains (a strong landing + lift-off counts, a stop
 * ends the chain with the best kept), a crash resolving the run and the
 * verdict surviving the respawn until the next launch, Free Flight never
 * resolving, and the records reducer (stars max, badge = best star run's
 * assist with ties to the harder level, 0-star runs never badge, chain max).
 */
import { reporter } from './helpers.mjs'
import { STEP_DT, attitudeOf, bestGlideSpeed, resetPlane } from './.bundle/planeModel.js'
import { AIRFRAMES } from './.bundle/airframes.js'
import { APPROACH_HOOPS, STRIP, buildIsland, islandHeight } from './.bundle/islandLayout.js'
import { LAND_SINK } from './.bundle/ground.js'
import { createWingSim, launchSim, resetSim, setMode, stepSim } from './.bundle/wingSim.js'
import * as A from './.bundle/approach.js'
import * as S from './.bundle/scorecard.js'
import * as M from './.bundle/missions.js'
import recordsReducer, { recordWingChain, recordWingMission, resetGameRecords, selectWingFlyerRecords } from './.bundle/recordsSlice.js'

const { check, finish } = reporter('wing-missions')
const island = buildIsland()
const att = { heading: 0, pitch: 0, bank: 0 }

// --- scorecard ---------------------------------------------------------------
{
  const perfect = S.scoreLanding({ x: S.TOUCHDOWN_X, z: STRIP.z, end: -1, sink: 0.3, onRunway: true, bounces: 0 })
  check('perfect touchdown → 100, ★★★', perfect.score === 100 && perfect.stars === 3 && perfect.spot === 50 && perfect.centre === 50, `${perfect.score}`)
  const grass = S.scoreLanding({ x: S.TOUCHDOWN_X, z: STRIP.z + 40, end: -1, sink: 0.3, onRunway: false, bounces: 0 })
  check('grass → 0 (the runway counts)', grass.score === 0 && grass.stars === 0)
  const long = S.scoreLanding({ x: S.TOUCHDOWN_X + 40, z: STRIP.z, end: -1, sink: 0.3, onRunway: true, bounces: 0 })
  check('40 m long eastbound: along +40, spot fades, still ★★', long.alongM === 40 && long.spot < 50 && long.spot > 20 && long.stars === 2, `spot ${long.spot} score ${long.score}`)
  const westLong = S.scoreLanding({ x: S.TOUCHDOWN_X - 40, z: STRIP.z, end: 1, sink: 0.3, onRunway: true, bounces: 0 })
  check('the other end: 40 m past the centre westbound is also "long" (+40)', westLong.alongM === 40 && westLong.score === long.score)
  const edge = S.scoreLanding({ x: S.TOUCHDOWN_X, z: STRIP.z + STRIP.width / 2, end: -1, sink: 0.3, onRunway: true, bounces: 0 })
  check('on the runway edge: centreline mark 0, spot full → 50 ★', edge.centre === 0 && edge.spot === 50 && edge.score === 50 && edge.stars === 1)
  const firm = S.scoreLanding({ x: S.TOUCHDOWN_X, z: STRIP.z, end: -1, sink: LAND_SINK - 0.01, onRunway: true, bounces: 0 })
  check('a firm touchdown at the landing limit keeps 30 % (×0.3)', Math.abs(firm.smooth - S.SMOOTH_FLOOR) < 0.02 && firm.score === 30, `${firm.score}`)
  const bounced = S.scoreLanding({ x: S.TOUCHDOWN_X, z: STRIP.z, end: -1, sink: 0.3, onRunway: true, bounces: 2 })
  check('two bounces → ×0.7², still ★', Math.abs(bounced.smooth - 0.49) < 0.01 && bounced.score === 49 && bounced.stars === 1)
  check('star bands: 39 → 0, 40 → ★, 70 → ★★, 90 → ★★★', S.starsFor(39) === 0 && S.starsFor(40) === 1 && S.starsFor(70) === 2 && S.starsFor(90) === 3)
}

// --- mission data + helpers --------------------------------------------------
{
  check('five missions in the teaching order', M.MISSION_IDS.join(',') === 'first,circuit,short,crosswind,engineout' && M.MISSIONS.length === 5)
  check('play modes: free + the five + touchgo; coerce rejects junk', M.PLAY_MODES.length === 7 && M.coerceMode('short') === 'short' && M.coerceMode('rings') === undefined)
  check('unlock gate: 1 open, 2 needs a star on 1, unlock-all opens everything', M.missionUnlocked(0, {}, false) && !M.missionUnlocked(1, {}, false) && M.missionUnlocked(1, { first: 1 }, false) && M.missionUnlocked(4, {}, true))
  check('next mission / none after the last', M.nextMission('first') === 'circuit' && M.nextMission('engineout') === null)
  check('badge helpers: easier / harder', M.easierAssist('acro', 'trainer') === 'trainer' && M.harderAssist('normal', 'trainer') === 'normal')
  check('crosswind drops the Trainer lateral hold; the others keep it; free keeps it', !M.modeLateralHold('crosswind') && M.modeLateralHold('first') && M.modeLateralHold('free'))
  check('crosswind has wind, the rest are calm', M.modeWind('crosswind')?.z === M.CROSSWIND.z && M.modeWind('first') === undefined && M.modeWind('touchgo') === undefined)
  check('stop line: 160 m from the threshold the plane came over, each end', M.stopLineX(-1) === STRIP.x + 60 && M.stopLineX(1) === STRIP.x - 60)
  const r = M.createMissionRun('circuit')
  const steps = M.missionChecklist(r, { takeoff: true, flyout: false, land: false, runway: false }, { passed: 2, inPlay: 6 })
  check('circuit checklist: take off ✓ ▸ fly out ▸ hoops 2/6 ▸ land', steps.map((s) => s.key).join('>') === 'takeoff>flyout>hoops>land' && steps[0].done && !steps[1].done && steps[2].label === 'Hoops 2/6')
  const eo = M.missionChecklist(M.createMissionRun('engineout'), { takeoff: true, flyout: true, land: false, runway: false }, { passed: 0, inPlay: 0 })
  check('engine-out checklist has the climb step before the glide', eo.map((s) => s.key).join('>') === 'takeoff>flyout>climb>land' && /35 m/.test(eo[2].label))
  const free = M.missionChecklist(M.createMissionRun('free'), { takeoff: true, flyout: true, land: true, runway: true }, { passed: 0, inPlay: 0 })
  check('free flight checklist: the runway mark on the land step', free[2].label === 'Land · Runway!' && free[2].done)
}

// --- missions through the real sim -----------------------------------------
function run(sim, seconds, every) {
  const n = Math.round(seconds / STEP_DT)
  for (let i = 0; i < n; i++) {
    every?.(sim, i * STEP_DT)
    const ev = stepSim(sim, sim.level ?? 'trainer', 'trainer', island, STEP_DT)
    if (ev && sim.onEvent) sim.onEvent(ev)
    if (sim.phase === 'crashed' || sim.phase === 'landed') return
  }
}
const release = (s) => {
  s.sticks.right.x = 0
  s.sticks.right.y = 0
  s.sticks.left.x = 0
  s.sticks.left.y = -1
}
/** A run joining the eastbound line 30 m before the first hoop, on the
 * land step (the fly-out done), hands off unless `every` says otherwise. */
function fromHoop(mode, every, { offset = 0, flyout = true } = {}) {
  const sim = createWingSim()
  setMode(sim, mode)
  resetSim(sim, 'trainer', island, 'hand')
  const h0 = A.hoopsOf(-1)[0]
  resetPlane(sim.s, { x: h0.x - 30 + offset, y: h0.y + 6, z: STRIP.z + 2 }, STRIP.heading, AIRFRAMES.trainer.vAuthority, 0, 0.35)
  sim.phase = 'flying'
  sim.objective.takeoff = true
  sim.objective.flyout = sim.objective.back = flyout
  run(sim, 90, (s) => {
    release(s)
    every?.(s)
  })
  return sim
}
const agl = (sim) => sim.s.pos.y - islandHeight(island, sim.s.pos.x, sim.s.pos.z)

{
  const sim = fromHoop('first')
  const r = sim.mission
  check('first: hands-off Trainer from the first hoop → done, scored, ★★ (float lands ~35 m long)', r.outcome === 'done' && r.fail === null && r.stars >= 2 && r.landing?.spot > 0 && r.landing?.centre === 50, `score ${r.score} spot ${r.landing?.spot} along ${r.landing?.alongM.toFixed(0)} m`)
  check('first: badge is the level flown (trainer)', r.badge === 'trainer')
  check('first: the run resolves ONCE (a later step changes nothing)', M.stepMission(r, { level: 'trainer', airborne: false, agl: 0, takeoff: true, flyout: true, hoopsPassed: 6, hoopsInPlay: 6, event: null, crashed: false, x: 0, z: STRIP.z, heading: 0 }) === false)
}
{
  // Pure: a runway landing + stop WITHOUT the fly-out done.
  const r = M.createMissionRun('first')
  const base = { level: 'trainer', airborne: false, agl: 0, takeoff: true, flyout: false, hoopsPassed: 0, hoopsInPlay: 0, crashed: false, x: S.TOUCHDOWN_X, z: STRIP.z, heading: Math.PI / 2 }
  M.stepMission(r, { ...base, event: { kind: 'touchdown', result: 'landed', sink: 0.4, onRunway: true } })
  M.stepMission(r, { ...base, event: { kind: 'stopped' } })
  check('first: landing before the fly-out → fail "early" (the landing itself was perfect)', r.outcome === 'fail' && r.fail === 'early' && r.landing?.score === 100, `${r.outcome} ${r.fail}`)
  const r2 = M.createMissionRun('first')
  M.stepMission(r2, { ...base, flyout: true, event: { kind: 'touchdown', result: 'landed', sink: 0.4, onRunway: false } })
  M.stepMission(r2, { ...base, flyout: true, event: { kind: 'stopped' } })
  check('first: a grass landing after the fly-out → fail "grass"', r2.outcome === 'fail' && r2.fail === 'grass')
  check('fail words exist for every reason', ['crash', 'grass', 'early', 'hoops', 'overrun'].every((f) => M.failWords(f, 'first').length > 5) && /climb/.test(M.failWords('early', 'engineout')))
}
{
  const sim = fromHoop('circuit')
  check('circuit: all six hoops hands-off → done', sim.mission.outcome === 'done' && A.passedCount(sim.approach) === APPROACH_HOOPS, `${A.passedCount(sim.approach)}/${A.hoopsInPlay(sim.approach)}`)
  const late = fromHoop('circuit', null, { offset: 80 })
  check('circuit: joining the line past the first hoop → fail "hoops" (all six must be flown)', late.mission.outcome === 'fail' && late.mission.fail === 'hoops', `${A.passedCount(late.approach)}/${A.hoopsInPlay(late.approach)}`)
}
{
  const floated = fromHoop('short')
  check('short: the hands-off float rolls past the line → fail "overrun"', floated.mission.outcome === 'fail' && floated.mission.fail === 'overrun' && floated.mission.stopX > M.stopLineX(-1), `stopped at ${floated.mission.stopX.toFixed(0)}, line ${M.stopLineX(-1)}`)
  const pushed = fromHoop('short', (s) => {
    if (s.s.pos.x > -120 && !s.g.onGround) s.sticks.right.y = -0.5
  })
  check('short: pushing down from the aim point touches earlier and stops before the line → done', pushed.mission.outcome === 'done' && pushed.mission.stopX < M.stopLineX(-1) && pushed.mission.stars >= 1, `stopped at ${pushed.mission.stopX.toFixed(0)}, score ${pushed.mission.score}`)
}
{
  const drift = fromHoop('crosswind')
  check('crosswind: hands-off drifts off the strip (no lateral hold) → grass', drift.mission.outcome === 'fail' && drift.mission.fail === 'grass' && Math.abs(drift.s.pos.z - STRIP.z) > STRIP.width / 2, `z off ${(drift.s.pos.z - STRIP.z).toFixed(0)} m`)
  check('crosswind: the sim carries the wind', drift.opts.wind?.z === M.CROSSWIND.z)
  const crab = fromHoop('crosswind', (s) => {
    if (s.g.onGround) return
    attitudeOf(s.s.q, att)
    const err = STRIP.z - s.s.pos.z
    const hdgT = Math.PI / 2 + Math.max(-0.4, Math.min(0.4, err * 0.06))
    const e = Math.atan2(Math.sin(hdgT - att.heading), Math.cos(hdgT - att.heading))
    s.sticks.right.x = Math.max(-1, Math.min(1, e * 3))
  })
  check('crosswind: a crab correction on the roll stick lands it on the runway → done', crab.mission.outcome === 'done' && crab.mission.stars >= 1, `score ${crab.mission.score} across ${crab.mission.landing?.acrossM.toFixed(1)} m`)
}
{
  // Engine-out from a real hand launch: climb to 40 m straight away (no
  // cut yet — the fly-out comes first), fly out, the motor cuts, steer
  // home, hands off once lined up — the Trainer glides it in.
  const sim = createWingSim()
  setMode(sim, 'engineout')
  resetSim(sim, 'trainer', island, 'hand')
  launchSim(sim, 'trainer')
  let cut = null
  let highBeforeFlyout = false
  let minGlideSpeed = Infinity
  let turn
  run(sim, 150, (s, t) => {
    release(s)
    const r = s.mission
    if (!r.motorOut) {
      if (s.a.mode === 'fly' && agl(s) < M.CUT_AGL + 5) s.sticks.right.y = 1 // pull: climb to 40 m, then hold
      if (!s.objective.flyout && agl(s) > M.CUT_AGL) highBeforeFlyout = true
    } else {
      if (cut === null) cut = { agl: agl(s), flyout: s.objective.flyout, throttle: s.s.throttle, t }
      if (t > cut.t + 3 && !s.g.onGround) minGlideSpeed = Math.min(minGlideSpeed, s.s.airspeed)
      if (!s.linedUp) {
        attitudeOf(s.s.q, att)
        const tgt = { x: 0, z: 0 }
        A.homeTarget(s.approach, s.s.pos.x, tgt)
        const bearing = Math.atan2(tgt.x - s.s.pos.x, -(tgt.z - s.s.pos.z))
        const rel = Math.atan2(Math.sin(bearing - att.heading), Math.cos(bearing - att.heading))
        if (turn === undefined) turn = Math.sign(rel) || 1
        if (Math.abs(rel) < 0.15) turn = 0
        else if (turn === 0) turn = Math.sign(rel)
        s.sticks.right.x = turn
      } else {
        turn = undefined
      }
    }
  })
  const r = sim.mission
  check(`engine-out: above ${M.CUT_AGL} m before the fly-out does NOT cut; the cut waits for the fly-out`, highBeforeFlyout && cut !== null && cut.flyout && cut.agl >= M.CUT_AGL, `cut at ${cut?.agl.toFixed(0)} m, flyout ${cut?.flyout}`)
  check('engine-out: the motor is dead from the cut (throttle 0 whatever the Trainer asks)', cut !== null && sim.s.throttle === 0)
  check('engine-out: the Trainer glides near best-glide speed, never mushing', minGlideSpeed > bestGlideSpeed(AIRFRAMES.trainer) * 0.85, `min ${minGlideSpeed.toFixed(1)} vs best ${bestGlideSpeed(AIRFRAMES.trainer).toFixed(1)} m/s`)
  check('engine-out: glides home and lands on the runway → done', r.outcome === 'done' && r.fail === null && r.landing?.spot >= 0 && r.landingOnRunway, `${r.outcome} ${r.fail ?? ''} score ${r.score}`)
}
{
  // Touch and go: land, keep rolling, throttle up → lift off again: chain ×1
  // and the checklist restarts for the next circuit.
  const sim = createWingSim()
  setMode(sim, 'touchgo')
  resetSim(sim, 'trainer', island, 'hand')
  const h0 = A.hoopsOf(-1)[0]
  resetPlane(sim.s, { x: h0.x - 30, y: h0.y + 6, z: STRIP.z + 2 }, STRIP.heading, AIRFRAMES.trainer.vAuthority, 0, 0.35)
  sim.phase = 'flying'
  sim.objective.takeoff = true
  let lifted = false
  let chainAtLanding = 0
  sim.onEvent = (ev) => {
    if (ev.kind === 'touchdown' && ev.result === 'landed') chainAtLanding = sim.mission.chain
    if (ev.kind === 'liftoff') lifted = true
  }
  run(sim, 60, (s) => {
    release(s)
    if (s.g.onGround && s.mission.chain >= 1 && !lifted) s.sticks.left.y = 1 // go around
  })
  const r = sim.mission
  check('touch and go: a scoring runway landing → chain ×1', chainAtLanding === 1 && r.bestChain === 1, `chain at landing ${chainAtLanding}, best ${r.bestChain}`)
  check('touch and go: throttle up on the roll-out lifts off again — the run goes on', lifted && r.outcome === 'flying' && sim.phase === 'flying' && !sim.g.onGround, `lifted ${lifted} ${r.outcome} ${sim.phase}`)
  check('touch and go: the checklist restarts after the lift-off (take off ✓, land pending)', sim.objective.takeoff && !sim.objective.land)
  // A plain landing that rolls to a stop ends the chain, best kept.
  const stop = fromHoop('touchgo')
  check('touch and go: stopping ends the chain → done, "stop", best ×1 kept', stop.mission.outcome === 'done' && stop.mission.chainBreak === 'stop' && stop.mission.bestChain === 1 && stop.mission.chain === 0, `${stop.mission.outcome} ${stop.mission.chainBreak} best ${stop.mission.bestChain}`)
}
{
  // A crash resolves the run as a fail; the verdict survives the respawn
  // in the hand (the panel shows it) and clears on the next launch.
  const sim = createWingSim()
  setMode(sim, 'first')
  resetSim(sim, 'trainer', island, 'hand')
  resetPlane(sim.s, { x: 0, y: 60, z: STRIP.z - 150 }, 0, 14, 0, 0.35)
  sim.phase = 'flying'
  sim.level = 'normal'
  run(sim, 30, (s) => {
    release(s)
    s.sticks.right.y = -1
    s.sticks.left.y = 1
  })
  check('a powered dive crashes → the mission fails "crash" with the Normal badge', sim.phase === 'crashed' && sim.mission.outcome === 'fail' && sim.mission.fail === 'crash' && sim.mission.badge === 'normal')
  // The tumble's respawn keeps the verdict…
  resetSim(sim, 'trainer', island, 'hand', true)
  check('…the respawn keeps the verdict for the panel', sim.phase === 'preflight' && sim.mission.outcome === 'fail')
  // …and a new launch starts a fresh run.
  launchSim(sim, 'trainer')
  check('…and the next launch starts a fresh run', sim.mission.outcome === 'flying' && sim.mission.fail === null && sim.mission.badge === 'acro')
  // Retry (a plain reset) also clears it.
  resetSim(sim, 'trainer', island, 'hand')
  check('a retry reset clears the run too', sim.mission.outcome === 'flying')
}
{
  const sim = fromHoop('free')
  check('free flight: the run never resolves, the checklist completes as before', sim.mission.outcome === 'flying' && sim.objective.land && sim.objective.runway && sim.phase === 'landed')
}

// --- records policy --------------------------------------------------------
{
  let state = { records: recordsReducer(undefined, { type: 'init' }) }
  const dispatch = (a) => (state = { records: recordsReducer(state.records, a) })
  const sel = () => selectWingFlyerRecords(state)
  dispatch(recordWingMission({ key: 'first', stars: 3, score: 95, assist: 'trainer' }))
  check('records: a ★★★ Trainer run → 3 stars, badge T, best 95, 1 landing', sel().stars.first === 3 && sel().badge.first === 'trainer' && sel().bestScore.first === 95 && sel().landings === 1)
  dispatch(recordWingMission({ key: 'first', stars: 1, score: 50, assist: 'acro' }))
  check('records: a ★ Acro run later keeps ★★★ AND the Trainer badge (the badge describes the stars)', sel().stars.first === 3 && sel().badge.first === 'trainer' && sel().bestScore.first === 95 && sel().landings === 2)
  dispatch(recordWingMission({ key: 'first', stars: 3, score: 91, assist: 'acro' }))
  check('records: an equal ★★★ Acro run → the harder badge wins the tie', sel().badge.first === 'acro' && sel().bestScore.first === 95)
  dispatch(recordWingMission({ key: 'first', stars: 3, score: 92, assist: 'normal' }))
  check('records: an equal ★★★ Normal run never lowers the Acro badge', sel().badge.first === 'acro')
  dispatch(recordWingMission({ key: 'circuit', stars: 0, score: 30, assist: 'trainer' }))
  check('records: a 0-star landing counts a landing + score but sets no star or badge', sel().stars.circuit === undefined && sel().badge.circuit === undefined && sel().bestScore.circuit === 30 && sel().landings === 5)
  dispatch(recordWingChain({ chain: 3 }))
  dispatch(recordWingChain({ chain: 2 }))
  check('records: best chain is a max', sel().bestChain === 3)
  dispatch(resetGameRecords('wingFlyer'))
  check('records: reset clears the namespace', sel().bestChain === 0 && Object.keys(sel().stars).length === 0 && sel().landings === 0)
  const stale = selectWingFlyerRecords({ records: {} })
  check('records: a stored slice without the namespace reads as empty (fallback selector)', stale.bestChain === 0 && stale.landings === 0)
}

await finish()
