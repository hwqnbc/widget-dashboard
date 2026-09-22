/**
 * Arrow Escape: the tap-the-arrows-out untangle puzzle.
 *
 * Pure half, against the bundled `arrowsModel`: generation is deterministic,
 * seats non-overlapping in-bounds snakes, and — the load-bearing claim —
 * every generated puzzle is SOLVABLE, swept across 200 seeds per size. The
 * greedy `solveOrder` is complete for this game (removing an arrow only ever
 * clears cells, so removability is monotone), which is what makes the sweep
 * a real proof rather than a spot check. Plus the blocking rules on crafted
 * boards: nearest-blocker identification, and a bent snake whose own tail
 * loops onto its exit ray NOT blocking itself (the body rides the rails).
 *
 * Live half: the widget's `data-*` contract — totals, tapping an unblocked
 * arrow slides it out (left/taps move), tapping a blocked one bumps (bumps
 * moves, left doesn't), a full closed-loop clear driven by the DOM's own
 * per-arrow `data-blocked` flags ending in the celebration, the
 * confirm-guarded New puzzle, size changes, and mid-puzzle persistence
 * across a reload.
 */
import { addArrowsWidget, launch, reporter, tapArrowCell } from './helpers.mjs'
import {
  ARROW_DIMS,
  blockerOf,
  generatePuzzle,
  headDir,
  rayCells,
  solveOrder,
  trackOf,
} from './.bundle/arrowsModel.js'

const { check, finish } = reporter('arrow-escape')

// ---------------------------------------------------------------- 1. rules

// Blocking on a crafted board: a → points east at b two cells ahead; c is
// further along the same ray. The NEAREST body must be named, with the free
// gap before it.
{
  const a = { id: 0, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } // head (1,0) → e
  const b = { id: 1, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }] }
  const c = { id: 2, cells: [{ x: 5, y: 0 }, { x: 5, y: 1 }] }
  check('head direction reads off the last segment', headDir(a) === 'e')
  const blk = blockerOf(a, [a, b, c], 8, 8)
  check('the nearest body blocks', blk?.id === 1)
  check('with the free run before it', blk?.free === 1)
  check('clearing the blocker frees the ray', blockerOf(a, [a, c], 8, 8)?.id === 2)
  check('an empty ray is a clear exit', blockerOf(b, [b], 8, 8) === null)
  check('the ray runs from the head to the edge', rayCells(a, 8, 8).length === 6)
}

