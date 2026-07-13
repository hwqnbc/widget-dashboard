/**
 * Gate-count suite: the Course slider grows the lap from 3 to 6 gates on the
 * SAME world (seed and buildings untouched — extra rings append to the PRNG
 * stream; the layout maths is unit-covered), the HUD/minimap follow, the
 * setting persists, longer laps actually sequence (gate 1 of 6 scores), and
 * changing the count mid-lap is confirm-guarded and clears the lap stats.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  closeSettings,
  createPilot,
  launch,
  openSettings,
  readers,
  reporter,
  rootState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('gates')
const L6 = buildWorldLayout(DEFAULT_SEED, 6)
const CRUISE_ALT = 24
const PAD = { x: 0, z: 18 }

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { gatesChip, lapState } = readers(page)
const gateCount = () => rootState(page, 'data-gate-count')
const minimapGates = () => page.locator('[data-testid="dronesim-minimap"] circle[data-gate-state]').count()

const setGateSlider = async (fraction) => {
  const slider = page.locator('[data-testid="dronesim-gate-count"]')
  // The Course group sits below the dialog's fold — mouse events at
  // out-of-viewport coordinates are silently dropped, so scroll first.
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2)
  await page.waitForTimeout(250)
}

check('default lap is 3 gates', (await gateCount()) === '3')
check('gates chip shows GATE 1/3', (await gatesChip.textContent()).includes('GATE 1/3'))
check('minimap draws 3 gates', (await minimapGates()) === 3)
const seed0 = await rootState(page, 'data-world-seed')

// grow to 6 — no best lap yet, applies instantly
await openSettings(page)
await setGateSlider(0.999)
await closeSettings(page)
check('slider sets 6 gates', (await gateCount()) === '6')
check('chip follows: GATE 1/6', (await gatesChip.textContent()).includes('GATE 1/6'))
check('minimap draws 6 gates', (await minimapGates()) === 6)
check('same world: seed unchanged', (await rootState(page, 'data-world-seed')) === seed0)
check(
  'same world: building count unchanged',
  (await page.locator('[data-testid="dronesim-minimap"] rect').count()) === L6.buildings.length,
)
await page.screenshot({ path: `${ARTIFACTS_DIR}gates-six.png` })

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('gate count persists across reload', (await gateCount()) === '6')

// a 6-gate lap sequences: thread gate 1, chip advances to 2/6, lap running
const pilot = await createPilot(page, context)
const g = L6.gates[0]
const side =
  Math.sign((PAD.x - g.center.x) * g.normal.x + (PAD.z - g.center.z) * g.normal.z) || 1
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
await pilot.touchStart()
await pilot.flyTo({ x: PAD.x, y: CRUISE_ALT, z: PAD.z }, { maxForward: 0.3, tol: 2 })
check('cruise to gate 1', await pilot.flyTo({ x: entry.x, y: CRUISE_ALT, z: entry.z }))
await pilot.brake()
check('descend to the entry', await pilot.flyTo(entry, { maxForward: 0.5 }))
await pilot.brake()
check('thread gate 1', await pilot.flyTo(exit, { maxForward: 0.5, tol: 1.5 }))
await pilot.touchEnd()
await page.waitForTimeout(400)
const mid = await lapState()
check('gate 1 of 6 scored, lap running', mid.gate === 2 && mid.status === 'running', JSON.stringify(mid))
check('chip shows GATE 2/6', (await gatesChip.textContent()).includes('GATE 2/6'))

// changing the count mid-lap needs confirmation and voids the lap
const confirmDialog = () => page.getByRole('dialog').filter({ hasText: 'Change gates?' })
await openSettings(page)
await setGateSlider(0.001) // ask for 3
check('mid-lap change asks for confirmation', (await confirmDialog().count()) === 1)
await confirmDialog().getByRole('button', { name: 'Keep course' }).click()
await page.waitForTimeout(300)
check('cancel keeps 6 gates', (await gateCount()) === '6')
check('cancel keeps the lap running', (await lapState()).status === 'running')
await setGateSlider(0.001)
await confirmDialog().getByRole('button', { name: 'Change' }).click()
await page.waitForTimeout(400)
await closeSettings(page)
const after = await lapState()
check('confirm applies 3 gates', (await gateCount()) === '3')
check('lap voided and stats cleared', after.status === 'ready' && after.bestMs === 0, JSON.stringify(after))
check('chip back to GATE 1/3', (await gatesChip.textContent()).includes('GATE 1/3'))

await finish(browser)
