/**
 * Car Park 3D view: the persisted 2D/3D toggle and a FULLY PLAYABLE 3D board.
 *
 * The 3D board is a pure view over the widget's game state, so this suite
 * asserts the same root contract as `152-carpark` (moves, state, par) while
 * driving real 3D drags: the lazy chunk mounts a canvas that renders
 * (`data-frames` advances), `data-vehicles` mirrors every vehicle with its
 * screen-space track, an over-drag clamps and counts ONE move, Undo, a tap +
 * arrow key slides the selected car, the view survives a reload, the
 * solver's optimal line played through 3D drags wins, and toggling back to
 * 2D keeps the position.
 */
import { addCarParkWidget, dragVehicle3D, launch, reporter, vehicleOff3D } from './helpers.mjs'
import { moveRange, parseBoard, solve } from './.bundle/carParkModel.js'
import { LEVELS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('car-park-3d')

const { browser, page } = await launch()
await addCarParkWidget(page)

const root = page.locator('[data-testid="carpark-root"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const waitAttr = (name, want, timeout = 6000) =>
  page.waitForFunction(
    ([n, w]) => document.querySelector('[data-testid="carpark-root"]')?.getAttribute(n) === String(w),
    [name, want],
    { timeout },
  )

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)

check('defaults to the 2D board', (await attr('data-view')) === '2d')
check('with no canvas in 2D', (await root.locator('canvas').count()) === 0)

// Toggle → the lazy 3D chunk mounts and renders.
await root.locator('[data-testid="carpark-view-3d"]').click()
await waitAttr('data-view', '3d')
await page.locator('[data-testid="carpark-3d"] canvas').waitFor({ timeout: 20000 })
check('the toggle switches to 3D', (await attr('data-view')) === '3d')
check('one canvas mounts', (await root.locator('canvas').count()) === 1)
check('the 2D board is gone', (await root.locator('[data-testid="carpark-board"]').count()) === 0)
await page.waitForFunction(
  () => parseInt(document.querySelector('[data-testid="carpark-3d"]')?.dataset.frames ?? '0', 10) >= 30,
  null,
  { timeout: 20000 },
)
check(
  'frames are being produced',
  parseInt(await page.locator('[data-testid="carpark-3d"]').getAttribute('data-frames'), 10) >= 30,
)
{
  const list = JSON.parse(await page.locator('[data-testid="carpark-3d"]').getAttribute('data-vehicles'))
  check('every vehicle is mirrored with a screen track', list.length === lot0.vehicles.length && list.every((v) => v.track.length >= 3))
  check('the mirror agrees with the model', list.every((v) => v.off === lot0.start[v.i]))
}

// Over-drag in 3D clamps and counts one move; Undo restores.
{
  let vi = -1
  let range = null
  for (let i = 1; i < lot0.vehicles.length && vi < 0; i++) {
    const r = moveRange(lot0, lot0.start, i)
    if (r.max >= 1) (vi = i), (range = r)
  }
  await dragVehicle3D(page, vi, range.max + 2)
  await waitAttr('data-moves', 1)
  check('a 3D drag counts one move', (await num('data-moves')) === 1)
  const off = await vehicleOff3D(page, vi)
  check('and clamps to the free run', off === lot0.start[vi] + range.max, `${off}`)

  await root.locator('[data-testid="carpark-undo"]').click()
  await waitAttr('data-moves', 0)
  check('Undo restores the car in 3D', (await vehicleOff3D(page, vi)) === lot0.start[vi])

  // Tap selects (no move), then the arrow key slides it one bay.
  await dragVehicle3D(page, vi, 0)
  check('a tap is not a move', (await num('data-moves')) === 0)
  await page.keyboard.press(lot0.vehicles[vi].horiz ? 'ArrowRight' : 'ArrowDown')
  await waitAttr('data-moves', 1)
  check('tap + arrow key slides the selected car', (await vehicleOff3D(page, vi)) === lot0.start[vi] + 1)
  await root.locator('[data-testid="carpark-undo"]').click()
  await waitAttr('data-moves', 0)
}

// The view persists across a reload.
{
  await page.waitForFunction(() => {
    try {
      const raw = window.localStorage.getItem('persist:testsite')
      return JSON.parse(JSON.parse(raw).widgets ?? '{}').instances?.some(
        (w) => w.type === 'carPark' && w.data?.view === '3d' && (w.data?.moves ?? []).length === 0,
      )
    } catch {
      return false
    }
  }, null, { timeout: 5000 })
  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  check('the 3D view survives a reload', (await attr('data-view')) === '3d')
  await page.locator('[data-testid="carpark-3d"] canvas').waitFor({ timeout: 20000 })
}

// Win through 3D drags.
{
  const line = solve(lot0)
  for (let k = 0; k < line.length; k++) {
    const [vi, d] = line[k]
    await dragVehicle3D(page, vi, d)
    await waitAttr('data-moves', k + 1)
  }
  await waitAttr('data-state', 'won')
  check('the optimal line wins in 3D', (await attr('data-state')) === 'won')
  check('at par', (await num('data-moves')) === L0.par && (await num('data-best')) === L0.par)
  check('the celebration is up over the 3D board', (await page.locator('[data-testid="carpark-won"]').count()) === 1)
}

await page.waitForTimeout(1200)
await page.screenshot({ path: 'e2e/.artifacts/153-carpark-3d.png' }).catch(() => {})

// Back to 2D keeps the position.
{
  await root.locator('[data-testid="carpark-view-2d"]').click()
  await waitAttr('data-view', '2d')
  check('toggling back shows the 2D board', (await root.locator('[data-testid="carpark-board"]').count()) === 1)
  check('and drops the canvas', (await root.locator('canvas').count()) === 0)
  check('with the game intact', (await attr('data-state')) === 'won' && (await num('data-moves')) === L0.par)
}

await finish(browser)
