/**
 * Puppy Rescue — the mode picker live (Round 5), through the `data-*`
 * contract: `data-mode` on the root, `data-chasing` (a bit per chasing /
 * searching catcher), `data-nets`, `data-sfx-chase` / `data-sfx-net`, the
 * `puppy-mode` picker, `puppy-mode-badge` and `puppy-mode-tip`.
 *
 * A fresh card is Classic with no badge. Picking Easy before the first move
 * switches at once (badge + mode tip). Level 1 escaped in Easy records under
 * `easy|sneak:0` only — the picker shows its stars in Easy, none in Classic —
 * yet unlocks level 2 for every mode. In Arcade, walking up level 2's
 * watched corridor starts a CHASE (sting, badge, `data-chasing`) instead of
 * a catch, and the catcher catching up is what catches the dog. Switching
 * mode mid-run asks first: Keep playing keeps the rules, Switch restarts in
 * the new mode. The mode survives a reload.
 */
import { addPuppyWidget, drivePuppy, launch, puppyState, reporter } from './helpers.mjs'
import { parseLevel } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'
import { planLevel } from './.bundle/rescuePlanner.js'

const { check, finish } = reporter('puppy-modes-ui')
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const root = '[data-testid="puppy-root"]'
const ds = (k) => page.locator(root).evaluate((el, key) => el.dataset[key] ?? '', k)
const waitData = (k, pred, timeout = 8000) =>
  page
    .waitForFunction(
      ([key, src]) => {
        const v = document.querySelector('[data-testid="puppy-root"]')?.dataset[key] ?? ''
        return new Function('v', `return (${src})(v)`)(v)
      },
      [k, pred.toString()],
      { timeout },
    )
    .then(() => true, () => false)
const pickMode = async (m) => {
  await page.locator('[data-testid="puppy-mode"] select').selectOption(m)
  await page.waitForTimeout(250)
}
const storedPuppy = () =>
  page.evaluate(() => {
    const r = JSON.parse(window.localStorage.getItem('persist:testsite') ?? '{}')
    return JSON.parse(r.records ?? '{}').puppyRescue ?? null
  })
const optionText = (i) => page.locator('[data-testid="puppy-level"] select option').nth(i).textContent()

await addPuppyWidget(page)

// ------------------------------------------------------------ 1. defaults
{
  check('a fresh card plays Classic', (await ds('mode')) === 'classic' && (await page.locator('[data-testid="puppy-mode"] select').inputValue()) === 'classic')
  check('…with no mode badge and no mode tip', (await page.locator('[data-testid="puppy-mode-badge"]').count()) === 0 && (await page.locator('[data-testid="puppy-mode-tip"]').count()) === 0)
  check('the mode picker sits beside the level picker', (await page.locator('[data-testid="puppy-mode"]').boundingBox()).x > (await page.locator('[data-testid="puppy-level"]').boundingBox()).x)
}

// ---------------------------------------------- 2. Easy, before a move
{
  await pickMode('easy')
  check('picking Easy before the first move switches at once (no confirm)', (await ds('mode')) === 'easy' && (await page.getByRole('dialog').count()) === 0)
  const badge = page.locator('[data-testid="puppy-mode-badge"]')
  check('the HUD badge reads EASY', (await badge.count()) === 1 && (await badge.textContent()) === 'EASY')
  check('the tip banner explains Easy', ((await page.locator('[data-testid="puppy-mode-tip"]').textContent()) ?? '').includes('netted'))
}

// --------------------------------------- 3. records are kept per mode
{
  const plan = planLevel(parseLevel(LEVELS[0]))
  const st = await drivePuppy(page, plan.route)
  check('level 1 escaped in Easy', st.status === 'escaped')
  check('the result card names the mode', ((await page.locator('[data-testid="puppy-escaped"]').textContent()) ?? '').includes('Easy mode'))
  await page.waitForTimeout(1200) // persist debounce
  const rec = await storedPuppy()
  check('records: stars under easy|sneak:0, none under the Classic key', rec?.stars?.[`easy|${LEVELS[0].id}`] === 3 && rec.stars[LEVELS[0].id] === undefined && rec.bestMs[`easy|${LEVELS[0].id}`] > 0)
  check('an Easy escape unlocks level 2', (await puppyState(page)).unlocked === 2)
  check('the picker shows the Easy stars in Easy', (await optionText(0)).includes('★★★'))
  await pickMode('classic')
  check('…and none in Classic (its own records)', (await optionText(0)).includes('☆☆☆'))
  check('…while level 2 stays unlocked in Classic too', (await puppyState(page)).unlocked === 2 && !(await page.locator('[data-testid="puppy-level"] select option').nth(1).isDisabled()))
}

// ------------------------------------------- 4. Arcade: a chase, not a catch
{
  await page.locator('[data-testid="puppy-level"] select').selectOption('1')
  await page.waitForTimeout(300)
  await pickMode('arcade')
  check('Arcade picked on level 2', (await ds('mode')) === 'arcade' && (await ds('level')) === LEVELS[1].id)
  check('the tip banner explains Arcade', ((await page.locator('[data-testid="puppy-mode-tip"]').textContent()) ?? '').includes('chase'))
  // Level 2: the catcher looks down the middle corridor — walk up it.
  await page.keyboard.down('ArrowUp')
  const chased = await waitData('sfxChase', (v) => Number(v) >= 1, 6000)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(120)
  const st = await puppyState(page)
  check('walking into the cone starts a CHASE — not a catch', chased && st.status === 'play', st.status)
  check('…the root flags the chasing catcher', Number(await ds('chasing')) > 0)
  const badge = page.locator('[data-testid="puppy-mode-badge"]')
  check('…and the badge shouts CHASE!', (await badge.textContent()) === 'CHASE!' && (await badge.getAttribute('data-chasing')) === '1')
  // Stand still: it catches up — the touch is the catch.
  const caught = await waitData('status', (v) => v === 'caught', 6000)
  check('standing still, the chaser catches the dog on contact', caught)
  const banner = await page.locator('[data-testid="puppy-caught"]').waitFor({ timeout: 800 }).then(() => true, () => false)
  check('…"caught up with you"', banner && ((await page.locator('[data-testid="puppy-caught"]').textContent()) ?? '').includes('caught up'))
  const back = await waitData('status', (v) => v === 'ready', 3000)
  check('…and back to the start, ready', back && (await ds('chasing')) === '0')
}

// ------------------------------------------- 5. mid-run switch is guarded
{
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowLeft')
  check('(a run is under way)', (await ds('status')) === 'play')
  await pickMode('easy')
  const dlg = page.getByRole('dialog')
  check('switching mode mid-run asks first', (await dlg.count()) === 1 && ((await dlg.textContent()) ?? '').includes('restarts'))
  await page.getByRole('button', { name: 'Keep playing' }).click()
  await page.waitForTimeout(300)
  check('Keep playing: still Arcade, still playing', (await ds('mode')) === 'arcade' && (await ds('status')) === 'play' && (await page.locator('[data-testid="puppy-mode"] select').inputValue()) === 'arcade')
  await pickMode('easy')
  await page.getByRole('button', { name: 'Switch and restart' }).click()
  await page.waitForTimeout(300)
  check('Switch and restart: Easy, back on the start, ready', (await ds('mode')) === 'easy' && (await ds('status')) === 'ready')
}

// ------------------------------------------------------- 6. persistence
{
  await page.waitForTimeout(1000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector(root)
  check('the mode survives a reload', (await ds('mode')) === 'easy' && (await page.locator('[data-testid="puppy-mode-badge"]').textContent()) === 'EASY')
}

await finish(browser)
