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

// Second disc in the same column lands one row up (index 31): shorter fall.
const b = await drop(3, 4 * COLS + 3)
check('a disc landing higher also falls from the top', Math.abs(b.fromY + b.span) < 2, `fromY=${b.fromY} span=${b.span}`)
check('…over a shorter distance', Math.abs(b.fromY) < Math.abs(a.fromY), `${b.fromY} vs ${a.fromY}`)
check('…and in less time', b.duration < a.duration, `${b.duration} vs ${a.duration}`)

await page.waitForTimeout(700)
check('both discs rest on the board', (await root.getAttribute('data-ply')) === '2')
await page.screenshot({ path: new URL('./.artifacts/c4-drop.png', import.meta.url).pathname })

await finish(browser)
