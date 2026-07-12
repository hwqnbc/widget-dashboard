/**
 * Time-trial suite: fly a complete lap — clock starts on leaving the pad,
 * gates 1-3 in order (chip flips to TO PAD), finish on pad re-entry — then
 * verify the banner, lap/best bookkeeping, mid-lap reset semantics and
 * persistence. The route cruises ABOVE the skyline between waypoints and
 * brakes before descents: crash mode is on by default and punishes
 * full-speed flight at building height.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('timetrial')
const GATES = buildWorldLayout(DEFAULT_SEED).gates
const CRUISE_ALT = 20 // above the tallest building (18.25)
const PAD = { x: 0, z: 18 }

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { gatesChip, timerChip, lapState } = readers(page)
const pilot = await createPilot(page, context)

const s0 = await lapState()
check(
  'spawns ready, no best, gate 1, 0 laps',
  s0.status === 'ready' && s0.bestMs === 0 && s0.gate === 1 && s0.laps === 0,
  JSON.stringify(s0),
)
check('timer chip shows BEST —', (await timerChip.textContent()).includes('BEST —'))

await pilot.touchStart()
await pilot.flyTo({ x: PAD.x, y: 10, z: PAD.z - 8 })
const running = await lapState()
check('leaving the pad starts the timer', running.status === 'running', JSON.stringify(running))
await page.waitForTimeout(800)
const running2 = await lapState()
check('lap time is counting up', running2.lapMs > running.lapMs && running2.lapMs > 500, `lapMs=${running2.lapMs}`)

let from = { x: PAD.x, z: PAD.z - 8 }
for (let i = 0; i < GATES.length; i++) {
  const g = GATES[i]
  const side =
    Math.sign((from.x - g.center.x) * g.normal.x + (from.z - g.center.z) * g.normal.z) || 1
  const entry = {
    x: g.center.x + g.normal.x * 4 * side,
    y: g.center.y,
    z: g.center.z + g.normal.z * 4 * side,
  }
  const exit = {
    x: g.center.x - g.normal.x * 4 * side,
    y: g.center.y,
    z: g.center.z - g.normal.z * 4 * side,
  }
  // climb straight up, cruise high, descend onto the entry, thread the ring
  await pilot.flyTo({ x: from.x, y: CRUISE_ALT, z: from.z }, { maxForward: 0.3, tol: 2 })
  check(`gate ${i + 1}: cruise`, await pilot.flyTo({ x: entry.x, y: CRUISE_ALT, z: entry.z }))
  await pilot.brake()
  check(`gate ${i + 1}: entry`, await pilot.flyTo(entry, { maxForward: 0.5 }))
  await pilot.brake()
  check(`gate ${i + 1}: through`, await pilot.flyTo(exit, { maxForward: 0.5, tol: 1.5 }))
  from = { x: exit.x, z: exit.z }
}
await page.waitForTimeout(400)
const toPad = await lapState()
check('after gate 3 the chip shows TO PAD (gate=4)', toPad.gate === GATES.length + 1, JSON.stringify(toPad))
check('chip text is TO PAD', (await gatesChip.textContent()).includes('TO PAD'))

// The finish line is the pad's horizontal radius at ANY altitude, so the lap
// completes the moment we cruise over the pad — read the (3 s) banner
// immediately after this leg, before it auto-dismisses.
await pilot.flyTo({ x: from.x, y: CRUISE_ALT, z: from.z }, { maxForward: 0.3, tol: 2 })
check('returned over the pad (finish line)', await pilot.flyTo({ x: PAD.x, y: CRUISE_ALT, z: PAD.z }))
await page.waitForTimeout(400)
const done = await lapState()
check(
  'lap complete: 1 lap, best recorded, ready again',
  done.laps === 1 && done.bestMs > 10000 && done.status === 'ready',
  JSON.stringify(done),
)
const bannerText = await page
  .locator('[data-testid="dronesim-lap-banner"]')
  .textContent({ timeout: 2000 })
  .catch(() => '')
check('banner announces the lap + NEW BEST', (bannerText ?? '').includes('NEW BEST'), bannerText ?? 'no banner')
check('timer chip shows BEST time', (await timerChip.textContent()).startsWith('BEST '))
await page.screenshot({ path: `${ARTIFACTS_DIR}timetrial-banner.png` })
await pilot.brake()

// reset mid-lap keeps laps/best
await pilot.flyTo({ x: PAD.x, y: 12, z: PAD.z - 10 })
const mid = await lapState()
check('second lap started', mid.status === 'running', JSON.stringify(mid))
await pilot.touchEnd()
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
const afterReset = await lapState()
check(
  'reset cancels the lap, keeps laps/best',
  afterReset.status === 'ready' && afterReset.laps === 1 && afterReset.bestMs === done.bestMs,
  JSON.stringify(afterReset),
)

// persistence + ghost line render
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-timer"]')
await page.waitForTimeout(800)
const persisted = await lapState()
check(
  'best lap and laps persist across reload',
  persisted.bestMs === done.bestMs && persisted.laps === 1 && persisted.status === 'ready',
  JSON.stringify(persisted),
)
await page.screenshot({ path: `${ARTIFACTS_DIR}timetrial-ghost.png` })

await finish(browser)
