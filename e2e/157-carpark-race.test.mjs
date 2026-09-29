/**
 * Car Park 2 Devices race: two widgets on one page, paired through the
 * in-page loopback transport, race the SAME level; first red car out wins.
 *
 * Real-time like Maze Runner's ghost race: `useNetplay` + go/pos/done, no
 * protocol change. The opponent "ghost" is a whole packed position riding
 * `pos.cell` (`packRacePos`), drawn as a mini lot. Every wait is on a
 * `data-race` transition, never a sleep (lessons 103-104).
 */
import { addCarParkWidgets, dragVehicle, launch, pairLoopback, reporter } from './helpers.mjs'
import { packRacePos, parseBoard, solve, unpackRacePos } from './.bundle/carParkModel.js'
import { LEVELS, TIERS } from './.bundle/carParkLevels.js'

const { check, finish } = reporter('car-park-race')

// ------------------------------------------------------------ pure: packing
{
  let ok = 0
  let total = 0
  for (const t of TIERS)
    for (const l of LEVELS[t]) {
      const lot = parseBoard(l.board)
      const n = lot.vehicles.length
      for (const [p, m] of [[lot.start, 0], [lot.start, 999]]) {
        total++
        const cell = packRacePos(p, m)
        const back = unpackRacePos(cell, n)
        if (Number.isSafeInteger(cell) && back.moves === m && back.pos.join() === p.join()) ok++
      }
    }
  check('packRacePos round-trips every level (and stays a safe integer)', ok === total, `${ok}/${total}`)
}

// ------------------------------------------------------------ live
const { browser, page } = await launch({ viewport: { width: 1280, height: 1700 } })
await addCarParkWidgets(page, 2)
const roots = page.locator('[data-testid="carpark-root"]')
const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const num = async (w, name) => parseInt(await attr(w, name), 10)
const until = (index, name, value, timeout = 15000) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="carpark-root"]')[i]?.getAttribute(n) === String(v),
    [index, name, value],
    { timeout },
  )

check('race is off in solo', (await attr(A, 'data-race')) === 'off')

// The host picks Beginner level 2 BEFORE pairing — the guest must adopt it.
await A.locator('[data-testid="carpark-level"] select').selectOption('1')
await until(0, 'data-level', 1)

await pairLoopback(page, { host: A, guest: B, modeTestId: 'carpark-mode-online' })
check('host connected, seat toy', (await attr(A, 'data-net')) === 'connected' && (await attr(A, 'data-seat')) === 'toy')
check('guest connected, seat ninja', (await attr(B, 'data-net')) === 'connected' && (await attr(B, 'data-seat')) === 'ninja')
await until(1, 'data-level', 1)
check("the guest adopted the host's level", (await num(B, 'data-level')) === 1 && (await attr(B, 'data-tier')) === 'beginner')
check("the guest can't change level", await B.locator('[data-testid="carpark-level"] select').isDisabled())
check('both idle before the start', (await attr(A, 'data-race')) === 'idle' && (await attr(B, 'data-race')) === 'idle')

const lot = parseBoard(LEVELS.beginner[1].board)
const line = solve(lot)

// Locked until GO: a drag does nothing.
await dragVehicle(page, ...line[0], { widget: 0 })
await page.waitForTimeout(300)
check('the board is locked until GO', (await num(A, 'data-moves')) === 0)

// The GUEST starts it; both count down and go together.
await B.locator('[data-testid="carpark-start-race"]').click()
await until(0, 'data-race', 'counting')
check('both count down', (await attr(A, 'data-race')) === 'counting' && (await attr(B, 'data-race')) === 'counting')
await until(0, 'data-race', 'running')
await until(1, 'data-race', 'running')
check('both run', true)
check('no hints or solution in a race', (await A.locator('[data-testid="carpark-hint"]').count()) === 0 &&
  (await A.locator('[data-testid="carpark-solution"]').count()) === 0)
check("the host can't change level mid-race", await A.locator('[data-testid="carpark-level"] select').isDisabled())
check('each sees the opponent at 0 moves', (await num(A, 'data-opp-moves')) === 0 && (await num(B, 'data-opp-moves')) === 0)

// The host plays all but the last move; the guest watches it live.
for (let k = 0; k < line.length - 1; k++) {
  await dragVehicle(page, ...line[k], { widget: 0 })
  await until(0, 'data-moves', k + 1)
}
await until(1, 'data-opp-moves', line.length - 1)
check("the guest sees the host's move count", (await num(B, 'data-opp-moves')) === line.length - 1)
{
  let p = lot.start.slice()
  for (let k = 0; k < line.length - 1; k++) p[line[k][0]] += line[k][1]
  const cell = await B.locator('[data-testid="carpark-opponent"]').getAttribute('data-opp-pos')
  check("and the host's exact position on the mini lot", parseInt(cell, 10) === packRacePos(p, line.length - 1))
}

// Host exits first → host won, guest lost.
await dragVehicle(page, ...line[line.length - 1], { widget: 0 })
await until(0, 'data-race', 'won')
await until(1, 'data-race', 'lost')
check('first out wins', (await attr(A, 'data-race')) === 'won')
check('the other side loses', (await attr(B, 'data-race')) === 'lost')
check('the loser sees who was first', (await B.locator('[data-testid="carpark-race-lost"]').count()) === 1)

// The loser can still finish their own run; it stays lost.
for (let k = 0; k < line.length; k++) {
  await dragVehicle(page, ...line[k], { widget: 1 })
  await until(1, 'data-moves', k + 1)
}
await until(1, 'data-state', 'won')
check('the loser can still finish', (await attr(B, 'data-state')) === 'won')
check('and stays lost', (await attr(B, 'data-race')) === 'lost')

// Race again: both back to running from the start.
await A.locator('[data-testid="carpark-start-race"]').click()
await until(0, 'data-race', 'running')
await until(1, 'data-race', 'running')
check('Race again restarts both from the level start', (await num(A, 'data-moves')) === 0 && (await num(B, 'data-moves')) === 0)

// The guest walks away mid-race: leaving asks first, then the host's race
// is void.
await B.locator('[data-testid="carpark-mode-online"]').click()
const leave = page.getByRole('dialog', { name: 'Leave the race?' })
await leave.waitFor({ timeout: 3000 })
check('leaving mid-race asks first', (await leave.count()) === 1)
await leave.getByRole('button', { name: 'Leave' }).click()
await until(1, 'data-mode', 'solo')
await until(0, 'data-race', 'void')
check('a dead link voids the survivor\'s race', (await attr(A, 'data-race')) === 'void')
check('the void overlay is up', (await A.locator('[data-testid="carpark-race-void"]').count()) === 1)
check('no Start race until re-paired', (await A.locator('[data-testid="carpark-start-race"]').count()) === 0)

await page.screenshot({ path: 'e2e/.artifacts/157-carpark-race.png' }).catch(() => {})
await finish(browser)
