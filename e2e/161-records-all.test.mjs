/**
 * Records-slice migration for every remaining game: Maze Runner's per-size
 * best times, Arrow Escape's clear tally, Drone Sim's landing best, Drone
 * Strike's and Tank Battle's bests all live in the app-level `records`
 * slice. Light widgets run live (absorb from seeded legacy data, survival
 * across widget deletion, the confirm-guarded reset buttons); the three
 * WebGL games are absorbed by their NON-WebGL shells, asserted through
 * localStorage, plus Tank's settings-panel Reset-records row exercised
 * live. Also pins the autoMergeLevel1 guard: the seeded stored `records`
 * holds ONLY `carPark`, so every namespace exercised here rehydrated as
 * undefined first.
 */
import { addArrowsWidget, addMazeWidget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('records-all')
const { browser, page } = await launch()

/** Rewrite persist:testsite in-page: seed legacy record fields into the
 * FIRST widget instance of `type`, and strip `records` down to carPark only
 * (as a device that stored the slice before this round would have it). */
const seedLegacy = (type, data) =>
  page.evaluate(
    ([wtype, extra]) => {
      const raw = window.localStorage.getItem('persist:testsite')
      const root = JSON.parse(raw)
      const widgets = JSON.parse(root.widgets)
      const inst = widgets.instances.find((w) => w.type === wtype)
      inst.data = { ...inst.data, ...extra }
      root.widgets = JSON.stringify(widgets)
      if (root.records) {
        const rec = JSON.parse(root.records)
        root.records = JSON.stringify({ carPark: rec.carPark ?? { best: {}, solved: 0, assisted: {} } })
      }
      window.localStorage.setItem('persist:testsite', JSON.stringify(root))
    },
    [type, data],
  )

/** Poll the stored records slice until `pred` (source text, gets `rec`). */
const storedRecords = (pred, timeout = 8000) =>
  page
    .waitForFunction(
      (src) => {
        try {
          const raw = window.localStorage.getItem('persist:testsite')
          const rec = JSON.parse(JSON.parse(raw).records ?? '{}')
          return new Function('rec', `return ${src}`)(rec)
        } catch {
          return false
        }
      },
      pred,
      { timeout },
    )
    .then(() => true, () => false)

/** Poll until the first instance of `type` has `field` zeroed in storage. */
const legacyWiped = (type, fields) =>
  page
    .waitForFunction(
      ([wtype, fs]) => {
        try {
          const raw = window.localStorage.getItem('persist:testsite')
          const inst = JSON.parse(JSON.parse(raw).widgets).instances.find((w) => w.type === wtype)
          return fs.every((f) => !inst.data?.[f])
        } catch {
          return false
        }
      },
      [type, fields],
      { timeout: 8000 },
    )
    .then(() => true, () => false)

// ---------------------------------------------------------------- Maze (live)
await addMazeWidget(page)
const mazeTimer = page.locator('[data-testid="maze-timer"]')
check('maze starts with no best', (await mazeTimer.getAttribute('data-best-ms')) === '0')
check(
  'maze reset-records disabled while empty',
  await page.locator('[data-testid="maze-reset-records"]').isDisabled(),
)
// Seed a pre-slice best and reload: the widget absorbs it into the slice.
await seedLegacy('mazeRunner', { bestMedium: 51234 })
await page.reload({ waitUntil: 'networkidle' })
await mazeTimer.waitFor()
check(
  'legacy maze best absorbed and shown',
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid="maze-timer"]')?.dataset.bestMs === '51234',
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)
check('maze slice holds the best', await storedRecords('rec.maze && rec.maze.best.medium === 51234'))
check('maze legacy fields wiped', await legacyWiped('mazeRunner', ['bestSmall', 'bestMedium', 'bestLarge']))

// THE POINT: the best survives deleting and re-adding the widget.
await page.getByRole('button', { name: 'remove Maze Runner widget' }).click()
await page.waitForSelector('[data-testid="maze-board"]', { state: 'detached' })
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Maze Runner/ }).click()
await page.waitForSelector('[data-testid="maze-board"]')
await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
check(
  'maze best survives deleting and re-adding the widget',
  (await mazeTimer.getAttribute('data-best-ms')) === '51234',
)
// Reset records: cancel keeps, confirm clears.
await page.locator('[data-testid="maze-reset-records"]').click()
const mazeDialog = page.getByRole('dialog', { name: 'Reset records?' })
await mazeDialog.waitFor()
await mazeDialog.getByRole('button', { name: 'Keep them' }).click()
await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
check('cancel keeps the maze best', (await mazeTimer.getAttribute('data-best-ms')) === '51234')
await page.locator('[data-testid="maze-reset-records"]').click()
await mazeDialog.waitFor()
await mazeDialog.getByRole('button', { name: 'Reset records' }).click()
check(
  'confirmed reset clears the maze best',
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid="maze-timer"]')?.dataset.bestMs === '0',
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)

