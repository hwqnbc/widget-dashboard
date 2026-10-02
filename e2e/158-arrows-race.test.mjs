/**
 * Arrow Escape's 2 Devices clear race — the netplay layer's THIRD
 * non-turn-based consumer (after the maze ghost race and the Car Park race),
 * and deliberately its most boring: it reuses the existing
 * `sync`/`go`/`pos`/`done` messages verbatim (`pos.cell` carries "arrows
 * left"), so there is no protocol change to prove — what this suite pins is
 * the widget's race seam.
 *
 * Two widgets in ONE document over `?netloop=1` (the shared `pairLoopback`),
 * driven by coordinate taps: the host's puzzle syncing to the guest (seed AND
 * size — the host reshuffles before pairing so the two genuinely differ), a
 * synchronised countdown with a dead board, progress relaying into the
 * opponent badge, first-clear-wins with the loser free to keep tapping, the
 * mid-race link-death `void`, and link release on leaving the mode.
 */
import { addArrowsWidget, launch, pairLoopback, reporter, tapArrowCell } from './helpers.mjs'
import { ARROW_DIMS } from './.bundle/arrowsModel.js'

const { check, finish } = reporter('arrows-race')
const { browser, page } = await launch()
await addArrowsWidget(page, 2)

const roots = page.locator('[data-testid="arrows-root"]')
check('two Arrow Escape widgets on the board', (await roots.count()) === 2)

const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const num = async (w, name) => parseInt(await attr(w, name), 10)
const until = (index, name, value, timeout = 8000) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="arrows-root"]')[i]?.dataset[n] === v,
    [index, name, value],
    { timeout },
  )
/** The alive arrows of ONE widget, straight off its DOM contract. */
const arrowsOf = (index) =>
  page.$$eval(
    '[data-testid="arrows-root"]',
    (els, i) =>
      [...els[i].querySelectorAll('g[data-arrow]')].map((el) => ({
        blocked: el.dataset.blocked === '1',
        head: el.dataset.head.split(',').map(Number),
      })),
    index,
  )

check('the race is off outside the mode', (await attr(A, 'data-race')) === 'off')

// The host reshuffles to SMALL before pairing, so the guest (still on the
// default medium board) demonstrably adopts both seed and size on sync.
await A.locator('[data-testid="arrows-size-small"]').click()
await until(0, 'size', 'small')
const hostSeed = await attr(A, 'data-seed')
check('the two boards differ before pairing', (await attr(B, 'data-seed')) !== hostSeed)

await pairLoopback(page, { host: A, guest: B, modeTestId: 'arrows-mode-online' })
check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')

// The host's puzzle wins: seed AND size land on the guest.
await page.waitForFunction(
  (want) =>
    document.querySelectorAll('[data-testid="arrows-root"]')[1]?.dataset.seed === want,
  hostSeed,
  { timeout: 5000 },
)
check("the guest adopted the host's seed", (await attr(B, 'data-seed')) === hostSeed)
check("and the host's size", (await attr(B, 'data-size')) === 'small')
check('so both boards hold the same puzzle', (await num(B, 'data-total')) === (await num(A, 'data-total')))
check(
  "the guest's own controls stand down",
  (await B.locator('[data-testid="arrows-new"]').count()) === 0 &&
    (await B.locator('[data-testid="arrows-size-small"]').count()) === 0,
)

const dims = ARROW_DIMS.small
const total = await num(A, 'data-total')

// ------------------------------------------------------------- the start
await A.locator('[data-testid="arrows-start-race"]').click()
await until(1, 'race', 'counting')
check('both devices count down together', (await attr(A, 'data-race')) === 'counting')
check(
  'the countdown overlay is up on both',
  (await page.locator('[data-testid="arrows-countdown"]').count()) === 2,
)

// The board is dead until GO — taps must change nothing.
{
  const free = (await arrowsOf(0)).find((a) => !a.blocked)
  await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows, 0)
  await page.waitForTimeout(200)
  check('taps are inert during the countdown', (await num(A, 'data-left')) === total)
}

await until(0, 'race', 'running')
await until(1, 'race', 'running')
check('both unlock together', (await attr(B, 'data-race')) === 'running')
check(
  'both start on the full board with clean counters',
  (await num(A, 'data-left')) === total && (await num(A, 'data-taps')) === 0,
)

// ------------------------------------------------------------ the relay
{
  const free = (await arrowsOf(0)).find((a) => !a.blocked)
  await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows, 0)
  await page.waitForFunction(
    (want) =>
      document.querySelectorAll('[data-testid="arrows-root"]')[1]?.dataset.oppLeft ===
      String(want),
    total - 1,
    { timeout: 8000 },
  )
  check("the host's clear lands in the guest's opponent badge", (await num(B, 'data-opp-left')) === total - 1)
}

// ------------------------------------------------------------ the finish
// Closed-loop full clear on the HOST, driven by its own data-blocked flags.
{
  let guard = 0
  while ((await num(A, 'data-left')) > 0 && guard++ < 20) {
    const free = (await arrowsOf(0)).find((a) => !a.blocked)
    if (!free) break
    const before = await num(A, 'data-left')
    await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows, 0)
    await page.waitForFunction(
      (want) =>
        document.querySelectorAll('[data-testid="arrows-root"]')[0]?.dataset.left ===
        String(want),
      before - 1,
      { timeout: 8000 },
    )
  }
  await until(0, 'race', 'won')
  await until(1, 'race', 'lost')
  check('the finisher wins the race', (await attr(A, 'data-race')) === 'won')
  check('the other device is told it lost', (await attr(B, 'data-race')) === 'lost')
}

// The loser may still clear their own board.
{
  const free = (await arrowsOf(1)).find((a) => !a.blocked)
  const before = await num(B, 'data-left')
  await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows, 1)
  await page.waitForFunction(
    (want) =>
      document.querySelectorAll('[data-testid="arrows-root"]')[1]?.dataset.left === String(want),
    before - 1,
    { timeout: 8000 },
  )
  check('the loser may keep clearing', (await num(B, 'data-left')) === before - 1)
}

// -------------------------------------------------- a link that dies
// Rematch, then the guest walks away mid-race (confirm-guarded): the
// survivor's race voids instead of running forever — the same sticky-void
// contract the maze and Car Park races carry.
await A.locator('[data-testid="arrows-start-race"]').click()
await until(0, 'race', 'running')
await until(1, 'race', 'running')

await B.locator('[data-testid="arrows-mode-online"]').click()
await page.waitForSelector('.MuiDialog-root')
check('leaving mid-race asks first', (await attr(B, 'data-mode')) === 'online')
await page.getByRole('button', { name: 'Leave' }).click()

await until(0, 'race', 'void')
check('a dead link voids the live race', (await attr(A, 'data-race')) === 'void')
check(
  'the overlay names the lost connection',
  (await A.locator('[data-testid="arrows-race-void"]').count()) === 1,
)
check(
  'no Start race until re-paired',
  (await A.locator('[data-testid="arrows-start-race"]').count()) === 0,
)
check(
  "the survivor's chip reads lost, not never-paired",
  (await A.locator('[data-testid="arrows-link"]').getAttribute('data-status')) === 'closed',
)

// ----------------------------------------------------------- housekeeping
await A.locator('[data-testid="arrows-mode-online"]').click()
await page.waitForTimeout(300)
check('leaving the mode releases the link', (await attr(A, 'data-net')) === 'off')
check('and clears the race', (await attr(A, 'data-race')) === 'off')

await finish(browser)
