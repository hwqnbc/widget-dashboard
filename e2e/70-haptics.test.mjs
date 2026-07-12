/**
 * Haptics suite: navigator.vibrate is stubbed with a recorder before the app
 * loads, then real flights assert the pulse patterns — a scaled contact buzz
 * (rate-limited) on a sub-crash wall hit, the exact gate pattern on a gate
 * pass, and the crash pattern on a hard impact. Also sanity-checks that the
 * widget flies fine when the API is missing entirely (iOS / desktop path).
 */
import { addDroneWidget, createPilot, launch, readers, reporter } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('haptics')
const L = buildWorldLayout(DEFAULT_SEED)
const B = L.buildings[0]
const G = L.gates[0] // gate 1: straight ahead of spawn at (0, 6, -6)

const GATE_PULSE = [25, 40, 25]
const CRASH_PULSE = [100, 60, 160]

const { browser, context, page } = await launch()
await page.addInitScript(() => {
  window.__vibrations = []
  Object.defineProperty(navigator, 'vibrate', {
    value: (pattern) => {
      window.__vibrations.push(pattern)
      return true
    },
    configurable: true,
  })
})
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)

const vibrations = () => page.evaluate(() => window.__vibrations)
const clearVibrations = () => page.evaluate(() => (window.__vibrations = []))

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Fly toward the building at a capped throttle until contact/crash/timeout.
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

// ---- contact pulse (sub-crash wall hit) -------------------------------------
await clearVibrations()
await flyAtBuilding(0.5) // impact ≈ 5.8 u/s: above the 1.5 floor, below CRASH_SPEED 8
const contact = await vibrations()
const contactPulses = contact.filter((v) => typeof v === 'number')
check('wall contact buzzes', contactPulses.length >= 1, JSON.stringify(contact))
check(
  'contact pulses are short and impact-scaled (≤ 60 ms)',
  contactPulses.every((v) => v > 0 && v <= 60),
  JSON.stringify(contactPulses),
)
check(
  'cooldown rate-limits wall scraping (not one pulse per frame)',
  contactPulses.length < 30,
  `pulses=${contactPulses.length}`,
)
check('no crash pattern on a gentle hit', !contact.some((v) => Array.isArray(v) && v.length === 3 && v[0] === 100))

// ---- gate pulse ---------------------------------------------------------------
// Under heavy load the control loop can drift a thread of the ring — retry
// the pass up to 3 times before judging (each attempt re-approaches the
// entry and flies through).
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
await clearVibrations()
let gatePulsed = false
let afterGate = []
await pilot.touchStart()
for (let attempt = 0; attempt < 3 && !gatePulsed; attempt++) {
  // gate 1 sits straight ahead of spawn: entry 4 units before, exit 4 after
  await pilot.flyTo({ x: G.center.x, y: G.center.y, z: G.center.z + 4 }, { maxForward: 0.5 })
  await pilot.brake()
  await pilot.flyTo({ x: G.center.x, y: G.center.y, z: G.center.z - 4 }, { maxForward: 0.5, tol: 1.5 })
  await pilot.brake()
  await page.waitForTimeout(400)
  afterGate = await vibrations()
  gatePulsed = afterGate.some((v) => JSON.stringify(v) === JSON.stringify(GATE_PULSE))
  if (!gatePulsed) console.log(`  (gate pass attempt ${attempt + 1} missed the ring, retrying)`)
}
await pilot.touchEnd()
check('gate pass fires the GATE_PULSE pattern', gatePulsed, JSON.stringify(afterGate))

// ---- crash pulse ---------------------------------------------------------------
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
await clearVibrations()
await flyAtBuilding(1) // full speed -> crash
await page.waitForTimeout(400)
const afterCrash = await vibrations()
check(
  'crash fires the CRASH_PULSE pattern',
  afterCrash.some((v) => JSON.stringify(v) === JSON.stringify(CRASH_PULSE)),
  JSON.stringify(afterCrash.filter((v) => Array.isArray(v))),
)

// ---- no-API degradation (iOS / desktop) ----------------------------------------
const page2 = await context.newPage()
await page2.addInitScript(() => {
  // simulate a browser without the API entirely
  delete Object.getPrototypeOf(navigator).vibrate
  Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
})
// the widget from this context's earlier page is persisted — just load it
await page2.goto(page.url(), { waitUntil: 'networkidle' })
await page2.waitForSelector('[data-testid="dronesim-hud"]')
await page2.waitForTimeout(600)
const alt = parseFloat(
  await page2.locator('[data-testid="dronesim-hud"]').getAttribute('data-alt'),
)
check('widget still flies without navigator.vibrate', Math.abs(alt - 2) < 0.3, `alt=${alt}`)

await finish(browser)
