/**
 * Car Park records-slice suite: bests / stars / solve tallies live in the
 * app-level `records` slice, not in widget data — so they survive the widget
 * being DELETED and re-added (the round's point), are shared live by every
 * Car Park widget on the board, survive a reload, absorb legacy records a
 * pre-slice widget still carries in its data, and clear (all of them, on
 * every widget) through the confirm-guarded reset-records button.
 */
import { addCarParkWidget, dragVehicle, launch, reporter } from './helpers.mjs'
import { parseBoard, solve } from './.bundle/carParkModel.js'
import { LEVELS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('carpark-records')
const { browser, page } = await launch()
await addCarParkWidget(page)

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)
const roots = page.locator('[data-testid="carpark-root"]')
const A = roots.nth(0)
const attr = (root, name) => root.getAttribute(name)
const beginnerOption = (root) =>
  root.locator('[data-testid="carpark-tier"] option[value="beginner"]')
const waitRoot = (index, name, value, timeout = 5000) =>
  page
    .waitForFunction(
      ([i, n, v]) =>
        document.querySelectorAll('[data-testid="carpark-root"]')[i]?.dataset[n] === v,
      [index, name, value],
      { timeout },
    )
    .then(() => true, () => false)
/** Wait until the persisted `records` slice in localStorage satisfies `pred`
 * (stringified and evaluated in the page) — the debounce-proof reload gate. */
const waitStoredRecords = (pred) =>
  page
    .waitForFunction(
      (src) => {
        try {
          const raw = window.localStorage.getItem('persist:testsite')
          const cp = JSON.parse(JSON.parse(raw).records ?? '{}').carPark
          return cp ? new Function('cp', `return ${src}`)(cp) : false
        } catch {
          return false
        }
      },
      pred,
      { timeout: 6000 },
    )
    .then(() => true, () => false)

check('reset-records starts disabled (nothing to clear)',
  await A.locator('[data-testid="carpark-reset-records"]').isDisabled())

// Par-solve level 0 through real drags — the record lands in the slice.
{
  const line = solve(lot0)
  for (let k = 0; k < line.length; k++) {
    const [vi, d] = line[k]
    await dragVehicle(page, vi, d)
    await waitRoot(0, 'moves', String(k + 1))
  }
  check('level won at par', await waitRoot(0, 'state', 'won'))
  check('best recorded', (await attr(A, 'data-best')) === String(L0.par))
  check('solve tallied', (await attr(A, 'data-solved')) === '1')
  const opt = beginnerOption(A)
  check(
    'beginner progress reads 1 solved, 1 star',
    (await opt.getAttribute('data-solved')) === '1' &&
      (await opt.getAttribute('data-stars')) === '1',
  )
}

// THE POINT: delete the widget, add a fresh one — the records survive,
// because they never lived in the instance.
check('records flushed to storage', await waitStoredRecords('cp.solved === 1'))
await page.getByRole('button', { name: 'remove Car Park widget' }).click()
await page.waitForSelector('[data-testid="carpark-root"]', { state: 'detached' })
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Car Park/ }).click()
await A.waitFor()
await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, {
  timeout: 3000,
})
check(
  'best and star survive deleting and re-adding the widget',
  (await attr(A, 'data-best')) === String(L0.par) &&
    (await attr(A, 'data-solved')) === '1' &&
    (await beginnerOption(A).getAttribute('data-stars')) === '1',
)

// Reload: the slice is persisted on its own.
await page.reload({ waitUntil: 'networkidle' })
await A.waitFor()
check(
  'records survive a reload',
  (await attr(A, 'data-best')) === String(L0.par) && (await attr(A, 'data-solved')) === '1',
)

// A second Car Park widget shares the records live — same best, same star.
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Car Park/ }).click()
await roots.nth(1).waitFor()
await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, {
  timeout: 3000,
})
const B = roots.nth(1)
check(
  'a second widget shares the records',
  (await attr(B, 'data-best')) === String(L0.par) &&
    (await beginnerOption(B).getAttribute('data-stars')) === '1',
)

// Migration: a widget that still carries pre-slice records in its DATA (the
// old home) gets them absorbed on load — merged into the slice, then wiped
// from the instance so they are counted exactly once.
{
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('persist:testsite')
    const root = JSON.parse(raw)
    const widgets = JSON.parse(root.widgets)
    const inst = widgets.instances.find((w) => w.type === 'carPark')
    // Over-par best (99) so the migrated level earns ✓ but no new ★.
    inst.data = { ...inst.data, best: { 'beginner:1': 99 }, solved: 3, assisted: { 'beginner:2': true } }
    root.widgets = JSON.stringify(widgets)
    window.localStorage.setItem('persist:testsite', root ? JSON.stringify(root) : raw)
  })
  await page.reload({ waitUntil: 'networkidle' })
  await A.waitFor()
  check('migrated solve tally adds to the slice', await waitRoot(0, 'solved', '4'))
  const opt = beginnerOption(A)
  check(
    'migrated best and assisted count as solved, not starred',
    (await opt.getAttribute('data-solved')) === '3' &&
      (await opt.getAttribute('data-stars')) === '1',
  )
  // The absorb wiped the instance copy — storage shows empty legacy fields.
  const wiped = await page
    .waitForFunction(
      () => {
        try {
          const raw = window.localStorage.getItem('persist:testsite')
          const inst = JSON.parse(JSON.parse(raw).widgets).instances.find(
            (w) => w.type === 'carPark',
          )
          return (
            Object.keys(inst.data?.best ?? {}).length === 0 &&
            (inst.data?.solved ?? 0) === 0 &&
            Object.keys(inst.data?.assisted ?? {}).length === 0
          )
        } catch {
          return false
        }
      },
      null,
      { timeout: 6000 },
    )
    .then(() => true, () => false)
  check('legacy records wiped from the instance after the absorb', wiped)
}

// Reset records: confirm-guarded; cancel keeps everything, confirm clears
// every widget's view of them.
await A.locator('[data-testid="carpark-reset-records"]').click()
const dialog = page.getByRole('dialog', { name: 'Reset records?' })
await dialog.waitFor()
await dialog.getByRole('button', { name: 'Keep them' }).click()
await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, {
  timeout: 3000,
})
check('cancel keeps the records', (await attr(A, 'data-best')) === String(L0.par))
await A.locator('[data-testid="carpark-reset-records"]').click()
await dialog.waitFor()
await dialog.getByRole('button', { name: 'Reset records' }).click()
check('confirmed reset clears the best on both widgets',
  (await waitRoot(0, 'best', '')) && (await waitRoot(1, 'best', '')))
check(
  'progress and tally cleared',
  (await attr(A, 'data-solved')) === '0' &&
    (await beginnerOption(A).getAttribute('data-solved')) === '0' &&
    (await beginnerOption(B).getAttribute('data-stars')) === '0',
)
check('reset-records disabled again once empty',
  await A.locator('[data-testid="carpark-reset-records"]').isDisabled())

await finish(browser)
