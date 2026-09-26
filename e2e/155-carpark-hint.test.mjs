/**
 * Car Park hints: the Hint button shows the BFS-optimal next move (which
 * car, and where to) in both views, and a hinted solve earns ✓ but never
 * ★ or a best.
 *
 * Asserted through the contract: root `data-hint` ("vi:delta") and
 * `data-hints`, the 2D `data-hinted` vehicle and `carpark-hint-ghost`, and
 * the 3D probe's `data-hint`. The hint is checked against the bundled
 * solver, and following it every move must solve in exactly par.
 */
import { addCarParkWidget, dragVehicle, launch, reporter } from './helpers.mjs'
import { applyMove, parseBoard, solve } from './.bundle/carParkModel.js'
import { LEVELS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('car-park-hint')

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
const noBackdrop = () =>
  page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
/** Ask for a hint, confirming the first-hint dialog if it appears. */
const hintNow = async () => {
  await root.locator('[data-testid="carpark-hint"]').click()
  const dialog = page.getByRole('dialog', { name: 'Use a hint?' })
  await page.waitForTimeout(250)
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Show hint' }).click()
    await noBackdrop()
  }
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="carpark-root"]')?.dataset.hint ?? '') !== '',
    null,
    { timeout: 4000 },
  )
  return (await attr('data-hint')).split(':').map(Number)
}

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)

check('no hint showing at the start', (await attr('data-hint')) === '' && (await num('data-hints')) === 0)

// The first hint of an attempt asks first (it costs the ★); cancelling
// shows nothing and counts nothing.
{
  await root.locator('[data-testid="carpark-hint"]').click()
  const dialog = page.getByRole('dialog', { name: 'Use a hint?' })
  await dialog.waitFor({ timeout: 3000 })
  check('the first hint asks for confirmation', (await dialog.count()) === 1)
  await dialog.getByRole('button', { name: 'Keep trying' }).click()
  await noBackdrop()
  check('Keep trying shows no hint and counts nothing', (await attr('data-hint')) === '' && (await num('data-hints')) === 0)
}

// First hint = the solver's optimal first move (any optimal first move is
// fine, so check it leads to a position solvable in par − 1).
{
  const [vi, d] = await hintNow()
  const rest = solve(lot0, applyMove(lot0.start, [vi, d]))
  check('the hint is an optimal move', rest !== null && rest.length === L0.par - 1, `${vi}:${d}`)
  check('exactly one car is highlighted, the hinted one', (await page.locator('[data-hinted="1"]').count()) === 1 &&
    (await page.locator('[data-hinted="1"]').getAttribute('data-index')) === String(vi))
  check('a ghost marks the destination', (await page.locator('[data-testid="carpark-hint-ghost"]').count()) === 1)
  check('the hint is counted', (await num('data-hints')) === 1)
  await root.locator('[data-testid="carpark-hint"]').click()
  await page.waitForTimeout(200)
  check('asking again on the same position counts once', (await num('data-hints')) === 1)

  await dragVehicle(page, vi, d)
  await waitAttr('data-moves', 1)
  // Later hints in the same attempt: no prompt, the ★ is already gone.
  await root.locator('[data-testid="carpark-hint"]').click()
  await page.waitForTimeout(300)
  check('the second hint needs no confirmation',
    (await page.getByRole('dialog', { name: 'Use a hint?' }).count()) === 0 && (await attr('data-hint')) !== '')
  await dragVehicle(page, ...(await attr('data-hint')).split(':').map(Number))
  await waitAttr('data-moves', 2)
  check('making a move clears the hint', (await attr('data-hint')) === '' &&
    (await page.locator('[data-testid="carpark-hint-ghost"]').count()) === 0)
}

// Reset zeroes the hint count.
{
  await root.locator('[data-testid="carpark-reset"]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restart' }).click()
  await waitAttr('data-moves', 0)
  check('Reset zeroes the hint count', (await num('data-hints')) === 0)
  await noBackdrop()
  await root.locator('[data-testid="carpark-hint"]').click()
  const again = page.getByRole('dialog', { name: 'Use a hint?' })
  await again.waitFor({ timeout: 3000 })
  check('after Reset the first hint asks again', (await again.count()) === 1)
  await again.getByRole('button', { name: 'Keep trying' }).click()
  check('and back at the start no stale hint reappears', (await attr('data-hint')) === '')
  await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
}

// Follow Hint every move → solved in exactly par, ✓ but no ★ / best.
{
  let guard = 0
  while ((await attr('data-state')) === 'live' && guard++ < 20) {
    const moves = await num('data-moves')
    const [vi, d] = await hintNow()
    await dragVehicle(page, vi, d)
    await waitAttr('data-moves', moves + 1)
  }
  await waitAttr('data-state', 'won')
  check('following hints solves the level', (await attr('data-state')) === 'won')
  check('in exactly par moves', (await num('data-moves')) === L0.par)
  check('the hints were counted', (await num('data-hints')) === L0.par, String(await num('data-hints')))
  check('a hinted solve records no best', (await attr('data-best')) === '')
  const opt = await root.locator('[data-testid="carpark-level"] select option[value="0"]').textContent()
  check('the level is marked solved ✓, not ★', opt.includes('✓') && !opt.includes('★'), opt)
  check('the overlay credits the hints', (await page.locator('[data-testid="carpark-won"]').textContent()).includes('hint'))
  check('the Hint button is gone once won', (await root.locator('[data-testid="carpark-hint"]').count()) === 0)
}

// A clean replay of the same level still earns ★ over the ✓.
{
  await root.locator('[data-testid="carpark-reset"]').click()
  await waitAttr('data-moves', 0)
  const line = solve(lot0)
  for (let k = 0; k < line.length; k++) {
    await dragVehicle(page, ...line[k])
    await waitAttr('data-moves', k + 1)
  }
  await waitAttr('data-state', 'won')
  check('a clean solve then records best = par', (await num('data-best')) === L0.par)
  const opt = await root.locator('[data-testid="carpark-level"] select option[value="0"]').textContent()
  check('and upgrades the level to ★', opt.includes('★'), opt)
}

// 3D parity: the probe mirrors the hint.
{
  await root.locator('[data-testid="carpark-next"]').click()
  await waitAttr('data-level', 1)
  await root.locator('[data-testid="carpark-view-3d"]').click()
  await page.locator('[data-testid="carpark-3d"] canvas').waitFor({ timeout: 20000 })
  const [vi, d] = await hintNow()
  await page.waitForFunction(
    (want) => document.querySelector('[data-testid="carpark-3d"]')?.getAttribute('data-hint') === want,
    `${vi}:${d}`,
    { timeout: 10000 },
  )
  check('the 3D board shows the same hint', (await page.locator('[data-testid="carpark-3d"]').getAttribute('data-hint')) === `${vi}:${d}`)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.artifacts/155-hint-3d.png' }).catch(() => {})
}

await finish(browser)
