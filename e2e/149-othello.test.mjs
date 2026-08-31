/**
 * Othello widget: the rules engine, the AI ladder, and the solo/vs-computer
 * widget against the real dev server.
 *
 * The rules half runs PURE, against the bundled `othelloModel` — flips in
 * every direction, the forced pass (the reason a position stores its own
 * `turn`: passes break disc parity, so the mover cannot be derived the way
 * Connect 4 and Tic-Tac-Toe derive it), the early wipe-out end, and the AI:
 * easy is the deterministic-under-seed "sane player" (never misses a corner,
 * avoids handing one over), medium/hard climb a strict ladder.
 *
 * The live half pins the widget's `data-*` contract: the standard opening
 * (4 discs, 4 legal moves, hints on exactly those cells), a flip landing on
 * the board, the vs-computer reply, the confirm-guarded restart, the
 * pass-opening button, and the position surviving a reload.
 */
import { addOthelloWidgets, launch, reporter } from './helpers.mjs'
import {
  CELLS,
  applyMove,
  counts,
  easyMove,
  flipsFor,
  initialPosition,
  isOver,
  legalFor,
  legalMoves,
  aiMove,
  winnerOf,
} from './.bundle/othelloModel.js'

const { check, finish } = reporter('othello')

// ---------------------------------------------------------------- 1. rules

const start = initialPosition('toy')
check('the board opens with 4 discs', start.cells.filter(Boolean).length === 4)
check('opening counts are 2–2', counts(start.cells).toy === 2 && counts(start.cells).ninja === 2)
check('the opener moves first', start.turn === 'toy')

// The standard opening: exactly d3, c4, f5, e6 are playable.
const opening = legalMoves(start).sort((a, b) => a - b)
check(
  `the opening legal moves are the classic four (${opening.join(',')})`,
  JSON.stringify(opening) === JSON.stringify([19, 26, 37, 44]),
)

// d3 flips exactly d4, and the turn passes.
const d3 = applyMove(start, 19)
check('a move reports its flips', JSON.stringify(d3.flipped) === JSON.stringify([27]))
check('the flipped disc changes owner', d3.pos.cells[27] === 'toy')
check('the placed disc lands', d3.pos.cells[19] === 'toy')
check('the turn passes when the opponent can reply', d3.pos.turn === 'ninja')
check('the original position is untouched', start.cells[27] === 'ninja')

check('an empty cell that flips nothing is illegal', applyMove(start, 0) === null)
check('an occupied cell is illegal', applyMove(start, 27) === null)

// A multi-direction capture: toy at 20 brackets runs left (19,18 after re-own)
// — build it explicitly instead: ninja discs radiating from an empty centre,
// toy discs capping three of the rays.
{
  const cells = Array(CELLS).fill(null)
  const centre = 3 * 8 + 3 // d4
  // west ray: ninja at c4, toy at b4 · north ray: ninja at d3, toy at d2
  // NE ray: ninja at e3, toy at f2
  cells[3 * 8 + 2] = 'ninja'
  cells[3 * 8 + 1] = 'toy'
  cells[2 * 8 + 3] = 'ninja'
  cells[1 * 8 + 3] = 'toy'
  cells[2 * 8 + 4] = 'ninja'
  cells[1 * 8 + 5] = 'toy'
  const flips = flipsFor(cells, centre, 'toy').sort((a, b) => a - b)
  check(
    'a move captures along every bracketed ray at once',
    JSON.stringify(flips) === JSON.stringify([2 * 8 + 3, 2 * 8 + 4, 3 * 8 + 2]),
  )
}

