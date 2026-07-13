/**
 * Minimap suite: the inset renders the layout (buildings, gate states, pad),
 * the drone marker's SVG transform tracks the HUD telemetry (position and
 * heading), and the toggle hides/shows it with persistence.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('minimap')
const L = buildWorldLayout(DEFAULT_SEED)

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const minimap = page.locator('[data-testid="dronesim-minimap"]')
const marker = page.locator('[data-testid="dronesim-minimap-drone"]')
const minimapState = () => rootState(page, 'data-minimap')

check('minimap visible by default', (await minimap.count()) === 1)
check('toggle reports on', (await minimapState()) === 'on')

const rects = await minimap.locator('rect').count()
check('one rect per building', rects === L.buildings.length, `rects=${rects}`)
const gateStates = await minimap
  .locator('circle[data-gate-state]')
  .evaluateAll((els) => els.map((el) => el.getAttribute('data-gate-state')))
check(
  'gate circles: first active, rest upcoming',
  JSON.stringify(gateStates) === JSON.stringify(['active', 'upcoming', 'upcoming']),
  JSON.stringify(gateStates),
)

const parseTransform = (t) => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/.exec(t ?? '')
  return m ? { x: +m[1], z: +m[2], deg: +m[3] } : null
}

// marker matches telemetry at spawn
await page.waitForTimeout(500)
const t0 = await telemetry()
const m0 = parseTransform(await marker.getAttribute('transform'))
check(
  'marker sits at the drone position (spawn)',
  m0 && Math.abs(m0.x - t0.x) < 0.5 && Math.abs(m0.z - t0.z) < 0.5,
  `${JSON.stringify(m0)} vs ${JSON.stringify(t0)}`,
)

// fly somewhere and yaw — marker follows position and heading
const pilot = await createPilot(page, context)
await pilot.touchStart()
await pilot.touch(-0.6, 0.5, 0, 0.7) // climb, yaw and move
await page.waitForTimeout(2000)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(800)
await pilot.touchEnd()
const t1 = await telemetry()
const m1 = parseTransform(await marker.getAttribute('transform'))
const expectedDeg = (-t1.yaw * 180) / Math.PI
check(
  'marker tracks position in flight',
  m1 && Math.abs(m1.x - t1.x) < 0.5 && Math.abs(m1.z - t1.z) < 0.5,
  `${JSON.stringify(m1)} vs ${JSON.stringify(t1)}`,
)
check(
  'marker tracks heading',
  m1 && Math.abs(m1.deg - expectedDeg) < 3,
  `deg=${m1?.deg} expected=${expectedDeg.toFixed(1)}`,
)
check('drone actually moved for the tracking test', Math.hypot(t1.x - t0.x, t1.z - t0.z) > 3)
await page.screenshot({ path: `${ARTIFACTS_DIR}minimap.png` })

// toggle off, persist, toggle back on
await setSwitch(page, 'dronesim-minimap-toggle', false)
check('toggle hides the minimap', (await minimap.count()) === 0)
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check(
  'hidden state persists across reload',
  (await page.locator('[data-testid="dronesim-minimap"]').count()) === 0 &&
    (await minimapState()) === 'off',
)
await setSwitch(page, 'dronesim-minimap-toggle', true)
check('re-toggling shows it again', (await page.locator('[data-testid="dronesim-minimap"]').count()) === 1)

await finish(browser)
