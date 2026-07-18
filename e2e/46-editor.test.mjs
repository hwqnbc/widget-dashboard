/**
 * Course-editor suite: build a hand-placed course by flying — enter the
 * editor from settings, drop gates at the drone's position (validation
 * rejects pad-adjacent and stacked drops), undo, save (custom course
 * replaces the seeded rings only), race a full lap through it, persist,
 * and switch course source back and forth (confirm-guarded once a best
 * exists). Placement maths is unit-covered (pack/parse/validate).
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

const { check, finish } = reporter('editor')
const CRUISE_ALT = 24
const PAD = { x: 0, z: 18 }
// Drop spots on the classic gate-1/2 locations — known flyable, ≥6 from the
// pad, ≥5 apart.
const SPOT_A = { x: 0, y: 6, z: -6 }
const SPOT_B = { x: -18, y: 10, z: -22 }
const { browser, context, page } = await launch()
await addDroneWidget(page)
const { gatesChip, telemetry, lapState } = readers(page)
const pilot = await createPilot(page, context)
const editor = page.locator('[data-testid="dronesim-editor"]')
const count = async () => parseInt(await editor.getAttribute('data-count'), 10)
const bannerText = () =>
  page
    .locator('[data-testid="dronesim-lap-banner"]')
    .textContent({ timeout: 1500 })
    .catch(() => '')

check('starts on the seeded course', (await rootState(page, 'data-course')) === 'seed')

// enter the editor from settings
await openSettings(page)
await page.locator('[data-testid="dronesim-edit-course"]').click()
await page.waitForTimeout(400)
check('editor opens (panel closed, toolbar up)', (await editor.count()) === 1 && (await rootState(page, 'data-editing')) === 'on')
check('draft starts empty on a seeded course', (await count()) === 0)

// dropping at the spawn pad is rejected
await page.locator('[data-testid="dronesim-drop-gate"]').click()
await page.waitForTimeout(300)
check('drop over the pad rejected', ((await bannerText()) ?? '').includes('TOO CLOSE TO THE PAD'))
check('count unchanged after rejection', (await count()) === 0)

// fly to spot A and drop
await pilot.touchStart()
await pilot.flyTo(SPOT_A, { maxForward: 0.5 })
await pilot.brake()
await pilot.touchEnd()
await page.locator('[data-testid="dronesim-drop-gate"]').click()
await page.waitForTimeout(200)
check('gate 1 dropped at spot A', (await count()) === 1)

// cruise to spot B and drop
await pilot.touchStart()
await pilot.flyTo({ x: SPOT_A.x, y: CRUISE_ALT, z: SPOT_A.z }, { maxForward: 0.3, tol: 2 })
await pilot.flyTo({ x: SPOT_B.x, y: CRUISE_ALT, z: SPOT_B.z }, { tol: 2 })
await pilot.brake()
await pilot.flyTo(SPOT_B, { maxForward: 0.4 })
await pilot.brake()
await pilot.touchEnd()
await page.locator('[data-testid="dronesim-drop-gate"]').click()
await page.waitForTimeout(200)
check('gate 2 dropped at spot B', (await count()) === 2)

// stacked drop rejected; a clear third drop + undo works
await page.locator('[data-testid="dronesim-drop-gate"]').click()
await page.waitForTimeout(300)
check('stacked drop rejected', ((await bannerText()) ?? '').includes('TOO CLOSE TO A GATE') && (await count()) === 2)
await pilot.touchStart()
await pilot.flyTo({ x: SPOT_B.x, y: 12, z: SPOT_B.z - 8 }, { maxForward: 0.4 })
await pilot.brake()
await pilot.touchEnd()
await page.locator('[data-testid="dronesim-drop-gate"]').click()
await page.waitForTimeout(200)
check('third gate dropped clear of the others', (await count()) === 3)
await page.screenshot({ path: `${ARTIFACTS_DIR}editor-draft.png` })
await page.locator('[data-testid="dronesim-edit-undo"]').click()
await page.waitForTimeout(200)
check('undo removes the last gate', (await count()) === 2)

// save (no best lap yet -> applies instantly)
await page.locator('[data-testid="dronesim-edit-save"]').click()
await page.waitForTimeout(500)
check('editor closes on save', (await rootState(page, 'data-editing')) === 'off')
check('course source is custom', (await rootState(page, 'data-course')) === 'custom')
check('chip shows GATE 1/2', (await gatesChip.textContent()).includes('GATE 1/2'))
const mapGates = await page
  .locator('[data-testid="dronesim-minimap"] circle[data-gate-state]')
  .evaluateAll((els) => els.map((el) => ({ x: +el.getAttribute('cx'), z: +el.getAttribute('cy') })))
check(
  'minimap gates sit at the dropped spots',
  mapGates.length === 2 &&
    Math.hypot(mapGates[0].x - SPOT_A.x, mapGates[0].z - SPOT_A.z) < 1.5 &&
    Math.hypot(mapGates[1].x - SPOT_B.x, mapGates[1].z - SPOT_B.z) < 1.5,
  JSON.stringify(mapGates),
)

// race the custom course against the EXACT saved rings: pre-drop telemetry
// estimates of position/heading drift under load and can miss the 2.1-unit
// pass radius, so read the persisted quadruples back instead.
await page.waitForTimeout(1600) // redux-persist debounce
const savedRings = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('persist:testsite'))
  const widgets = JSON.parse(raw.widgets)
  const inst = widgets.instances.find((i) => i.type === 'droneSim')
  return inst.data.customRings
})
check('saved rings persisted as two quadruples', Array.isArray(savedRings) && savedRings.length === 8, JSON.stringify(savedRings))
const gates = []
for (let i = 0; i < savedRings.length; i += 4) {
  gates.push({
    center: { x: savedRings[i], y: savedRings[i + 1], z: savedRings[i + 2] },
    normal: { x: Math.sin(savedRings[i + 3]), z: Math.cos(savedRings[i + 3]) },
  })
}
await pilot.touchStart()
await pilot.flyTo({ x: PAD.x, y: 10, z: PAD.z - 8 })
let from = { x: PAD.x, z: PAD.z - 8 }
for (let i = 0; i < gates.length; i++) {
  const g = gates[i]
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
  await pilot.flyTo({ x: from.x, y: CRUISE_ALT, z: from.z }, { maxForward: 0.3, tol: 2 })
  check(`custom gate ${i + 1}: cruise`, await pilot.flyTo({ x: entry.x, y: CRUISE_ALT, z: entry.z }))
  await pilot.brake()
  check(`custom gate ${i + 1}: entry`, await pilot.flyTo(entry, { maxForward: 0.5 }))
  await pilot.brake()
  check(`custom gate ${i + 1}: through`, await pilot.flyTo(exit, { maxForward: 0.5, tol: 1.5 }))
  from = { x: exit.x, z: exit.z }
}
await pilot.flyTo({ x: from.x, y: CRUISE_ALT, z: from.z }, { maxForward: 0.3, tol: 2 })
check('returned to the pad', await pilot.flyTo({ x: PAD.x, y: CRUISE_ALT, z: PAD.z }))
await page.waitForTimeout(400)
await pilot.touchEnd()
const done = await lapState()
check('custom lap completes and records a best', done.laps === 1 && done.bestMs > 5000 && done.status === 'ready', JSON.stringify(done))
const b1 = done.bestMs

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('custom course persists', (await rootState(page, 'data-course')) === 'custom' && (await gatesChip.textContent()).includes('GATE 1/2'))
check('best persists with it', (await lapState()).bestMs === b1)

// switch to seeded (best exists -> confirm), then back to custom (instant)
await openSettings(page)
await page.locator('[data-testid="dronesim-course-source"]').click()
await page.waitForTimeout(300)
const dialog = page.getByRole('dialog').filter({ hasText: 'Switch course?' })
check('switching with a best asks for confirmation', (await dialog.count()) === 1)
await dialog.getByRole('button', { name: 'Switch' }).click()
await page.waitForTimeout(400)
await closeSettings(page)
check('back on the seeded course, stats cleared', (await rootState(page, 'data-course')) === 'seed' && (await lapState()).bestMs === 0)
check('seeded chip back to GATE 1/3', (await gatesChip.textContent()).includes('GATE 1/3'))
await openSettings(page)
await page.locator('[data-testid="dronesim-course-source"]').click()
await page.waitForTimeout(400)
await closeSettings(page)
check('custom course preserved and re-activated', (await rootState(page, 'data-course')) === 'custom' && (await gatesChip.textContent()).includes('GATE 1/2'))

await finish(browser)
