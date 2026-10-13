/**
 * Puppy Rescue — the 💡 Hint replay live (Round 6), through the `data-*`
 * contract: `data-hint` (1 while the ghost replay runs) on the root, the
 * `puppy-hint` button, the `puppy-hint-overlay` (tap to skip) and its
 * `puppy-hint-speed` toggle (`data-speed`).
 *
 * The button shows only while the level is ready. Tapping it runs the
 * stored 3-star route as a ghost run of the real sim — the dog leaves the
 * start, frees the puppy, escapes — then the level is back at ready on the
 * start, with NOTHING recorded (no stars, level 2 still locked). 2× runs the
 * game clock twice as fast as the wall clock; a tap on the maze or Escape
 * skips. A real move hides the button. In Arcade the same Classic route
 * plays and the card keeps Arcade.
 */
import { addPuppyWidget, launch, puppyState, reporter } from './helpers.mjs'
import { parseLevel } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'

const { check, finish } = reporter('puppy-hint')
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const ds = (k) => page.locator('[data-testid="puppy-root"]').evaluate((el, key) => el.dataset[key] ?? '', k)
const waitData = (k, want, timeout = 8000) =>
  page
    .waitForFunction(([key, w]) => document.querySelector('[data-testid="puppy-root"]')?.dataset[key] === w, [k, want], { timeout })
    .then(() => true, () => false)
const storedPuppy = () =>
  page.evaluate(() => {
    const r = JSON.parse(window.localStorage.getItem('persist:testsite') ?? '{}')
    return JSON.parse(r.records ?? '{}').puppyRescue ?? null
  })
const L1 = parseLevel(LEVELS[0])
const onStart = (st) => Math.abs(st.x - L1.start.x) < 1e-3 && Math.abs(st.y - L1.start.y) < 1e-3

await addPuppyWidget(page)

// --------------------------------------------- 1. a full replay at 1×
{
  check('ready: the Hint button shows', (await page.locator('[data-testid="puppy-hint"]').count()) === 1 && (await ds('hint')) === '0')
  await page.locator('[data-testid="puppy-hint"]').click()
  const on = await waitData('hint', '1', 2000)
  check('Hint starts the ghost replay (data-hint, overlay, tip and button gone)',
    on && (await page.locator('[data-testid="puppy-hint-overlay"]').count()) === 1 &&
      (await page.locator('[data-testid="puppy-tip"]').count()) === 0 &&
      (await page.locator('[data-testid="puppy-hint"]').count()) === 0)
  check('…at 1× by default', (await page.locator('[data-testid="puppy-hint-speed"]').getAttribute('data-speed')) === '1')
  await page.waitForTimeout(800)
  const mid = await puppyState(page)
  check('the ghost dog leaves the start on its own', mid.status === 'play' && !onStart(mid), `${mid.x},${mid.y}`)
  const freed = await waitData('pups', '1', 8000)
  check('…frees the puppy', freed)
  const escaped = await waitData('status', 'escaped', 8000)
  check('…and escapes', escaped)
  check('…unseen', (await ds('spotted')) === '0')
  check('no result card for a ghost run', (await page.locator('[data-testid="puppy-escaped"]').count()) === 0)
  const back = await waitData('hint', '0', 3000)
  const st = await puppyState(page)
  check('then back to ready on the start', back && st.status === 'ready' && onStart(st) && st.pups === 0)
  check('…the Hint button is back', (await page.locator('[data-testid="puppy-hint"]').count()) === 1)
  await page.waitForTimeout(1200) // persist debounce
  const rec = await storedPuppy()
  check('nothing recorded: no stars, no escapes, level 2 still locked',
    Object.keys(rec?.stars ?? {}).length === 0 && (rec?.escapes ?? 0) === 0 && st.unlocked === 1)
  check('no escape jingle counted for a ghost', (await ds('sfxEscape')) === '')
}

// ------------------------------------------------------------ 2. 2× speed
{
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.locator('[data-testid="puppy-hint-speed"]').click()
  check('⏩ toggles to 2× (and keeps playing)', (await page.locator('[data-testid="puppy-hint-speed"]').getAttribute('data-speed')) === '2' && (await ds('hint')) === '1')
  const t0 = parseFloat(await ds('t'))
  const w0 = Date.now()
  await page.waitForTimeout(1000)
  const t1 = parseFloat(await ds('t'))
  const rate = (t1 - t0) / ((Date.now() - w0) / 1000)
  check('at 2× the game clock runs about twice the wall clock', rate > 1.6 && rate < 2.3, rate.toFixed(2))
  await waitData('hint', '0', 8000)
  check('a 2× replay also ends back at ready', (await puppyState(page)).status === 'ready')
}

// ----------------------------------------------------------- 3. skipping
{
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.waitForTimeout(500)
  await page.locator('[data-testid="puppy-stage"]').click({ position: { x: 40, y: 200 } })
  const st = await puppyState(page)
  check('a tap on the maze skips: ready on the start', (await waitData('hint', '0', 1000)) && (await puppyState(page)).status === 'ready' && onStart(await puppyState(page)), `${st.status}`)
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  check('Escape skips too', (await waitData('hint', '0', 1000)) && onStart(await puppyState(page)))
}

// ----------------------------------------- 4. a real move hides the button
{
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(200)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(150)
  check('once you move, the Hint button is gone', (await ds('status')) === 'play' && (await page.locator('[data-testid="puppy-hint"]').count()) === 0)
  await page.locator('[data-testid="puppy-restart"]').click()
  await page.waitForTimeout(200)
  check('Restart brings it back', (await page.locator('[data-testid="puppy-hint"]').count()) === 1)
}

// ------------------------------------------------ 5. the hint in Arcade
{
  await page.locator('[data-testid="puppy-mode"] select').selectOption('arcade')
  await page.waitForTimeout(250)
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.locator('[data-testid="puppy-hint-speed"]').click()
  const escaped = await waitData('status', 'escaped', 8000)
  check('in Arcade the same route escapes, never chased', escaped && (await ds('sfxChase')) === '')
  await waitData('hint', '0', 3000)
  check('…and the card stays in Arcade, ready', (await ds('mode')) === 'arcade' && (await ds('status')) === 'ready')
}

await finish(browser)