// -------------------------------------------------------------- Arrows (live)
await addArrowsWidget(page)
const arrowsRoot = page.locator('[data-testid="arrows-root"]').first()
check('arrows starts unsolved', (await arrowsRoot.getAttribute('data-solved')) === '0')
// Seed a pre-slice tally; the absorb is ADDITIVE, so this also pins the
// StrictMode latch: exactly +7, not +14.
await seedLegacy('arrowEscape', { solved: 7 })
await page.reload({ waitUntil: 'networkidle' })
await arrowsRoot.waitFor()
check(
  'legacy arrows tally absorbed exactly once (StrictMode latch)',
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid="arrows-root"]')?.dataset.solved === '7',
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)
check('arrows legacy field wiped', await legacyWiped('arrowEscape', ['solved']))
await arrowsRoot.locator('[data-testid="arrows-reset-records"]').click()
const arrowsDialog = page.getByRole('dialog', { name: 'Reset records?' })
await arrowsDialog.waitFor()
await arrowsDialog.getByRole('button', { name: 'Reset records' }).click()
check(
  'arrows reset clears the tally',
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid="arrows-root"]')?.dataset.solved === '0',
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)

// ------------------------------------------- WebGL games (shell absorbs only)
// The absorb runs in each game's non-WebGL shell, so seeding legacy data and
// adding the widget is enough — the records land in storage without touching
// the canvas. One at a time keeps the page light.
const SHELL_GAMES = [
  {
    menu: /Drone Sim/,
    type: 'droneSim',
    legacy: { landingBest: 77 },
    remove: 'Drone Sim',
    pred: 'rec.droneSim && rec.droneSim.landingBest === 77',
    fields: ['landingBest'],
  },
  {
    menu: /Drone Strike/,
    type: 'droneStrike',
    legacy: { bestWave: 6, bestScore: 1234 },
    remove: 'Drone Strike',
    pred: 'rec.droneStrike && rec.droneStrike.bestWave === 6 && rec.droneStrike.bestScore === 1234',
    fields: ['bestWave', 'bestScore'],
  },
  {
    menu: /Tank Battle/,
    type: 'tankBattle',
    legacy: { bestWave: 4, bestScore: 900, bestRoamMs: 65432 },
    pred:
      'rec.tankBattle && rec.tankBattle.bestWave === 4 && rec.tankBattle.bestScore === 900 && rec.tankBattle.bestRoamMs === 65432',
    fields: ['bestWave', 'bestScore', 'bestRoamMs'],
  },
]
for (const g of SHELL_GAMES) {
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: g.menu }).click()
  // Wait for the MENU itself to close, not for every backdrop: Tank Battle
  // opens its first-run help dialog on mount, whose backdrop is legitimate.
  await page.waitForSelector('[role="menu"]', { state: 'detached', timeout: 10000 })
  // Let the fresh instance persist, then seed its legacy fields and reload.
  await page.waitForFunction(
    (wtype) => {
      try {
        const raw = window.localStorage.getItem('persist:testsite')
        return JSON.parse(JSON.parse(raw).widgets).instances.some((w) => w.type === wtype)
      } catch {
        return false
      }
    },
    g.type,
    { timeout: 8000 },
  )
  await seedLegacy(g.type, g.legacy)
  await page.reload({ waitUntil: 'networkidle' })
  check(`${g.type} legacy records absorbed by the shell`, await storedRecords(g.pred))
  check(`${g.type} legacy fields wiped`, await legacyWiped(g.type, g.fields))
  // Keep the page light: drop each WebGL widget once checked (Tank stays —
  // its settings panel is exercised below).
  if (g.remove) {
    await page.getByRole('button', { name: `remove ${g.remove} widget` }).click()
    await page.waitForTimeout(300)
  }
}

// Tank's settings-panel Reset-records row, live (the canvas is already up).
await page.waitForSelector('[data-testid="tank-settings"]', { timeout: 60000 })
// Dismiss the first-run "How to play" overlay (suite 114 covers it).
await page.waitForTimeout(400)
const helpClose = page.locator('[data-testid="tank-help-close"]')
if (await helpClose.isVisible().catch(() => false)) {
  await helpClose.click()
  await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 5000 })
}
await page.locator('[data-testid="tank-settings"]').click()
const tankReset = page.locator('[data-testid="tank-reset-records"]')
await tankReset.waitFor()
check('tank Reset-records row enabled with records present', !(await tankReset.isDisabled()))
await tankReset.click()
const tankDialog = page.getByRole('dialog', { name: 'Reset records?' })
await tankDialog.waitFor()
await tankDialog.getByRole('button', { name: 'Reset records' }).click()
check(
  'tank reset clears the slice',
  await storedRecords(
    'rec.tankBattle && rec.tankBattle.bestWave === 0 && rec.tankBattle.bestScore === 0 && rec.tankBattle.bestRoamMs === 0',
  ),
)
check('tank Reset-records row disables once empty', await tankReset.isDisabled())

await finish(browser)
