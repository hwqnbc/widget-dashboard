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
 * second. The fixed stick in the strip under the maze steers (a drag on the
 * maze doesn't): a resting thumb stays put, a small push is full speed,
 * across the centre reverses, the stick never moves, release stops. The ⚙
 * menu: Unlock all opens every level, Stick → Left moves the stick, Sound
 * toggles, Reset records clears
 * the stars and re-locks.
 */
import { addPuppyWidget, drivePuppy, launch, puppyMenu, puppyState, reporter, stickCenter } from './helpers.mjs'
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
  const tipBox = await page.locator('[data-testid="puppy-tip"]').boundingBox()
  const stageBox = await page.locator('[data-testid="puppy-stage"]').boundingBox()
  check('the tip is a banner ABOVE the maze, not over it', tipBox.y + tipBox.height <= stageBox.y + 1)
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
  const banner = await page
    .locator('[data-testid="puppy-caught"]')
    .waitFor({ timeout: 800 })
    .then(() => true, () => false)
  check('the caught banner shows', banner)
  check('sfx: the alert and the catch', st.sfxAlert >= 1 && st.sfxCaught === 1)
  const t0 = Date.now()
  const back = await waitStatus('ready', 3000)
  const dt = Date.now() - t0
  const r = await puppyState(page)
  check('back at the start, ready, in about a second', back && dt < 1500 && Math.abs(r.y - s0.y) < 1e-3, `${dt} ms`)
}

// ------------------------------------- 5. touch: the fixed stick (strip)
{
  // Level 2's bottom row is open wall to wall — steer along it.
  const before = await puppyState(page)
  const cdp = await context.newCDPSession(page)
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] })
  // A drag on the MAZE no longer steers.
  const box = await page.locator('[data-testid="puppy-stage"]').boundingBox()
  const mx = box.x + box.width / 2
  const my = box.y + box.height * 0.8
  await touch('touchStart', mx, my)
  for (let i = 1; i <= 5; i++) await touch('touchMove', mx + i * 15, my)
  await page.waitForTimeout(300)
  await touch('touchEnd')
  const after = await puppyState(page)
  check('dragging on the maze does not move the dog', Math.abs(after.x - before.x) < 1e-3 && after.status === 'ready')
  // The stick: a resting thumb stays put, a small push is full speed.
  const c = await stickCenter(page, 'puppy-stick')
  const strip = await page.locator('[data-testid="puppy-stick-strip"]').boundingBox()
  check('the stick sits in its strip below the maze, centred by default',
    strip.y >= box.y + box.height - 1 && Math.abs(c.x - (strip.x + strip.width / 2)) < 4)
  await touch('touchStart', c.x, c.y)
  await touch('touchMove', c.x + 3, c.y)
  await page.waitForTimeout(250)
  const still = await puppyState(page)
  check('a resting thumb on the stick does not move the dog', Math.abs(still.x - before.x) < 1e-3)
  await touch('touchMove', c.x + 14, c.y)
  const a0 = await puppyState(page)
  await page.waitForTimeout(400)
  const a1 = await puppyState(page)
  const speed = (a1.x - a0.x) / (a1.t - a0.t)
  check('a small push on the stick runs the dog at full speed', speed > 2.2, `${speed.toFixed(2)} cells/s`)
  // The stick never moves: across its centre is a reverse.
  await touch('touchMove', c.x - 14, c.y)
  await page.waitForTimeout(80)
  const r0 = await puppyState(page)
  await page.waitForTimeout(300)
  const r1 = await puppyState(page)
  check('pushing the other way reverses', r1.x < r0.x - 0.4, `${r0.x} → ${r1.x}`)
  const c2 = await stickCenter(page, 'puppy-stick')
  check('the stick stayed put while steering', Math.abs(c2.x - c.x) < 1 && Math.abs(c2.y - c.y) < 1)
  await touch('touchEnd')
  await page.waitForTimeout(150)
  const e0 = await puppyState(page)
  await page.waitForTimeout(300)
  const e1 = await puppyState(page)
  await cdp.detach()
  check('letting go stops it dead', Math.abs(e0.x - e1.x) < 1e-3 && e1.status === 'play')
  await page.locator('[data-testid="puppy-restart"]').click()
}