// The forced pass: after toy's capture ninja has NO reply, so the turn stays
// with toy — and toy's next capture wipes the board, ending the game early.
{
  const cells = Array(CELLS).fill(null)
  cells[0] = 'toy'
  cells[1] = 'ninja'
  cells[16] = 'toy'
  cells[17] = 'ninja'
  const step1 = applyMove({ cells, turn: 'toy' }, 2)
  check('a stranded opponent is skipped — the turn stays', step1.pos.turn === 'toy')
  check('a pass is not the end while the mover can play', !isOver(step1.pos))
  const step2 = applyMove(step1.pos, 18)
  check('a wipe-out ends the game before the board fills', isOver(step2.pos))
  check('the result is most discs', winnerOf(step2.pos) === 'toy')
  check('a live game has no result yet', winnerOf(start) === null)
}

// ------------------------------------------------------------------ 2. AI

for (const d of ['easy', 'medium', 'hard']) {
  check(`${d} opens with a legal move`, legalMoves(start).includes(aiMove(start, d)))
}

// Easy is "sane": a corner on offer is never missed.
{
  const cells = Array(CELLS).fill(null)
  cells[1] = 'ninja'
  cells[2] = 'toy'
  cells[19] = 'ninja'
  cells[27] = 'toy'
  const pos = { cells, turn: 'toy' }
  check('the corner is on offer', legalMoves(pos).includes(0))
  check('easy never misses a corner', easyMove(pos) === 0)
}

// The ladder is strict under a seeded easy (deterministic, so no flake):
// medium (ninja) beats seeded-easy (toy), and hard beats medium.
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32)
function playout(ninjaAI, toyAI) {
  let pos = initialPosition('toy')
  let guard = 0
  while (!isOver(pos) && guard++ < 70) {
    const mover = pos.turn === 'ninja' ? ninjaAI : toyAI
    const m = mover(pos)
    if (m < 0 || !legalMoves(pos).includes(m)) return 'illegal'
    pos = applyMove(pos, m).pos
  }
  return winnerOf(pos)
}
{
  const rand = lcg(7)
  const result = playout(
    (p) => aiMove(p, 'medium'),
    (p) => easyMove(p, rand),
  )
  check(`medium beats the sane easy (${result})`, result === 'ninja')
}
{
  const result = playout(
    (p) => aiMove(p, 'hard'),
    (p) => aiMove(p, 'medium'),
  )
  check(`hard beats medium (${result})`, result === 'ninja')
}

// ------------------------------------------------------------- 3. the widget

const { browser, page } = await launch()
await addOthelloWidgets(page, 1)

