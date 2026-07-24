/**
 * Sound suite: window.AudioContext is stubbed with a recorder before the app
 * loads (lesson #40 — stub browser APIs at the page level), then real flights
 * assert the synthesized-audio contract: off by default (no context ever
 * constructed), enabling builds the graph and starts the two detuned sawtooth
 * rotor oscillators, stick effort pitches the rotor hum up from its 85 Hz
 * idle, a gate pass fires the 880 Hz chime, a crash fires the low thud and
 * mutes the rotor while tumbling, disabling suspends the context, and the
 * toggle persists across reload. The engine deliberately schedules only via
 * setValueAtTime / linearRampToValueAtTime / setTargetAtTime so this stub
 * surface is the whole contract.
 */
import {
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('sound')
const L = buildWorldLayout(DEFAULT_SEED)
const B = L.buildings[0]
const G = L.gates[0] // gate 1: straight ahead of spawn

const ROTOR_IDLE_HZ = 85

const { browser, context, page } = await launch()
await page.addInitScript(() => {
  window.__audioLog = { ctxCount: 0, events: [] }
  const log = (e) => window.__audioLog.events.push(e)
  // AudioParam recorder: the engine only ever uses these three schedulers
  // (plus direct .value assignment), so this stub IS the full surface.
  const makeParam = (name, owner) => ({
    value: 0,
    setValueAtTime(v) {
      log({ op: 'set', param: name, osc: owner?.type, v })
    },
    linearRampToValueAtTime(v) {
      log({ op: 'ramp', param: name, osc: owner?.type, v })
    },
    setTargetAtTime(v) {
      log({ op: 'target', param: name, osc: owner?.type, v })
    },
  })
  class FakeAudioContext {
    constructor() {
      window.__audioLog.ctxCount++
      this.state = 'running'
      this.currentTime = 0
      this.destination = {}
    }
    resume() {
      this.state = 'running'
      log({ op: 'resume' })
      return Promise.resolve()
    }
    suspend() {
      this.state = 'suspended'
      log({ op: 'suspend' })
      return Promise.resolve()
    }
    createGain() {
      const node = { connect() {} }
      node.gain = makeParam('gain', null)
      return node
    }
    createBiquadFilter() {
      const node = { type: 'lowpass', connect() {} }
      node.frequency = makeParam('filter-freq', null)
      return node
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        connect() {},
        start() {
          log({ op: 'start', osc: osc.type })
        },
        stop() {},
      }
      osc.frequency = makeParam('frequency', osc)
      osc.detune = makeParam('detune', osc)
      return osc
    }
  }
  Object.defineProperty(window, 'AudioContext', {
    value: FakeAudioContext,
    configurable: true,
  })
})
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)

const audioLog = () => page.evaluate(() => window.__audioLog)
const clearEvents = () => page.evaluate(() => (window.__audioLog.events = []))
const rotorFreqTargets = (log) =>
  log.events
    .filter((e) => e.op === 'target' && e.param === 'frequency' && e.osc === 'sawtooth')
    .map((e) => e.v)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Fly toward the first building at a capped throttle until crash/timeout
// (same closed-loop approach as the haptics suite).
async function flyAtBuilding(maxForward, timeout = 25000) {
  const target = { x: B.x, y: Math.min(B.h / 2 + 1, 5), z: B.z }
  const deadline = Date.now() + timeout
  await pilot.touchStart()
  while (Date.now() < deadline) {
    const t = await telemetry()
    if (t.crash === 'tumbling') break
    const dx = target.x - t.x
    const dz = target.z - t.z
    const err = wrap(Math.atan2(-dx, -dz) - t.yaw)
    const fwd = Math.abs(err) < 0.4 ? maxForward : 0
    await pilot.touch(clamp(-2.0 * err, -1, 1), clamp((target.y - t.alt) * 0.8, -1, 1), 0, fwd)
    if (Math.hypot(dx, dz) < 6 && t.speed < 0.8 && fwd === maxForward) break
    await page.waitForTimeout(120)
  }
  await pilot.touchEnd()
}

