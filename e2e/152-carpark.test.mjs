/**
 * Car Park: the slide-the-cars-out ("Rush Hour") puzzle on a FIXED,
 * numbered, append-only level pack.
 *
 * Pure half, against the bundled `carParkModel` + `carParkLevels`: parsing
 * (orientation off the cells, the target first, malformed boards rejected),
 * slide ranges against cars and walls, legality, replay degrading a bad log
 * to its valid prefix, BFS optimality on crafted boards (incl. an
 * unsolvable one) — and the load-bearing sweep: EVERY shipped level parses,
 * is solvable, its stored par equals the BFS optimum, the par sits inside
 * its tier's band, and no board repeats. That sweep is what lets new levels
 * be appended safely.
 *
 * Live half: the widget's `data-*` contract — the default Beginner 1 board
 * matches the model, a drag past a car's range clamps and counts as ONE
 * move, Undo, confirm-guarded Reset, a move surviving a reload, playing the
 * solver's optimal line through real pointer drags ends in the drive-out
 * celebration with best = par (★), Next level, the tier dropdown, and a
 * confirm-guarded level change mid-attempt.
 */
import { addCarParkWidget, dragVehicle, launch, reporter } from './helpers.mjs'
import {
  isLegal,
  isSolved,
  moveRange,
  parseBoard,
  replay,
  serialize,
  solve,
} from './.bundle/carParkModel.js'
import { LEVELS, TIERS, TIER_BANDS } from './.bundle/carParkLevels.js'
import { CAR_COLORS, TARGET_COLOR, TRUCK_COLORS } from './.bundle/palette.js'

const { check, finish } = reporter('car-park')

// ---------------------------------------------------------------- 1. rules

//   0 1 2 3 4 5
// 0 . . . . . .
// 1 . . . . B .
// 2 A A . . B .      ← exit on the right of row 2
// 3 . . . . C C
// 4 . . . . . .
// 5 . . . . . .
{
  const board = 'oooooo' + 'ooooBo' + 'AAooBo' + 'ooooCC' + 'oooooo' + 'oooooo'
  const lot = parseBoard(board)
  check('the target is vehicle 0', lot.vehicles[0].id === 'A' && lot.vehicles[0].horiz)
  check('orientation is read off the cells', lot.vehicles[1].horiz === false && lot.vehicles[2].horiz === true)
  check('serialize inverts parse', serialize(lot, lot.start) === board)
  const rB = moveRange(lot, lot.start, 1)
  check('B slides up one, down zero (C below)', rB.min === -1 && rB.max === 0)
  const rA = moveRange(lot, lot.start, 0)
  check('A slides right up to B', rA.min === 0 && rA.max === 2)
  check('a zero slide is illegal', !isLegal(lot, lot.start, [0, 0]))
  check('a slide past a car is illegal', !isLegal(lot, lot.start, [0, 3]))
  // B up one clears the exit row → A drives the rest: 2 moves.
  const sol = solve(lot)
  check('BFS finds the optimum', sol?.length === 2, JSON.stringify(sol))
  check('its line replays to solved', isSolved(lot, replay(lot, sol).pos))
  const bad = replay(lot, [[2, -1], [0, 5], [1, 1]])
  check('replay stops at the first illegal move', bad.applied === 1)
}

// Walls block like cars.
{
  const lot = parseBoard('oooooo' + 'oooooo' + 'AAoxoo' + 'oooooo' + 'oooooo' + 'oooooo')
  check('a wall caps the slide', moveRange(lot, lot.start, 0).max === 1)
  check('a walled exit row is unsolvable', solve(lot) === null)
}

// A full column of two vertical trucks can never clear the exit row.
{
  const lot = parseBoard('ooooBo' + 'ooooBo' + 'AAooBo' + 'ooooCo' + 'ooooCo' + 'ooooCo')
  check('an immovable blocker is unsolvable', solve(lot) === null)
}

