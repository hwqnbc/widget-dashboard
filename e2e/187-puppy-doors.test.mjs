/**
 * Puppy Rescue — the Doors tier live, through the `data-*` contract:
 * `data-doors` (one char per door in map order, 1 open / 0 shut),
 * `data-plates` (presses this run) and `data-sfx-plate` on the root.
 *
 * The level picker carries the Doors tier (levels 26–30). On Doors 1 the
 * red door starts shut; the planner's route walked with the arrow keys
 * steps on the red plate — the door opens (telemetry + click-clunk sfx) —
 * frees the puppy and escapes with 3★. On Doors 4 (two colours, a walker
 * to wait out) the 💡 Hint replay at 2× presses both plates and escapes,
 * and Restart shuts every door again.
 */
import { addPuppyWidget, drivePuppy, launch, puppyMenu, puppyState, reporter } from './helpers.mjs'
import { decodeRoute } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'
import { HINTS } from './.bundle/rescueHints.js'

const { check, finish } = reporter('puppy-doors')
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const ds = (k) => page.locator('[data-testid="puppy-root"]').evaluate((el, key) => el.dataset[key] ?? '', k)
const waitData = (k, want, timeout = 8000) =>
  page
    .waitForFunction(([key, w]) => document.querySelector('[data-testid="puppy-root"]')?.dataset[key] === w, [k, want], { timeout })
    .then(() => true, () => false)
const pick = async (id) => {
  await page.locator('[data-testid="puppy-level"] select').selectOption(String(LEVELS.findIndex((l) => l.id === id)))
  await page.waitForTimeout(500)
}

await addPuppyWidget(page)
await puppyMenu(page, 'puppy-unlock-all')

// ------------------------------------------------------ 1. the Doors tier
{
  const groups = await page.locator('[data-testid="puppy-level"] select optgroup').evaluateAll((gs) => gs.map((g) => g.label))
  check('the picker has a Doors tier', groups.some((g) => g.startsWith('Doors')), groups.join(' | '))
  check('…holding five levels after Hide', LEVELS.filter((l) => l.tier === 'doors').length === 5 && LEVELS.findIndex((l) => l.tier === 'doors') === 25)
}

// ------------------------------------------- 2. Doors 1, walked by its route
{
  await pick('doors:0')
  check('Doors 1: the red door starts shut', (await ds('doors')) === '0')
  check('…and the tip explains the plate', ((await page.locator('[data-testid="puppy-tip"]').textContent()) ?? '').includes('plate'))
  const route = decodeRoute(HINTS['doors:0'])
  // Walk to the plate first (the route's first two legs), check, then on.
  let st = await drivePuppy(page, route.slice(0, 2), { timeout: 15000 })
  await page.waitForTimeout(150)
  check('stepping on the red plate opens the red door', (await ds('doors')) === '1' && (await ds('plates')) === '1' && (await ds('sfxPlate')) === '1', `${await ds('doors')} ${await ds('plates')}`)
  st = await drivePuppy(page, route.slice(2), { timeout: 20000 })
  check('…then through it: puppy freed, escaped', st.status === 'escaped' && st.pups === 1, `${st.status} ${st.pups}`)
  check('…with 3 stars', (await page.locator('[data-testid="puppy-escaped"]').getAttribute('data-stars')) === '3')
}

// --------------------------------- 3. Doors 4 by the hint replay (2×)
{
  await pick('doors:3')
  check('Doors 4: both doors start shut', (await ds('doors')) === '00')
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.locator('[data-testid="puppy-hint-speed"]').click()
  const escaped = await waitData('status', 'escaped', 15000)
  check('the hint replay presses both plates (both doors open) and escapes', escaped && (await ds('plates')) === '2' && (await ds('doors')) === '11', `${await ds('plates')} ${await ds('doors')}`)
  await waitData('hint', '0', 3000)
  check('…then back at ready with every door shut again', (await ds('status')) === 'ready' && (await ds('doors')) === '00' && (await ds('plates')) === '0')
}

// ------------------------------------------------- 4. restart resets doors
{
  await pick('doors:0')
  await drivePuppy(page, decodeRoute(HINTS['doors:0']).slice(0, 2), { timeout: 15000 })
  await page.waitForTimeout(150)
  const open = await ds('doors')
  await page.locator('[data-testid="puppy-restart"]').click()
  await page.waitForTimeout(250)
  const st = await puppyState(page)
  check('Restart after a press: the door is shut again', open === '1' && (await ds('doors')) === '0' && st.status === 'ready')
}

await finish(browser)
