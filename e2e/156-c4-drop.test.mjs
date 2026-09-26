/**
 * Connect 4 drop animation (docs/connect-4.md *Animated drop*): the played
 * disc falls down the WHOLE column — from above the top hole, past every empty
 * slot, into its landing slot — instead of only moving inside its own hole.
 *
 * Asserts on the contract only: the landed disc (`data-c4-disc=<index>`)
 * carries a running transform animation whose start offset spans the column
 * from the top slot to the landing slot, the hole's clip is lifted while it
 * falls (so the disc is visible over the empty slots above) and restored once
 * it lands, a disc landing higher up falls a shorter distance, and a paused
 * mid-fall frame shows the disc physically above its landing slot.
 *
 * Pacing: the fall is slow enough to follow (≥ 0.9 s to the bottom row), and
 * nothing covers or cuts it short — root `data-falling` is "true" until it
 * lands, and only then do the 2-player hand-off banner and the win overlay
 * (`c4-win-overlay`) appear; a click in 2-player mode is ignored meanwhile;
 * and vs Computer the reply waits for the player's disc to land.
 */
import { addConnect4Widget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('c4-drop')
const { browser, page } = await launch()
await addConnect4Widget(page)

const COLS = 7
const root = page.locator('[data-testid="connect4-root"]')

/** Click column `col`, then read the landing disc's animation straight away. */
async function drop(col, index) {
  await root.locator(`[data-testid="c4-slot-${col}"]`).click()
  return page.evaluate(
    ({ index, col }) => {
      const disc = document.querySelector(`[data-c4-disc="${index}"]`)
      const top = document.querySelector(`[data-testid="c4-slot-${col}"]`)
      if (!disc || !top) return null
      const fall = disc
        .getAnimations()
        .find((a) => a.effect.getKeyframes().some((k) => k.transform))
      const first = fall?.effect.getKeyframes()[0]
      const fromY = first ? parseFloat(/translateY\((-?[\d.]+)px\)/.exec(first.transform)?.[1]) : NaN
      // The disc is mid-transform right now: undo the current translate to get
      // its resting rect (a head need not sit dead-centre in its slot).
      const d = disc.getBoundingClientRect()
      const ty = new DOMMatrix(getComputedStyle(disc).transform).m42
      return {
        running: fall?.playState === 'running',
        fromY,
        duration: fall?.effect.getTiming().duration,
        // Distance from the top slot's top edge to the disc's resting centre.
        span: d.top - ty + d.height / 2 - top.getBoundingClientRect().top,
        clip: getComputedStyle(disc.parentElement).overflow,
      }
    },
    { index, col },
  )
}

// First disc in column 3 lands on the bottom row (index 5*7+3 = 38).
const a = await drop(3, 5 * COLS + 3)
check('the landed disc has a running fall animation', a?.running, JSON.stringify(a))
check(
  'it starts from the top of the column, not inside its own hole',
  Math.abs(a.fromY + a.span) < 2,
  `fromY=${a.fromY} span=${a.span}`,
)
check('the hole stops clipping while the disc falls', a.clip === 'visible')

check('a bottom-row fall takes long enough to follow (≥ 0.9 s)', a.duration >= 900, `${a.duration}`)
check('the root reports the disc falling', (await root.getAttribute('data-falling')) === 'true')
check(
  'the hand-off banner waits for the disc to land',
  (await page.locator('[data-testid="turn-banner"]').count()) === 0,
)

// Mid-fall frame: pause it and the disc is above its slot, over the empty ones.
const mid = await page.evaluate(() => {
  const disc = document.querySelector('[data-c4-disc="38"]')
  const slot = document.querySelector('[data-testid="c4-slot-38"]')
  const anims = disc.getAnimations()
  for (const x of anims) {
    x.pause()
    x.currentTime = x.effect.getTiming().duration * 0.3
  }
  const r = disc.getBoundingClientRect()
  const s = slot.getBoundingClientRect()
  for (const x of anims) x.finish()
  return { discBottom: r.bottom, slotTop: s.top }
})
check('mid-fall the disc is drawn above its landing slot', mid.discBottom < mid.slotTop, JSON.stringify(mid))

// The clip comes back on the fall's `finish`, which is dispatched async.
const clipOf38 = () =>
  getComputedStyle(document.querySelector('[data-c4-disc="38"]').parentElement).overflow
await page
  .waitForFunction(
    () => getComputedStyle(document.querySelector('[data-c4-disc="38"]').parentElement).overflow === 'hidden',
    null,
    { timeout: 2000 },
  )
  .catch(() => {})
const clipAfter = await page.evaluate(clipOf38)
check('the hole clips again once the disc has landed', clipAfter === 'hidden', clipAfter)
await page.locator('[data-testid="turn-banner"]').waitFor({ timeout: 2000 }).catch(() => {})
check('once landed, the hand-off banner shows', (await page.locator('[data-testid="turn-banner"]').count()) === 1)
check('…and the root reports it landed', (await root.getAttribute('data-falling')) === 'false')
await page.locator('[data-testid="turn-banner"]').click()
await page.locator('[data-testid="turn-banner"]').waitFor({ state: 'detached' })

// Second disc in the same column lands one row up (index 31): shorter fall.
const b = await drop(3, 4 * COLS + 3)
check('a disc landing higher also falls from the top', Math.abs(b.fromY + b.span) < 2, `fromY=${b.fromY} span=${b.span}`)
check('…over a shorter distance', Math.abs(b.fromY) < Math.abs(a.fromY), `${b.fromY} vs ${a.fromY}`)
check('…and in less time', b.duration < a.duration, `${b.duration} vs ${a.duration}`)


// A click while the disc is still falling is ignored in 2-player mode.
await root.locator('[data-testid="c4-slot-0"]').click()
check('a click mid-fall is ignored', (await root.getAttribute('data-ply')) === '2')

const landedTB = async () => {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="connect4-root"]').dataset.falling === 'false',
    null,
    { timeout: 3000 },
  )
  const banner = page.locator('[data-testid="turn-banner"]')
  await banner.waitFor({ timeout: 2000 }).catch(() => {})
  if (await banner.count()) {
    await banner.click()
    await banner.waitFor({ state: 'detached' })
  }
}
await landedTB()
check('both discs rest on the board', (await root.getAttribute('data-ply')) === '2')

