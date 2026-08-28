/**
 * Maze Runner's two-device ghost race — the netplay layer's first consumer
 * that is NOT turn-based.
 *
 * Connect 4 and Tic-Tac-Toe alternate turns over one shared board, and share
 * `useNetGame` for it. A race has no turns and no shared board: two runners
 * move at once on their own copies of the same maze, each seeing a marker for
 * the other. So the maze sits directly on `useNetplay` and speaks three
 * messages the turn-based games never send — `go`, `pos`, `done`.
 *
 * What this suite pins down is that seam: the host's setup reaching the guest,
 * a synchronised start, positions relaying live, and a winner decided by
 * whoever finishes first.
 *
 * Every wait is on a `data-race` transition rather than a sleep — the
 * countdown is exactly the kind of timed UI that a fixed wait races
 * (lessons 103-104).
 */
import { addMazeWidgets, launch, pairLoopback, reporter, swipeMaze } from './helpers.mjs'
import { generateMaze, pathToDirs, solve } from './.bundle/mazeModel.js'

const { check, finish } = reporter('maze-race')
const { browser, context, page } = await launch()
await addMazeWidgets(page, 2)

const roots = page.locator('[data-testid="maze-root"]')
check('two Maze Runner widgets on the board', (await roots.count()) === 2)

const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const num = async (w, name) => parseInt(await attr(w, name), 10)
/** Wait for one widget's attribute to reach a value. */
const until = (index, name, value, timeout = 15000) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="maze-root"]')[i]?.dataset[n] === v,
    [index, name, value],
    { timeout },
  )

check('race is off outside the mode', (await attr(A, 'data-race')) === 'off')

// Corridor-following before pairing, so the host's sync carries it to the
// guest and the solution walk below is a handful of swipes rather than ~90.
await A.locator('[data-testid="maze-rule-junction"]').click()
await page.waitForTimeout(150)

await pairLoopback(page, { host: A, guest: B, modeTestId: 'maze-mode-online' })
check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')
check('both are idle before the start', (await attr(A, 'data-race')) === 'idle')

// The host's setup crosses the link, so both devices race the SAME maze —
// otherwise a ghost's cell index would mean nothing on the other's board.
await page.waitForFunction(
  () => {
    const [a, b] = document.querySelectorAll('[data-testid="maze-root"]')
    return a && b && a.dataset.seed === b.dataset.seed && b.dataset.cols !== '0'
  },
  null,
  { timeout: 5000 },
)
check('the guest adopted the host\'s maze', (await num(B, 'data-seed')) === (await num(A, 'data-seed')))
check(
  'and its dimensions',
  (await num(B, 'data-cols')) === (await num(A, 'data-cols')) &&
    (await num(B, 'data-rows')) === (await num(A, 'data-rows')),
)
check("and the host's move rule", (await attr(B, 'data-rule')) === 'junction')

const maze = generateMaze(await num(A, 'data-seed'), await num(A, 'data-cols'), await num(A, 'data-rows'))
const KEY = { n: 'ArrowUp', e: 'ArrowRight', s: 'ArrowDown', w: 'ArrowLeft' }

// ------------------------------------------------------------- the start

await A.locator('[data-testid="maze-start-race"]').click()
await until(1, 'race', 'counting')
check('both devices count down together', (await attr(A, 'data-race')) === 'counting')
check('the countdown overlay is up', (await page.locator('[data-testid="maze-countdown"]').count()) === 2)

// The board is dead until GO — the whole point of a synchronised start.
const beforeGo = await num(A, 'data-pos')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowRight')
check('keys are inert during the countdown', (await num(A, 'data-pos')) === beforeGo)

await until(0, 'race', 'running')
await until(1, 'race', 'running')
check('both unlock together', (await attr(B, 'data-race')) === 'running')
check('the countdown overlay is gone', (await page.locator('[data-testid="maze-countdown"]').count()) === 0)
check('both start at the maze entrance', (await num(A, 'data-pos')) === maze.start)

// -------------------------------------------------------------- the ghost

// Swipes, not keys: every maze's key handler is on `window`, so an arrow key
// moves BOTH runners on this page and the ghost would sit exactly on top of
// the local marker. A swipe lands on one board.
const step = async (index) => {
  const w = index === 0 ? A : B
  const at = await num(w, 'data-pos')
  const dir = pathToDirs(maze, solve(maze, at, maze.goal))[0]
  if (!dir) return false
  await swipeMaze(page, context, dir, { index })
  await page.waitForFunction(
    ([i, was]) =>
      document.querySelectorAll('[data-testid="maze-root"]')[i]?.dataset.pos !== String(was),
    [index, at],
    { timeout: 5000 },
  )
  return true
}

await step(0)
check('only the swiped runner moved', (await num(B, 'data-pos')) === maze.start)
await page.waitForFunction(
  () => {
    const [a, b] = document.querySelectorAll('[data-testid="maze-root"]')
    return a && b && b.dataset.ghost === a.dataset.pos
  },
  null,
  { timeout: 5000 },
)
check("the guest's ghost tracks the host", (await num(B, 'data-ghost')) === (await num(A, 'data-pos')))
check('the guest draws a ghost marker', (await B.locator('[data-testid="maze-ghost"]').count()) === 1)

// ------------------------------------------------------------- the finish

let guard = 0
while ((await num(A, 'data-pos')) !== maze.goal && guard++ < 100) {
  if (!(await step(0))) break
}
check('the walk converged', guard < 100)

await until(0, 'race', 'won')
await until(1, 'race', 'lost')
check('the finisher won', (await attr(A, 'data-race')) === 'won')
check('the other device was told it lost', (await attr(B, 'data-race')) === 'lost')
check(
  'the winner recorded a time',
  parseInt(await page.locator('[data-testid="maze-timer"]').first().getAttribute('data-ms'), 10) > 0,
)
check('the loser may still finish its run', (await attr(B, 'data-state')) !== 'won')

// ----------------------------------------------------------- housekeeping

// A finished run counts as in-progress, so the mode change is confirm-guarded
// like every other destructive setting change.
await A.locator('[data-testid="maze-mode-solo"]').click()
await page.waitForSelector('.MuiDialog-root')
check('leaving mid-race asks first', (await attr(A, 'data-mode')) === 'online')
await page.getByRole('button', { name: 'Restart' }).click()
await page.waitForTimeout(300)
check('leaving the mode releases the link', (await attr(A, 'data-net')) === 'off')
check('and clears the race', (await attr(A, 'data-race')) === 'off')

await finish(browser)