// ------------------------------------------------------- 6. the ⚙ menu
{
  await puppyMenu(page, 'puppy-unlock-all')
  check('Unlock all opens every level', (await puppyState(page)).unlocked === LEVELS.length)
  // Key & Pen 1, by the planner's route: key → padlock → the whole pen out.
  const keyIdx = LEVELS.findIndex((l) => l.tier === 'key')
  await page.locator('[data-testid="puppy-level"] select').selectOption(String(keyIdx))
  await page.waitForTimeout(400)
  {
    const L = parseLevel(LEVELS[keyIdx])
    const plan = planLevel(L)
    const st = await drivePuppy(page, plan.route, { timeout: 45000 })
    check('Key & Pen 1: key picked up, padlock opened, whole pen escaped unseen',
      st.status === 'escaped' && st.pups === L.cages.length + L.pen.length && !st.spotted, `${st.status} pups ${st.pups}`)
    const sfx = await page.locator('[data-testid="puppy-root"]').evaluate((el) => [el.dataset.sfxKey, el.dataset.sfxUnlock])
    check('sfx: key jingle + padlock clunk', sfx[0] === '1' && sfx[1] === '1', sfx.join(','))
    check('…3 stars', (await page.locator('[data-testid="puppy-escaped"]').getAttribute('data-stars')) === '3')
  }
  // Hide 1: wait for the corridor walker to pass, slip in behind it and
  // stand still in the alcove bush — hidden (badge + telemetry + rustle).
  const hideIdx = LEVELS.findIndex((l) => l.tier === 'hide')
  await page.locator('[data-testid="puppy-level"] select').selectOption(String(hideIdx))
  await page.waitForTimeout(400)
  {
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(60)
    await page.keyboard.up('ArrowRight')
    await page
      .waitForFunction(() => parseFloat(document.querySelector('[data-testid="puppy-root"]')?.dataset.t ?? '0') >= 6.6, null, { timeout: 12000 })
      .catch(() => {})
    const st = await drivePuppy(page, [{ x: 0.5, y: 9.5 }, { x: 3.5, y: 9.5 }, { x: 3.5, y: 5.5 }, { x: 2.5, y: 5.5 }], { timeout: 15000 })
    await page.waitForTimeout(250)
    const h = await page.locator('[data-testid="puppy-root"]').evaluate((el) => [el.dataset.hidden, el.dataset.sfxHide, el.dataset.status])
    check('Hide 1: standing still in the bush hides the dog (telemetry + rustle)', st.status === 'play' && h[0] === '1' && Number(h[1]) >= 1 && h[2] === 'play', h.join(','))
    check('…and the HUD shows the hidden badge', (await page.locator('[data-testid="puppy-hidden"]').count()) === 1)
    // Telemetry publishes every 50 ms — hold long enough to be sampled.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(150)
    const moving = await page.locator('[data-testid="puppy-root"]').evaluate((el) => el.dataset.hidden)
    await page.keyboard.up('ArrowRight')
    check('moving reveals it again', moving === '0')
  }
  await page.locator('[data-testid="puppy-level"] select').selectOption(String(LEVELS.length - 1))
  await page.waitForTimeout(400)
  check('…and the last level can be picked', (await puppyState(page)).level === LEVELS[LEVELS.length - 1].id)
  await puppyMenu(page, 'puppy-stick-left')
  const strip = await page.locator('[data-testid="puppy-stick-strip"]').boundingBox()
  const left = await stickCenter(page, 'puppy-stick')
  check('Stick → Left moves the stick to the left of its strip',
    (await page.locator('[data-testid="puppy-root"]').getAttribute('data-stick')) === 'left' && left.x < strip.x + strip.width / 3)
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
  check('…and so does the stick position', (await page.locator('[data-testid="puppy-root"]').getAttribute('data-stick')) === 'left')
  // The new tiers continue the chain: escaping Patrol 5 opens Sentry 1.
  await page.evaluate((ids) => {
    const root = JSON.parse(window.localStorage.getItem('persist:testsite'))
    const rec = JSON.parse(root.records)
    rec.puppyRescue = { stars: Object.fromEntries(ids.map((id) => [id, 1])), bestMs: {}, escapes: ids.length }
    root.records = JSON.stringify(rec)
    window.localStorage.setItem('persist:testsite', JSON.stringify(root))
  }, LEVELS.filter((l) => l.tier === 'sneak' || l.tier === 'patrol').map((l) => l.id))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  const firstSentry = LEVELS.findIndex((l) => l.tier === 'sentry')
  const opts = page.locator('[data-testid="puppy-level"] select option')
  check('escaping every Sneak + Patrol level unlocks Sentry 1, and only it',
    (await puppyState(page)).unlocked === firstSentry + 1 && !(await opts.nth(firstSentry).isDisabled()) && (await opts.nth(firstSentry + 1).isDisabled()))
}

await finish(browser)