const root = page.locator('[data-testid="othello-root"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const cellAt = (i) => root.locator(`[data-testid="oth-cell-${i}"]`)
const until = (name, value, timeout = 5000) =>
  page.waitForFunction(
    ([n, v]) => document.querySelector('[data-testid="othello-root"]')?.dataset[n] === v,
    [name, value],
    { timeout },
  )

check('a fresh board is the standard opening', (await num('data-ply')) === 0)
check('scores read 2–2', (await num('data-score-toy')) === 2 && (await num('data-score-ninja')) === 2)
check('toy is to move', (await attr('data-turn')) === 'toy')
check('four legal moves are published', (await num('data-legal')) === 4)
for (const i of [19, 26, 37, 44]) {
  check(`cell ${i} shows a hint`, (await cellAt(i).getAttribute('data-hint')) === '1')
}
check('a non-legal cell shows none', (await cellAt(0).getAttribute('data-hint')) === '0')

// A tap that flips nothing is refused.
await cellAt(0).click()
await page.waitForTimeout(150)
check('an illegal tap is refused', (await num('data-ply')) === 0)

// ---- capture preview on press-hold --------------------------------------
// Holding a legal cell previews what the move wins BEFORE committing: a
// ghost disc on the held cell, a ring on every disc the move would flip
// (exactly the model's flipsFor), and no state change while held. Releasing
// on the cell commits the move via the ordinary click — so this press-hold
// doubles as the suite's d3 move.
const centre = async (i) => {
  const box = await cellAt(i).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
{
  const at = await centre(19)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await until('preview', '19')
  const expectFlips = flipsFor(start.cells, 19, 'toy')
  check(
    'the held cell publishes the preview',
    (await attr('data-preview')) === '19',
  )
  for (const f of expectFlips) {
    check(`the would-be capture ${f} rings`, (await cellAt(f).getAttribute('data-preview-flip')) === '1')
  }
  check(
    'nothing else rings',
    (await root.locator('[data-preview-flip="1"]').count()) === expectFlips.length,
  )
  check('the position is untouched while held', (await num('data-ply')) === 0)
  await page.mouse.up()
}
await until('ply', '1')
check('releasing on the cell commits the move', (await num('data-ply')) === 1)
check('the preview clears with the commit', (await attr('data-preview')) === '')

// Dragging OFF the cell before release aborts: no move, no preview.
await page.waitForFunction(
  () => !document.querySelector('[data-testid="turn-banner"]'),
  null,
  { timeout: 4000 },
)
{
  const afterD3 = applyMove(start, 19).pos
  const ninjaCell = legalMoves(afterD3)[0]
  const at = await centre(ninjaCell)
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await until('preview', String(ninjaCell))
  const away = await centre(0)
  await page.mouse.move(away.x, away.y)
  await page.waitForFunction(
    () => document.querySelector('[data-testid="othello-root"]')?.dataset.preview === '',
    null,
    { timeout: 3000 },
  )
  await page.mouse.up()
  await page.waitForTimeout(150)
  check('dragging off the cell cancels the preview', (await attr('data-preview')) === '')
  check('and plays nothing', (await num('data-ply')) === 1)
}

// d3 landed above: the disc AND d4 turned over.
check('the placed disc is toy', (await cellAt(19).getAttribute('data-disc')) === 'toy')
check('the captured disc turned over', (await cellAt(27).getAttribute('data-disc')) === 'toy')
check('the score moved to 4–1', (await num('data-score-toy')) === 4 && (await num('data-score-ninja')) === 1)
check('the turn passed', (await attr('data-turn')) === 'ninja')

// vs Computer: the change is confirm-guarded mid-game, then the ninja replies
// on its own.
await root.getByRole('button', { name: 'vs Computer' }).click()
await page.waitForSelector('.MuiDialog-root')
check('a mid-game mode change asks first', (await attr('data-mode')) === 'pvp')
await page.getByRole('button', { name: 'Restart' }).click()
await until('mode', 'ai')
check('the restart cleared the board', (await num('data-ply')) === 0)

await cellAt(19).click()
await until('ply', '2', 8000) // toy's move + the AI's reply (thinking pause)
check('the computer replied on its own', (await num('data-ply')) === 2)
check('the turn came back to toy', (await attr('data-turn')) === 'toy')

// The pass-opening button hands the first move to the ninja.
await root.getByRole('button', { name: 'New game' }).click()
await until('ply', '0')
await root.getByRole('button', { name: /Pass — let Ninja start/ }).click()
await until('ply', '1', 8000) // the AI opens
check('the computer opened after the pass', (await num('data-ply')) === 1)
check('and handed the turn to toy', (await attr('data-turn')) === 'toy')

// The position survives a reload — after redux-persist has actually flushed
// (its writes are debounced; racing it is lesson #12's flake).
const keptPly = await num('data-ply')
await page.waitForFunction(
  (want) => {
    try {
      const raw = window.localStorage.getItem('persist:testsite')
      if (!raw) return false
      return JSON.parse(JSON.parse(raw).widgets ?? '{}').instances?.some(
        (w) => w.type === 'othello' && (w.data?.board?.cells ?? []).filter(Boolean).length === want + 4,
      )
    } catch {
      return false
    }
  },
  keptPly,
  { timeout: 5000 },
)
await page.reload({ waitUntil: 'networkidle' })
await root.waitFor()
check('the position survives a reload', (await num('data-ply')) === keptPly)
check('so does the mode', (await attr('data-mode')) === 'ai')

await finish(browser)