for (const [name, board] of [
  ['a short board', 'AAoo'],
  ['a missing target', 'o'.repeat(36)],
  ['a vertical target', 'ooAooo' + 'ooAooo' + 'o'.repeat(24)],
  ['a bent vehicle', 'BBoooo' + 'Boooo' + 'o' + 'AAoooo' + 'o'.repeat(18)],
]) {
  let threw = false
  try {
    parseBoard(board)
  } catch {
    threw = true
  }
  check(`parse rejects ${name}`, threw)
}

// --------------------------------------------------------- 2. level sweep
{
  const seen = new Set()
  let ok = 0
  let total = 0
  const failures = []
  for (const t of TIERS) {
    check(`${t} ships at least 10 levels`, LEVELS[t].length >= 10, `${LEVELS[t].length}`)
    const [lo, hi] = TIER_BANDS[t]
    LEVELS[t].forEach((lvl, i) => {
      total++
      try {
        const lot = parseBoard(lvl.board)
        const sol = solve(lot)
        const good =
          sol !== null &&
          sol.length === lvl.par &&
          lvl.par >= lo &&
          lvl.par <= hi &&
          !seen.has(lvl.board) &&
          isSolved(lot, replay(lot, sol).pos)
        seen.add(lvl.board)
        if (good) ok++
        else failures.push(`${t}:${i} par ${lvl.par} solved ${sol?.length}`)
      } catch (e) {
        failures.push(`${t}:${i} ${e.message}`)
      }
    })
  }
  check('every level: solvable, par = BFS optimum, inside its band, unique', ok === total, failures.join('; '))
  const maxPar = Math.max(...TIERS.flatMap((t) => LEVELS[t].map((l) => l.par)))
  check('the Expert tier reaches a 40+ move board', maxPar >= 40, `${maxPar}`)
}

// ------------------------------------------------------ 2b. palette rule
// The red car must never blend in: no other vehicle colour may sit within
// 50° of its hue (greys — low saturation — are exempt).
{
  const hsl = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    const l = (max + min) / 2
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let h = 0
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: (h * 60 + 360) % 360, s }
  }
  const t = hsl(TARGET_COLOR)
  const clash = [...CAR_COLORS, ...TRUCK_COLORS].filter((c) => {
    const { h, s } = hsl(c)
    const dh = Math.min(Math.abs(h - t.h), 360 - Math.abs(h - t.h))
    return s > 0.25 && dh < 50
  })
  check('no vehicle colour is within 50° of the target red', clash.length === 0, clash.join(','))
}

// ---------------------------------------------------------------- 3. live
const { browser, page } = await launch()
await addCarParkWidget(page)

