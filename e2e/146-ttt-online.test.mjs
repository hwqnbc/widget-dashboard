/**
 * Tic-Tac-Toe over two devices — the netplay layer's second consumer.
 *
 * The point of this suite is narrow and deliberate. `143-netplay` already
 * proves the transport, the codec and the protocol on Connect 4; what was
 * never proven is the claim `docs/netplay.md` makes — that the protocol is
 * *game-agnostic*. Tic-Tac-Toe now shares the wiring rather than a copy of it
 * (`features/netplay/useNetGame`), and supplies one game-specific function:
 * "put this seat's mark in this cell". So this suite asserts the seams a
 * second game actually exercises — seat assignment, the turn lock, relay in
 * both directions, an agreed winner, a broadcast restart — on a board whose
 * moves are cell indices instead of columns.
 *
 * Two widgets in ONE document, paired over the `loopback` transport
 * (`?netloop=1`), exactly as the Connect 4 suite does.
 */
import { addTicTacToeWidgets, launch, pairLoopback, reporter } from './helpers.mjs'

const { check, finish } = reporter('ttt-online')
const { browser, page } = await launch()
await addTicTacToeWidgets(page, 2)

const roots = page.locator('[data-testid="tictactoe-root"]')
check('two Tic-Tac-Toe widgets on the board', (await roots.count()) === 2)

const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const ply = async (w) => parseInt(await attr(w, 'data-ply'), 10)
const cell = (w, i) => w.locator(`[data-testid="ttt-cell-${i}"]`)
/** Wait for a widget's attribute to reach a value (redux writes are async). */
const until = (index, name, value) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="tictactoe-root"]')[i]?.dataset[n] === v,
    [index, name, value],
    { timeout: 3000 },
  )

check('link is off outside online mode', (await attr(A, 'data-net')) === 'off')

const code = await pairLoopback(page, {
  host: A,
  guest: B,
  modeTestId: 'ttt-mode-online',
  afterHost: async () => {
    check('host is waiting to pair', (await attr(A, 'data-net')) === 'pairing')
  },
})
check('host produced a pairing code', code.length > 0)

check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')

// Toy opens, so the guest's board is dead until the host has played.
await cell(B, 0).click()
await page.waitForTimeout(150)
check('guest cannot move out of turn', (await ply(B)) === 0 && (await ply(A)) === 0)

await cell(A, 0).click()
await until(1, 'ply', '1')
check('a cell index relays to the guest', (await ply(B)) === 1)
check('turn passes to Player 2 on both', (await attr(A, 'data-turn')) === 'ninja')
check('guest agrees whose turn it is', (await attr(B, 'data-turn')) === 'ninja')

await cell(A, 4).click()
await page.waitForTimeout(150)
check('host cannot move twice', (await ply(A)) === 1)

await cell(B, 4).click()
await until(0, 'ply', '2')
check('guest move relays back to the host', (await ply(A)) === 2 && (await ply(B)) === 2)

// An occupied cell is refused across the link too, not just locally.
await cell(A, 4).click()
await page.waitForTimeout(150)
check('an occupied cell is refused', (await ply(A)) === 2)

// Toy takes the top row: 0 and 1 are played, 2 finishes it.
await cell(A, 1).click()
await until(1, 'ply', '3')
await cell(B, 7).click()
await until(0, 'ply', '4')
await cell(A, 2).click()
await until(1, 'winner', 'toy')
check('both devices agree on the winner', (await attr(A, 'data-winner')) === 'toy')
check('the guest sees the win too', (await attr(B, 'data-winner')) === 'toy')

// New game is a broadcast, from either side.
await B.getByRole('button', { name: 'New game' }).click()
await until(0, 'ply', '0')
check('new game clears both boards', (await ply(A)) === 0 && (await ply(B)) === 0)
check('the win clears on both', (await attr(A, 'data-winner')) === '' && (await attr(B, 'data-winner')) === '')

// Leaving online mode releases the link rather than leaving it half-alive.
// (Re-tapping the selected toggle is a no-op by design — an exclusive
// ToggleButtonGroup reports null, and the widget ignores it.)
await A.locator('[data-testid="ttt-mode-pvp"]').click()
await page.waitForTimeout(250)
check('leaving online mode releases the link', (await attr(A, 'data-net')) === 'off')
check('the mode really changed', (await attr(A, 'data-mode')) === 'pvp')

await finish(browser)
