/**
 * Car Park 3D polish: rotate camera, exit barrier + drive-off, headlights on
 * win, and 3D-by-default in fullscreen.
 *
 * All asserted through the DOM contract: root `data-yaw` / `data-view`, and
 * the 3D probe's `data-vehicles` tracks, `data-gate`, `data-lights` and
 * `data-drove-off`. Keyboard remap is checked against the probe itself:
 * the arrow key whose on-screen direction matches a vehicle's projected
 * track step must slide it +1 — whatever way the camera is turned.
 */
import { addCarParkWidget, dragVehicle3D, launch, reporter, vehicleOff3D } from './helpers.mjs'
import { moveRange, parseBoard, solve } from './.bundle/carParkModel.js'
import { LEVELS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('car-park-3d-polish')

const { browser, page } = await launch()
await addCarParkWidget(page)

const root = page.locator('[data-testid="carpark-root"]')
const wrap = page.locator('[data-testid="carpark-3d"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const waitAttr = (name, want, timeout = 6000) =>
  page.waitForFunction(
    ([n, w]) => document.querySelector('[data-testid="carpark-root"]')?.getAttribute(n) === String(w),
    [name, want],
    { timeout },
  )
/** Wait for a probe attribute (written every 10 frames). */
const waitProbe = (name, want, timeout = 10000) =>
  page.waitForFunction(
    ([n, w]) => document.querySelector('[data-testid="carpark-3d"]')?.getAttribute(n) === String(w),
    [name, want],
    { timeout },
  )
const tracks = async () => JSON.parse(await wrap.getAttribute('data-vehicles'))

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)

await root.locator('[data-testid="carpark-view-3d"]').click()
await wrap.locator('canvas').waitFor({ timeout: 20000 })
await page.waitForFunction(
  () => parseInt(document.querySelector('[data-testid="carpark-3d"]')?.dataset.frames ?? '0', 10) >= 30,
  null,
  { timeout: 20000 },
)

// ------------------------------------------------------------ rotate camera
check('the camera starts unrotated', (await num('data-yaw')) === 0)
const before = await tracks()
await root.locator('[data-testid="carpark-rotate"]').click()
await waitAttr('data-yaw', 1)
await page.waitForTimeout(1200) // let the quarter turn ease + the probe refresh
const after = await tracks()
check('Rotate steps the yaw', (await num('data-yaw')) === 1)
check(
  'and the camera actually turns (projected tracks move)',
  JSON.stringify(before.map((v) => v.track)) !== JSON.stringify(after.map((v) => v.track)),
)

let vi = -1
let range = null
for (let i = 1; i < lot0.vehicles.length && vi < 0; i++) {
  const r = moveRange(lot0, lot0.start, i)
  if (r.max >= 1) (vi = i), (range = r)
}
{
  await dragVehicle3D(page, vi, 1)
  await waitAttr('data-moves', 1)
  check('a 3D drag still works when rotated', (await vehicleOff3D(page, vi)) === lot0.start[vi] + 1)
  await root.locator('[data-testid="carpark-undo"]').click()
  await waitAttr('data-moves', 0)
}
{
  // The key that points along this car's +1 track step ON SCREEN.
  const t = (await tracks()).find((v) => v.i === vi).track
  const dx = t[1][0] - t[0][0]
  const dy = t[1][1] - t[0][1]
  const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp'
  await dragVehicle3D(page, vi, 0) // tap = select
  await page.keyboard.press(key)
  await waitAttr('data-moves', 1)
  check(`the on-screen key (${key}) slides it +1 when rotated`, (await vehicleOff3D(page, vi)) === lot0.start[vi] + 1)
  await root.locator('[data-testid="carpark-undo"]').click()
  await waitAttr('data-moves', 0)
}
// Three more turns wrap back to 0.
for (let k = 0; k < 3; k++) await root.locator('[data-testid="carpark-rotate"]').click()
await waitAttr('data-yaw', 0)
check('four turns wrap back to 0', (await num('data-yaw')) === 0)
check('range sanity', range.max >= 1)

// --------------------------------------------------- barrier + drive-off
{
  await waitProbe('data-gate', 'closed')
  check('the barrier starts down (exit row blocked)', (await wrap.getAttribute('data-gate')) === 'closed')
  check('headlights off before the win', (await wrap.getAttribute('data-lights')) === 'off')
  const line = solve(lot0)
  for (let k = 0; k < line.length - 1; k++) {
    const [v, d] = line[k]
    await dragVehicle3D(page, v, d)
    await waitAttr('data-moves', k + 1)
  }
  await waitProbe('data-gate', 'open')
  check('the barrier lifts once the path is clear', (await wrap.getAttribute('data-gate')) === 'open')
  check('not won yet', (await attr('data-state')) === 'live')
  const [v, d] = line[line.length - 1]
  await dragVehicle3D(page, v, d)
  await waitAttr('data-state', 'won')
  await waitProbe('data-lights', 'on')
  check('headlights come on for the drive-off', (await wrap.getAttribute('data-lights')) === 'on')
  check('Undo gives its footer slot to Next level once won', (await root.locator('[data-testid="carpark-undo"]').count()) === 0 && (await root.locator('[data-testid="carpark-next"]').count()) === 1)
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e/.artifacts/154-driveoff.png' }).catch(() => {})
  await waitProbe('data-drove-off', '1')
  check('the car drives off the lot', (await wrap.getAttribute('data-drove-off')) === '1')
}

// ------------------------------------------------ fullscreen default 3D
{
  await root.locator('[data-testid="carpark-view-2d"]').click()
  await waitAttr('data-view', '2d')
  await page.getByRole('button', { name: 'full screen Car Park widget' }).click()
  await waitAttr('data-view', '3d')
  check('fullscreen opens in 3D while the card is 2D', (await attr('data-view')) === '3d')
  await page.locator('.MuiDialog-root [data-testid="carpark-3d"] canvas').waitFor({ timeout: 20000 })
  check('the 3D board is in the fullscreen dialog', (await page.locator('.MuiDialog-root canvas').count()) === 1)

  await page.locator('.MuiDialog-root [data-testid="carpark-view-2d"]').click()
  await waitAttr('data-view', '2d')
  await page.getByRole('button', { name: 'Exit full screen' }).click()
  await page.waitForFunction(() => !document.querySelector('.MuiDialog-root'), null, { timeout: 5000 })
  check('the card stays 2D after fullscreen', (await attr('data-view')) === '2d')

  await page.getByRole('button', { name: 'full screen Car Park widget' }).click()
  await page.locator('.MuiDialog-root [data-testid="carpark-root"]').waitFor()
  await page.waitForTimeout(300)
  check('fullscreen remembers its own choice (2D)', (await attr('data-view')) === '2d')
  await page.getByRole('button', { name: 'Exit full screen' }).click()
}

await finish(browser)