const root = page.locator('[data-testid="carpark-root"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const waitAttr = (name, want, timeout = 4000) =>
  page.waitForFunction(
    ([n, w]) => document.querySelector('[data-testid="carpark-root"]')?.getAttribute(n) === String(w),
    [name, want],
    { timeout },
  )
const vehicleAt = (i) =>
  page.$eval(`[data-testid="carpark-board"] [data-index="${i}"]`, (el) => ({
    row: parseInt(el.dataset.row, 10),
    col: parseInt(el.dataset.col, 10),
  }))

const L0 = LEVELS.beginner[0]
const lot0 = parseBoard(L0.board)
check('opens on Beginner, level 1', (await attr('data-tier')) === 'beginner' && (await num('data-level')) === 0)
check('publishes the level par', (await num('data-par')) === L0.par)
check(
  'draws one group per vehicle',
  (await page.locator('[data-testid="carpark-board"] [data-vehicle]').count()) === lot0.vehicles.length,
)
check(
  'exactly one vehicle is marked as the target, and it is vehicle 0',
  (await page.locator('[data-testid="carpark-board"] [data-target="1"]').count()) === 1 &&
    (await page.locator('[data-testid="carpark-board"] [data-target="1"]').getAttribute('data-index')) === '0',
)
check('a fresh level has no moves', (await num('data-moves')) === 0 && (await attr('data-state')) === 'live')

// Over-drag clamps to the free run and counts as ONE move.
{
  let vi = -1
  let range = null
  for (let i = 0; i < lot0.vehicles.length && vi < 0; i++) {
    const r = moveRange(lot0, lot0.start, i)
    if (i > 0 && r.max >= 1) (vi = i), (range = r)
  }
  check('Beginner 1 has a vehicle free to slide', vi > 0)
  const v = lot0.vehicles[vi]
  const before = await vehicleAt(vi)
  await dragVehicle(page, vi, range.max + 2)
  await waitAttr('data-moves', 1)
  const after = await vehicleAt(vi)
  const moved = v.horiz ? after.col - before.col : after.row - before.row
  check('an over-drag clamps to the free run', moved === range.max, `${moved} vs ${range.max}`)
  check('and counts one move', (await num('data-moves')) === 1)

  // Undo takes it back.
  await root.locator('[data-testid="carpark-undo"]').click()
  await waitAttr('data-moves', 0)
  const undone = await vehicleAt(vi)
  check('Undo restores the car', undone.row === before.row && undone.col === before.col)

  // Persistence: a move survives a reload once redux-persist flushed.
  await dragVehicle(page, vi, 1)
  await waitAttr('data-moves', 1)
  await page.waitForFunction(() => {
    try {
      const raw = window.localStorage.getItem('persist:testsite')
      return JSON.parse(JSON.parse(raw).widgets ?? '{}').instances?.some(
        (w) => w.type === 'carPark' && (w.data?.moves ?? []).length === 1,
      )
    } catch {
      return false
    }
  }, null, { timeout: 5000 })
  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  check('a move survives a reload', (await num('data-moves')) === 1)

  // Reset mid-attempt is confirm-guarded.
  await root.locator('[data-testid="carpark-reset"]').click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  check('Reset mid-attempt asks first', (await dialog.count()) === 1)
  await dialog.getByRole('button', { name: 'Restart' }).click()
  await waitAttr('data-moves', 0)
  check('confirmed Reset clears the moves', (await num('data-moves')) === 0)
  await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
}

// Play the solver's optimal line through real drags → the win.
{
  const line = solve(lot0)
  for (let k = 0; k < line.length; k++) {
    const [vi, d] = line[k]
    await dragVehicle(page, vi, d)
    await waitAttr('data-moves', k + 1)
  }
  await waitAttr('data-state', 'won')
  check('the optimal line wins the level', (await attr('data-state')) === 'won')
  check('in exactly par moves', (await num('data-moves')) === L0.par)
  check('best is recorded at par', (await num('data-best')) === L0.par)
  check('the solve is tallied once', (await num('data-solved')) === 1)
  check('the celebration is up', (await page.locator('[data-testid="carpark-won"]').count()) === 1)
  const star = await root
    .locator('[data-testid="carpark-level"] select option[value="0"]')
    .textContent()
  check('the level list marks it ★', star.includes('★'), star)
}

// Next level moves on with a clean slate.
{
  await root.locator('[data-testid="carpark-next"]').click()
  await waitAttr('data-level', 1)
  check('Next level goes to level 2', (await num('data-level')) === 1)
  check('with no moves and its own par', (await num('data-moves')) === 0 && (await num('data-par')) === LEVELS.beginner[1].par)
  check('and no best yet', (await attr('data-best')) === '')
}

// The tier dropdown switches pack; a level change mid-attempt asks first.
{
  await root.locator('[data-testid="carpark-tier"] select').selectOption('expert')
  await waitAttr('data-tier', 'expert')
  check('the tier dropdown opens Expert, level 1', (await num('data-level')) === 0)
  check('with the Expert par', (await num('data-par')) === LEVELS.expert[0].par)

  const lotE = parseBoard(LEVELS.expert[0].board)
  const [vi, d] = solve(lotE)[0]
  await dragVehicle(page, vi, d)
  await waitAttr('data-moves', 1)
  await root.locator('[data-testid="carpark-level"] select').selectOption('1')
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Keep playing' }).click()
  await page.waitForFunction(() => !document.querySelector('.MuiModal-backdrop'), null, { timeout: 3000 })
  check('cancelling keeps the level and its moves', (await num('data-level')) === 0 && (await num('data-moves')) === 1)
}

await page.screenshot({ path: 'e2e/.artifacts/152-carpark.png' }).catch(() => {})
await finish(browser)
