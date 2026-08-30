/**
 * Othello over two devices — the netplay layer's fourth turn-based consumer.
 *
 * What is NEW here relative to 146 (Tic-Tac-Toe) is the shape of the board
 * state: Othello's `TBoard` is a whole position `{ cells, turn }`, because a
 * forced pass breaks disc parity and the mover can no longer be derived the
 * way the other games derive it. The pass itself never crosses the wire —
 * both devices compute it inside the same pure `applyMove` (proven in 149's
 * rules half); what this suite pins is that a position-shaped board rides the
 * unchanged `useNetGame` seam: seats, the turn lock, cell-index relay in both
 * directions, refusal of illegal cells across the link, a broadcast restart,
 * and link release.
 *
 * Moves are chosen CLOSED-LOOP: the suite replays the game through the
 * bundled model and picks known-legal cells, instead of hardcoding a script
 * that would silently rot if the opening ever changed.
 */
import { addOthelloWidgets, launch, pairLoopback, reporter } from './helpers.mjs'
import { applyMove, initialPosition, legalMoves } from './.bundle/othelloModel.js'

const { check, finish } = reporter('othello-online')
const { browser, page } = await launch()
await addOthelloWidgets(page, 2)

const roots = page.locator('[data-testid="othello-root"]')
check('two Othello widgets on the board', (await roots.count()) === 2)

const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const ply = async (w) => parseInt(await attr(w, 'data-ply'), 10)
const cell = (w, i) => w.locator(`[data-testid="oth-cell-${i}"]`)
const until = (index, name, value) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="othello-root"]')[i]?.dataset[n] === v,
    [index, name, value],
    { timeout: 3000 },
  )

check('link is off outside online mode', (await attr(A, 'data-net')) === 'off')

const code = await pairLoopback(page, {
  host: A,
  guest: B,
  modeTestId: 'othello-mode-online',
  afterHost: async () => {
    check('host is waiting to pair', (await attr(A, 'data-net')) === 'pairing')
  },
})
check('host produced a pairing code', code.length > 0)

check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')
check(
  'both roots publish the same avatar map',
  (await attr(A, 'data-avatar-toy')) === (await attr(B, 'data-avatar-toy')) &&
    (await attr(A, 'data-avatar-ninja')) === (await attr(B, 'data-avatar-ninja')),
)

// The suite's shadow of the shared position, advanced through the same model
// the widgets run.
let pos = initialPosition('toy')

// Toy opens, so the guest's board is dead until the host has played.
await cell(B, legalMoves(pos)[0]).click()
await page.waitForTimeout(150)
check('guest cannot move out of turn', (await ply(B)) === 0 && (await ply(A)) === 0)

// Host plays a legal opening cell; the flip must land on BOTH boards.
const m1 = legalMoves(pos)[0]
const f1 = applyMove(pos, m1)
pos = f1.pos
await cell(A, m1).click()
await until(1, 'ply', '1')
check('a cell index relays to the guest', (await ply(B)) === 1)
check(
  "the guest's board shows the capture too",
  (await cell(B, f1.flipped[0]).getAttribute('data-disc')) === 'toy',
)
check('turn passes to Player 2 on both', (await attr(A, 'data-turn')) === 'ninja')
check('guest agrees whose turn it is', (await attr(B, 'data-turn')) === 'ninja')
check(
  'both scoreboards agree',
  (await attr(A, 'data-score-toy')) === (await attr(B, 'data-score-toy')),
)

// It is ninja's turn — the host tapping a ninja-legal cell must be refused.
await cell(A, legalMoves(pos)[0]).click()
await page.waitForTimeout(150)
check('host cannot move twice', (await ply(A)) === 1)

// The guest replies on a legal cell of its own.
const m2 = legalMoves(pos)[0]
pos = applyMove(pos, m2).pos
await cell(B, m2).click()
await until(0, 'ply', '2')
check('guest move relays back to the host', (await ply(A)) === 2 && (await ply(B)) === 2)

// A cell that flips nothing is refused across the link too, not just locally.
const dead = pos.cells.findIndex((c, i) => c === null && !legalMoves(pos).includes(i))
await cell(A, dead).click()
await page.waitForTimeout(150)
check('a no-flip cell is refused', (await ply(A)) === 2)

// A few more relayed plies, still closed-loop, to prove the position object
// keeps both devices in step beyond the opening.
for (let k = 0; k < 4; k++) {
  const mover = pos.turn // toy = host widget, ninja = guest widget
  const m = legalMoves(pos)[0]
  pos = applyMove(pos, m).pos
  await cell(mover === 'toy' ? A : B, m).click()
  await until(0, 'ply', String(3 + k))
  await until(1, 'ply', String(3 + k))
}
check('six plies in, the boards still agree', (await ply(A)) === 6 && (await ply(B)) === 6)
check(
  'and so do the scores',
  (await attr(A, 'data-score-toy')) === (await attr(B, 'data-score-toy')) &&
    (await attr(A, 'data-score-ninja')) === (await attr(B, 'data-score-ninja')),
)

// New game is a broadcast, from either side.
await B.getByRole('button', { name: 'New game' }).click()
await until(0, 'ply', '0')
check('new game clears both boards', (await ply(A)) === 0 && (await ply(B)) === 0)
check(
  'back to the standard opening on both',
  (await attr(A, 'data-score-toy')) === '2' && (await attr(B, 'data-score-ninja')) === '2',
)

// Leaving online mode releases the link rather than leaving it half-alive.
await A.getByRole('button', { name: '2-Player' }).click()
await page.waitForTimeout(250)
check('leaving online mode releases the link', (await attr(A, 'data-net')) === 'off')
check('the mode really changed', (await attr(A, 'data-mode')) === 'pvp')

await finish(browser)
