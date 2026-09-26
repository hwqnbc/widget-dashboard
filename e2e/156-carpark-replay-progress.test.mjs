/**
 * Car Park: solution replay (after a win, and the confirm-guarded "Show
 * solution" give-up) and per-tier progress in the difficulty dropdown.
 *
 * Contract: root `data-replay` ("step/total" while playing, else empty),
 * the 2D vehicles' `data-row`/`data-col` (which show the REPLAY position
 * while it plays), `carpark-replay` / `carpark-solution` /
 * `carpark-replay-stop`, and the tier options' text + `data-solved` /
 * `data-stars`.
 */
import { addCarParkWidget, dragVehicle, launch, reporter } from './helpers.mjs'
import { parseBoard, solve } from './.bundle/carParkModel.js'
import { LEVELS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('car-park-replay-progress')

const { browser, page } = await launch()
await addCarParkWidget(page)

const root = page.locator('[data-testid="carpark-root"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const waitAttr = (name, want, timeout = 8000) =>
  page.waitForFunction(
    ([n, w]) => document.querySelector('[data-testid="carpark-root"]')?.getAttribute(n) === String(w),
    [name, want],
    { timeout },
  )
const noBackdrop = () =>
  page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
const tierOption = (t) => root.locator(`[data-testid="carpark-tier"] select option[value="${t}"]`)
const target = () =>
  page.$eval('[data-testid="carpark-board"] [data-target="1"]', (el) => parseInt(el.dataset.col, 10))

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)
const line0 = solve(lot0)

// ---------------------------------------------------------- progress (fresh)
{
  const t = await tierOption('beginner').textContent()
  check('the tier shows 0/10 before any solve', t.includes('0/10') && !t.includes('★'), t)
  check('with data-solved/data-stars = 0', (await tierOption('beginner').getAttribute('data-solved')) === '0' &&
    (await tierOption('beginner').getAttribute('data-stars')) === '0')
}

// ------------------------------------------------------ give-up (mid attempt)
{
  await dragVehicle(page, ...line0[0])
  await waitAttr('data-moves', 1)
  await root.locator('[data-testid="carpark-solution"]').click()
  const dialog = page.getByRole('dialog', { name: 'Show the solution?' })
  await dialog.waitFor({ timeout: 3000 })
  check('Show solution asks first', (await dialog.count()) === 1)
  await dialog.getByRole('button', { name: 'Keep trying' }).click()
  await noBackdrop()
  check('Keep trying changes nothing', (await attr('data-replay')) === '' && (await num('data-moves')) === 1)

  await root.locator('[data-testid="carpark-solution"]').click()
  await page.getByRole('dialog', { name: 'Show the solution?' }).getByRole('button', { name: 'Show me' }).click()
  await noBackdrop()
  const total = line0.length - 1 // from the current (one-move-in) position
  await waitAttr('data-replay', `0/${total}`)
  check('the solution plays from where you are', (await attr('data-replay')) === `0/${total}`)
  await waitAttr('data-replay', `${total}/${total}`)
  check('the replay shows the red car at the exit', (await target()) === 4)
  check('the persisted game is untouched mid-replay', (await num('data-moves')) === 1)
  await waitAttr('data-replay', '')
  check('after a give-up the attempt restarts', (await num('data-moves')) === 0 && (await attr('data-state')) === 'live')
  check('and it is not counted as solved', (await attr('data-best')) === '' && (await num('data-solved')) === 0)
  check('the board is back at the level start', (await target()) === lot0.start[0])
}

// --------------------------------------------------------- win, then replay
{
  for (let k = 0; k < line0.length; k++) {
    await dragVehicle(page, ...line0[k])
    await waitAttr('data-moves', k + 1)
  }
  await waitAttr('data-state', 'won')
  const t = await tierOption('beginner').textContent()
  check('progress counts the solve and the star', t.includes('1/10') && t.includes('★1'), t)

  await root.locator('[data-testid="carpark-replay"]').click()
  await waitAttr('data-replay', `0/${line0.length}`)
  check('Replay plays the optimal line from the start', (await attr('data-replay')) === `0/${line0.length}`)
  check('the win overlay steps aside during the replay', (await page.locator('[data-testid="carpark-won"]').count()) === 0)
  check('the board shows the level start', (await target()) === lot0.start[0])
  await waitAttr('data-replay', `2/${line0.length}`)
  check('it advances move by move', (await attr('data-replay')) === `2/${line0.length}`)
  await root.locator('[data-testid="carpark-replay-stop"]').click()
  await waitAttr('data-replay', '')
  check('Stop ends a win replay and the level stays won', (await attr('data-state')) === 'won' &&
    (await num('data-moves')) === L0.par && (await num('data-best')) === L0.par)
  check('the celebration returns', (await page.locator('[data-testid="carpark-won"]').count()) === 1)
}

// ----------------------------------------- hinted solve counts, but no star
{
  await root.locator('[data-testid="carpark-next"]').click()
  await waitAttr('data-level', 1)
  const lot1 = parseBoard(LEVELS.beginner[1].board)
  // One hint (confirm), then finish with the solver's line.
  await root.locator('[data-testid="carpark-hint"]').click()
  await page.getByRole('dialog', { name: 'Use a hint?' }).getByRole('button', { name: 'Show hint' }).click()
  await noBackdrop()
  const line1 = solve(lot1)
  for (let k = 0; k < line1.length; k++) {
    await dragVehicle(page, ...line1[k])
    await waitAttr('data-moves', k + 1)
  }
  await waitAttr('data-state', 'won')
  const t = await tierOption('beginner').textContent()
  check('a hinted solve counts toward solved but not stars', t.includes('2/10') && t.includes('★1'), t)
  check('data-solved / data-stars agree', (await tierOption('beginner').getAttribute('data-solved')) === '2' &&
    (await tierOption('beginner').getAttribute('data-stars')) === '1')
  const other = await tierOption('expert').textContent()
  check('other tiers are independent', other.includes('0/10'), other)
}

await finish(browser)