// A snake whose own tail loops AHEAD of its head does not block itself —
// the body moves with the head on the same rails.
{
  const bent = {
    id: 0,
    cells: [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  } // head (1,0) points east; own tail sits at (2,0), first ray cell
  check('a snake never blocks itself', blockerOf(bent, [bent], 8, 8) === null)
  const track = trackOf(bent, 8, 8)
  check(
    'the exit track rides body, ray, then clears the board',
    track.length === bent.cells.length + 6 + bent.cells.length + 1,
  )
}

// Generation: deterministic, in-bounds, non-overlapping — and every puzzle
// solvable, 200 seeds per size.
{
  const same =
    JSON.stringify(generatePuzzle(42, 9, 9, 13, 2, 5)) ===
    JSON.stringify(generatePuzzle(42, 9, 9, 13, 2, 5))
  check('generation is deterministic under a seed', same)

  for (const [size, d] of Object.entries(ARROW_DIMS)) {
    let solvable = 0
    let clean = true
    let seated = 0
    let ordered = 0
    let freeStart = 0
    let width = 0
    for (let seed = 1; seed <= 200; seed++) {
      const p = generatePuzzle(seed, d.cols, d.rows, d.count, d.minLen, d.maxLen, d.pick)
      seated += p.arrows.length
      const seen = new Set()
      for (const a of p.arrows) {
        for (const c of a.cells) {
          const k = `${c.x},${c.y}`
          if (seen.has(k) || c.x < 0 || c.x >= d.cols || c.y < 0 || c.y >= d.rows) clean = false
          seen.add(k)
        }
      }
      if (solveOrder(p) !== null) solvable++
      if (p.arrows.some((a) => blockerOf(a, p.arrows, p.cols, p.rows) !== null)) ordered++
      // Choice width: the average number of free arrows across a greedy
      // solve — THE difficulty number (lower = harder). Free-at-start is
      // its opening move.
      let alive = [...p.arrows]
      let w = 0
      let steps = 0
      while (alive.length > 0) {
        const free = alive.filter((a) => blockerOf(a, alive, p.cols, p.rows) === null)
        if (free.length === 0) break
        if (steps === 0) freeStart += free.length / p.arrows.length
        w += free.length
        steps++
        alive = alive.filter((a) => a.id !== free[0].id)
      }
      width += w / Math.max(1, steps)
    }
    check(`${size}: every one of 200 seeds is solvable`, solvable === 200)
    check(`${size}: snakes stay in-bounds and never overlap`, clean)
    check(
      `${size}: boards seat their floor (${(seated / 200).toFixed(1)} ≥ ${d.minSeat})`,
      seated / 200 >= d.minSeat,
    )
    check(`${size}: most boards need an ORDER (${ordered}/200 have a blocked arrow)`, ordered >= 150)
    if (size === 'large') {
      // Hardness must not silently regress: measured ~0.37 free at start
      // and width ~5.6; the bounds are conservative, not aspirational.
      check(
        `large: most arrows start blocked (${((freeStart / 200) * 100).toFixed(0)}% free)`,
        freeStart / 200 <= 0.45,
      )
      check(`large: the solve stays narrow (width ${(width / 200).toFixed(1)})`, width / 200 <= 6.5)
    }
  }
}

// ------------------------------------------------------------- 2. the widget

const { browser, page } = await launch()
await addArrowsWidget(page)

const root = page.locator('[data-testid="arrows-root"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
/** All alive arrows' contract, straight off the DOM. */
const arrowsOnBoard = () =>
  page.$$eval('g[data-arrow]', (els) =>
    els.map((el) => ({
      id: parseInt(el.dataset.arrow, 10),
      blocked: el.dataset.blocked === '1',
      head: el.dataset.head.split(',').map(Number),
    })),
  )

const dims = ARROW_DIMS[await attr('data-size')]
const total = await num('data-total')
check('the board publishes its arrow count', total > 0 && total <= dims.count)
check('all arrows start alive', (await num('data-left')) === total)
check('the DOM carries one group per arrow', (await arrowsOnBoard()).length === total)
check(
  'the DOM agrees with the model on the same seed',
  (await num('data-seed')) >= 0 &&
    generatePuzzle(await num('data-seed'), dims.cols, dims.rows, dims.count, dims.minLen, dims.maxLen, dims.pick)
      .arrows.length === total,
)

// Tap an unblocked arrow → it slides out: left falls, taps counts.
{
  const free = (await arrowsOnBoard()).find((a) => !a.blocked)
  await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows)
  await page.waitForFunction(
    (want) => document.querySelector('[data-testid="arrows-root"]')?.dataset.left === String(want),
    total - 1,
    { timeout: 6000 },
  )
  check('a clear arrow slides off the board', (await num('data-left')) === total - 1)
  check('the tap is counted', (await num('data-taps')) === 1)
  check('no bump for a clean exit', (await num('data-bumps')) === 0)
}

// Tap a blocked arrow → it bumps and stays: bumps counts, left doesn't move.
{
  const blocked = (await arrowsOnBoard()).find((a) => a.blocked)
  check('this seed opens with a blocked arrow to prove bumps on', blocked !== undefined)
  await tapArrowCell(page, blocked.head[0], blocked.head[1], dims.cols, dims.rows)
  await page.waitForFunction(
    () => document.querySelector('[data-testid="arrows-root"]')?.dataset.bumps === '1',
    null,
    { timeout: 3000 },
  )
  check('a blocked arrow bumps instead of leaving', (await num('data-left')) === total - 1)
  check('the bump is counted', (await num('data-bumps')) === 1)
}

// Mid-puzzle persistence: the freed arrow stays freed across a reload —
// after redux-persist has flushed its debounced write (lesson #12).
{
  await page.waitForFunction(
    (want) => {
      try {
        const raw = window.localStorage.getItem('persist:testsite')
        if (!raw) return false
        return JSON.parse(JSON.parse(raw).widgets ?? '{}').instances?.some(
          (w) => w.type === 'arrowEscape' && (w.data?.removed ?? []).length === want,
        )
      } catch {
        return false
      }
    },
    1,
    { timeout: 5000 },
  )
  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  check('the cleared arrow stays cleared across a reload', (await num('data-left')) === total - 1)
  check('so do the tap and bump counts', (await num('data-taps')) === 2 && (await num('data-bumps')) === 1)
}

// Closed-loop full clear, driven by the DOM's own data-blocked flags: keep
// tapping any unblocked arrow until the board empties. The pure sweep says
// this always terminates.
{
  let guard = 0
  while ((await num('data-left')) > 0 && guard++ < 40) {
    const free = (await arrowsOnBoard()).find((a) => !a.blocked)
    if (!free) break
    const before = await num('data-left')
    await tapArrowCell(page, free.head[0], free.head[1], dims.cols, dims.rows)
    await page.waitForFunction(
      (want) => document.querySelector('[data-testid="arrows-root"]')?.dataset.left === String(want),
      before - 1,
      { timeout: 6000 },
    )
  }
  check('the whole board clears', (await num('data-left')) === 0)
  check('the clear is celebrated', (await attr('data-state')) === 'won')
  check(
    'the celebration overlay is up',
    (await page.locator('[data-testid="arrows-cleared"]').count()) === 1,
  )
  check('the solve is tallied', (await num('data-solved')) === 1)
}

// New puzzle after a win needs no confirm and re-fills the board fresh.
{
  const oldSeed = await num('data-seed')
  await root.locator('[data-testid="arrows-new"]').click()
  await page.waitForFunction(
    () => {
      const r = document.querySelector('[data-testid="arrows-root"]')
      return r && r.dataset.left === r.dataset.total && r.dataset.left !== '0'
    },
    null,
    { timeout: 3000 },
  )
  check('New puzzle deals a fresh board', (await num('data-left')) === (await num('data-total')))
  check('with a fresh seed', (await num('data-seed')) !== oldSeed)
  check('and clean counters', (await num('data-taps')) === 0 && (await num('data-bumps')) === 0)
  check('the solved tally survives', (await num('data-solved')) === 1)
}

// Mid-puzzle, New puzzle and size changes are confirm-guarded.
{
  const arrows = await arrowsOnBoard()
  const free = arrows.find((a) => !a.blocked)
  const before = await num('data-left')
  await tapArrowCell(page, free.head[0], free.head[1], ARROW_DIMS[await attr('data-size')].cols, ARROW_DIMS[await attr('data-size')].rows)
  await page.waitForFunction(
    (want) => document.querySelector('[data-testid="arrows-root"]')?.dataset.left === String(want),
    before - 1,
    { timeout: 6000 },
  )
  await root.locator('[data-testid="arrows-new"]').click()
  await page.waitForSelector('.MuiDialog-root')
  check('a mid-puzzle reshuffle asks first', true)
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await page.waitForFunction(() => !document.querySelector('.MuiDialog-root'), null, { timeout: 3000 })
  check('Keep playing keeps the board', (await num('data-left')) === before - 1)

  await root.locator('[data-testid="arrows-size-small"]').click()
  await page.waitForSelector('.MuiDialog-root')
  await page.getByRole('button', { name: 'Restart' }).click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="arrows-root"]')?.dataset.size === 'small',
    null,
    { timeout: 3000 },
  )
  check('a size change restarts on the new board', (await num('data-left')) === (await num('data-total')))
  check(
    'small really is the small board',
    (await num('data-total')) <= ARROW_DIMS.small.count,
  )
}

await finish(browser)