// Win: toy stacks column 0 while ninja stacks column 1 (ninja already has a
// disc in col 3). The overlay waits for the winning disc to land.
for (const c of [0, 1, 0, 1, 0, 1]) {
  await root.locator(`[data-testid="c4-slot-${c}"]`).click()
  await landedTB()
}
await root.locator('[data-testid="c4-slot-0"]').click()
check('the winning move is recorded at once', (await root.getAttribute('data-winner')) === 'toy')
check(
  'the win overlay waits while the winning disc falls',
  (await root.getAttribute('data-falling')) === 'true' &&
    (await page.locator('[data-testid="c4-win-overlay"]').count()) === 0,
)
await page.locator('[data-testid="c4-win-overlay"]').waitFor({ timeout: 3000 }).catch(() => {})
check('the win overlay shows once it lands', (await page.locator('[data-testid="c4-win-overlay"]').count()) === 1)

// Vs Computer: switch mode (confirm-free — the game is over), play the bottom
// row; the reply only comes after our disc has landed.
await root.getByRole('button', { name: 'vs Computer' }).click()
await page.waitForFunction(
  () => document.querySelector('[data-testid="connect4-root"]').dataset.ply === '0',
  null,
  { timeout: 3000 },
)
await root.locator('[data-testid="c4-slot-3"]').click()
const t0 = Date.now()
await page.waitForFunction(
  () => document.querySelector('[data-testid="connect4-root"]').dataset.falling === 'false',
  null,
  { timeout: 3000 },
)
const landedAt = Date.now() - t0
const plyAtLanding = await root.getAttribute('data-ply')
check('the computer has not replied before our disc landed', plyAtLanding === '1', `ply=${plyAtLanding} after ${landedAt}ms`)
await page.waitForFunction(
  () => document.querySelector('[data-testid="connect4-root"]').dataset.ply === '2',
  null,
  { timeout: 4000 },
)
check('…then it replies', (await root.getAttribute('data-ply')) === '2')
await page.screenshot({ path: new URL('./.artifacts/c4-drop.png', import.meta.url).pathname })

await finish(browser)
