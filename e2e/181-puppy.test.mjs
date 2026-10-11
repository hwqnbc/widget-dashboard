/**
 * Puppy Rescue — the live widget, through its `data-testid` / `data-*`
 * contract (the root publishes status, position, puppies, meter and sfx
 * counters every 50 ms).
 *
 * A fresh card is on level 1 with only level 1 unlocked, tip showing, the
 * 3D canvas up. The first key press starts the run; Restart puts the dog
 * back. The planner's route for level 1, walked with the arrow keys, frees
 * the puppy and escapes unseen: 3 stars, the records slice keeps them, level
 * 2 unlocks, Next level goes there. On level 2, walking straight up the
 * watched corridor gets the dog caught — and back at the start within a
 * second. A touch drag anywhere on the stage steers (floating stick). The ⚙
 * menu: Unlock all opens every level, Sound toggles, Reset records clears
 * the stars and re-locks.
 */
import { addPuppyWidget, drivePuppy, launch, puppyMenu, puppyState, reporter } from './helpers.mjs'
import { initialState, parseLevel } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'
import { planLevel } from './.bundle/rescuePlanner.js'

const { check, finish } = reporter('puppy')
const { browser, context, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const waitStatus = (want, timeout = 8000) =>
  page
    .waitForFunction((w) => document.querySelector('[data-testid="puppy-root"]')?.dataset.status === w, want, { timeout })
    .then(() => true, () => false)
const storedPuppy = () =>
  page.evaluate(() => {
    const root = JSON.parse(window.localStorage.getItem('persist:testsite') ?? '{}')
    return JSON.parse(root.records ?? '{}').puppyRescue ?? null
  })

await addPuppyWidget(page)

// ------------------------------------------------------------ 1. fresh card
{
  const st = await puppyState(page)
  const L1 = parseLevel(LEVELS[0])
  check('fresh card: level 1, ready, only level 1 unlocked', st.level === LEVELS[0].id && st.status === 'ready' && st.unlocked === 1)
  check('the tip names the level', (await page.locator('[data-testid="puppy-tip"]').textContent()).includes(LEVELS[0].name))
  check('the dog sits on the start', Math.abs(st.x - L1.start.x) < 1e-3 && Math.abs(st.y - L1.start.y) < 1e-3, `${st.x},${st.y}`)
  const locked = await page.locator('[data-testid="puppy-level"] select option').nth(1).isDisabled()
  check('level 2 is locked in the picker', locked)
  check('pup counter 0/1', (await page.locator('[data-testid="puppy-count"]').getAttribute('data-pups')) === '0')
}

// ------------------------------------------------ 2. first move + restart
{
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(300)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(150)
  const st = await puppyState(page)
  check('a key press starts the run and moves the dog up', st.status === 'play' && st.y < 6.3 && st.t > 0, `${st.status} y ${st.y}`)
  check('the tip is gone once playing', (await page.locator('[data-testid="puppy-tip"]').count()) === 0)
  await page.locator('[data-testid="puppy-restart"]').click()
  await page.waitForTimeout(200)
  const r = await puppyState(page)
  check('Restart: back to ready on the start', r.status === 'ready' && Math.abs(r.y - 6.5) < 1e-3)
}

// ------------------------------------- 3. level 1 by the planner's route
{
  const L1 = parseLevel(LEVELS[0])
  const plan = planLevel(L1)
  const st = await drivePuppy(page, plan.route)
  check('level 1: the route frees the puppy and escapes', st.status === 'escaped' && st.pups === 1, `${st.status} pups ${st.pups}`)
  check('…unseen', !st.spotted)
  const stars = await page.locator('[data-testid="puppy-escaped"]').getAttribute('data-stars')
  check('the result card shows 3 stars', stars === '3', stars)
  check('sfx: one yip, one escape jingle', st.sfxFreed === 1 && st.sfxEscape === 1)
  await page.waitForTimeout(1200) // persist debounce
  const rec = await storedPuppy()
  check('records keep 3 stars + a best time for level 1', rec?.stars?.[LEVELS[0].id] === 3 && rec.bestMs[LEVELS[0].id] > 0 && rec.escapes === 1)
  check('level 2 unlocks', (await puppyState(page)).unlocked === 2)
  await page.locator('[data-testid="puppy-next"]').click()
  await page.waitForTimeout(400)
  const n = await puppyState(page)
  check('Next level → level 2, ready', n.level === LEVELS[1].id && n.status === 'ready')
}

// --------------------------------------------------- 4. caught → restart
{
  // Level 2: the catcher looks down the middle corridor — walk straight up it.
  const L2 = parseLevel(LEVELS[1])
  const s0 = initialState(L2)
  await page.keyboard.down('ArrowUp')
  const caught = await waitStatus('caught', 6000)
  await page.keyboard.up('ArrowUp')
  const st = await puppyState(page)
  check('walking into the cone gets the dog caught', caught && st.spotted, st.status)
  check('the caught banner shows', (await page.locator('[data-testid="puppy-caught"]').count()) === 1)
  check('sfx: the alert and the catch', st.sfxAlert >= 1 && st.sfxCaught === 1)
  const t0 = Date.now()
  const back = await waitStatus('ready', 3000)
  const dt = Date.now() - t0
  const r = await puppyState(page)
  check('back at the start, ready, in about a second', back && dt < 1500 && Math.abs(r.y - s0.y) < 1e-3, `${dt} ms`)
}

// ---------------------------------------------- 5. touch: floating stick
{
  const box = await page.locator('[data-testid="puppy-stage"]').boundingBox()
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * 0.75
  const before = await puppyState(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] })
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 14, id: 7 }] })
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(400)
  const mid = await puppyState(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(150)
  const a = await puppyState(page)
  await page.waitForTimeout(300)
  const b = await puppyState(page)
  await cdp.detach()
  check('dragging up anywhere walks the dog up', mid.status === 'play' && mid.y < before.y - 0.3, `${before.y} → ${mid.y}`)
  check('letting go stops it dead', Math.abs(a.y - b.y) < 1e-3)
  await page.locator('[data-testid="puppy-restart"]').click()
}

// ------------------------------------------------------- 6. the ⚙ menu
{
  await puppyMenu(page, 'puppy-unlock-all')
  check('Unlock all opens every level', (await puppyState(page)).unlocked === LEVELS.length)
  await page.locator('[data-testid="puppy-level"] select').selectOption(String(LEVELS.length - 1))
  await page.waitForTimeout(400)
  check('…and the last level can be picked', (await puppyState(page)).level === LEVELS[LEVELS.length - 1].id)
  await puppyMenu(page, 'puppy-sound')
  check('Sound toggles off', (await page.locator('[data-testid="puppy-root"]').getAttribute('data-sound')) === 'off')
  await page.locator('[data-testid="puppy-settings"]').click()
  await page.locator('[data-testid="puppy-reset-records"]').click()
  await page.getByRole('button', { name: 'Reset records' }).click()
  await page.waitForTimeout(300)
  await puppyMenu(page, 'puppy-unlock-all')
  check('Reset records + unlock off: back to one level', (await puppyState(page)).unlocked === 1)
  await page.waitForTimeout(1200)
  const rec = await storedPuppy()
  check('the stored stars are gone', rec && Object.keys(rec.stars).length === 0)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  check('the chosen level survives a reload', (await puppyState(page)).level === LEVELS[LEVELS.length - 1].id)
}

await finish(browser)