// ---- default off: no context is ever constructed ---------------------------
check('sound defaults off on the root', (await rootState(page, 'data-sound')) === 'off')
await page.waitForTimeout(800) // sim loop + HUD ticks running the whole time
let log = await audioLog()
check('no AudioContext constructed while off', log.ctxCount === 0, `ctxCount=${log.ctxCount}`)
check('no audio scheduled while off', log.events.length === 0, `events=${log.events.length}`)

// ---- enable: graph built, rotor oscillators running -------------------------
await setSwitch(page, 'dronesim-sound-toggle', true)
check('root reflects sound on', (await rootState(page, 'data-sound')) === 'on')
log = await audioLog()
check('exactly one AudioContext', log.ctxCount === 1, `ctxCount=${log.ctxCount}`)
const rotorStarts = log.events.filter((e) => e.op === 'start' && e.osc === 'sawtooth')
check('two sawtooth rotor oscillators started', rotorStarts.length === 2, `starts=${rotorStarts.length}`)

// ---- rotor pitch follows effort ---------------------------------------------
await clearEvents()
await page.waitForTimeout(1000) // hands off: idle hover
const idle = rotorFreqTargets(await audioLog())
check('idle rotor hum sits at the base pitch', idle.length > 0 && Math.max(...idle) <= ROTOR_IDLE_HZ + 5, `max=${idle.length ? Math.max(...idle) : 'none'}`)

await clearEvents()
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0) // full climb: effort 1 with no collision risk
await page.waitForTimeout(2000)
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
const working = rotorFreqTargets(await audioLog())
check(
  'full-stick effort pitches the rotor well above idle',
  working.length > 0 && Math.max(...working) >= ROTOR_IDLE_HZ * 1.5,
  `max=${working.length ? Math.max(...working) : 'none'}`,
)

// ---- gate chime ----------------------------------------------------------------
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
await clearEvents()
let chimed = false
await pilot.touchStart()
for (let attempt = 0; attempt < 3 && !chimed; attempt++) {
  await pilot.flyTo({ x: G.center.x, y: G.center.y, z: G.center.z + 4 }, { maxForward: 0.5 })
  await pilot.brake()
  await pilot.flyTo({ x: G.center.x, y: G.center.y, z: G.center.z - 4 }, { maxForward: 0.5, tol: 1.5 })
  await pilot.brake()
  await page.waitForTimeout(400)
  const events = (await audioLog()).events
  chimed = events.some((e) => e.op === 'set' && e.param === 'frequency' && e.v === 880)
  if (!chimed) console.log(`  (gate pass attempt ${attempt + 1} missed the ring, retrying)`)
}
await pilot.touchEnd()
check('gate pass fires the 880 Hz chime', chimed)

// ---- crash thud + rotor muted while tumbling ------------------------------------
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
await clearEvents()
await flyAtBuilding(1) // full speed -> crash (crash mode is on by default)
await page.waitForTimeout(500)
const crashEvents = (await audioLog()).events
check(
  'crash fires the low thud',
  crashEvents.some((e) => e.op === 'set' && e.param === 'frequency' && e.osc === 'sine' && e.v <= 200),
)
check(
  'rotor gain ramps to silence while tumbling',
  crashEvents.some((e) => e.op === 'target' && e.param === 'gain' && e.v === 0),
)

// ---- persistence: on across reload ----------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
await page.waitForTimeout(800)
check('sound stays on across reload', (await rootState(page, 'data-sound')) === 'on')
log = await audioLog()
check('context auto-recreated for a persisted on state', log.ctxCount === 1, `ctxCount=${log.ctxCount}`)

// ---- disable: context suspended, off persists ------------------------------------
await setSwitch(page, 'dronesim-sound-toggle', false)
check('root reflects sound off', (await rootState(page, 'data-sound')) === 'off')
log = await audioLog()
check(
  'disabling suspends the context',
  log.events.some((e) => e.op === 'suspend'),
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
await page.waitForTimeout(800)
check('sound stays off across reload', (await rootState(page, 'data-sound')) === 'off')
log = await audioLog()
check('no context constructed after off reload', log.ctxCount === 0, `ctxCount=${log.ctxCount}`)

await finish(browser)
