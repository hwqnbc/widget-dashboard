/**
 * Puppy Rescue — the Cameras tier live, through the `data-*` contract:
 * `data-cams` (one char per camera, 1 on / 0 off) and `data-cam-seeing`
 * on the root, plus the caught banner.
 *
 * The picker carries the Cameras tier (levels 31–35). On Cameras 2 the red
 * camera starts on; walking up into its beam gets the dog caught BY THE
 * CAMERA ("A camera spotted you."). Then the stored route: stepping on the
 * red plate switches the camera off (telemetry + sfx), and the route frees
 * the puppy and escapes with 3★. On Cameras 1 (an always-on sweeping
 * camera, a pure timing level) the 💡 Hint replay at 2× darts under the
 * beam and escapes.
 */
import { addPuppyWidget, drivePuppy, launch, puppyMenu, reporter } from './helpers.mjs'
import { decodeRoute } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'
import { HINTS } from './.bundle/rescueHints.js'

const { check, finish } = reporter('puppy-cameras')
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

// ---------------------------------------------------- 1. the Cameras tier
{
  const groups = await page.locator('[data-testid="puppy-level"] select optgroup').evaluateAll((gs) => gs.map((g) => g.label))
  check('the picker has a Cameras tier', groups.some((g) => g.startsWith('Cameras')), groups.join(' | '))
  check('…five levels after Doors', LEVELS.filter((l) => l.tier === 'cameras').length === 5 && LEVELS.findIndex((l) => l.tier === 'cameras') === 30)
}

// ----------------------------------------- 2. Cameras 2: caught by a camera
{
  await pick('cameras:1')
  check('Cameras 2: the red camera starts on', (await ds('cams')) === '1')
  // Straight up the gap into the camera's row, plate untouched.
  const st = await drivePuppy(page, [{ x: 3.5, y: 4.5 }, { x: 3.5, y: 1.5 }], { timeout: 12000 })
  const caught = st.status === 'caught' || (await waitData('status', 'caught', 3000))
  const banner = await page.locator('[data-testid="puppy-caught"]').waitFor({ timeout: 1000 }).then(() => true, () => false)
  check('walking into its beam gets the dog caught — by the camera',
    caught && banner && ((await page.locator('[data-testid="puppy-caught"]').textContent()) ?? '').includes('A camera spotted you'))
  await waitData('status', 'ready', 3000)
}

// ------------------------------- 3. Cameras 2: the plate switches it off
{
  const route = decodeRoute(HINTS['cameras:1'])
  await drivePuppy(page, route.slice(0, 1), { timeout: 12000 })
  await page.waitForTimeout(150)
  check('stepping on the red plate switches the camera off', (await ds('cams')) === '0' && (await ds('sfxPlate')) === '1', await ds('cams'))
  const st = await drivePuppy(page, route.slice(1), { timeout: 20000 })
  check('…then past it: puppy freed, escaped with 3★', st.status === 'escaped' && st.pups === 1 && (await page.locator('[data-testid="puppy-escaped"]').getAttribute('data-stars')) === '3')
}

// ------------------------------- 4. Cameras 1: the hint darts under a beam
{
  await pick('cameras:0')
  check('Cameras 1: an always-on camera', (await ds('cams')) === '1')
  await page.locator('[data-testid="puppy-hint"]').click()
  await waitData('hint', '1', 2000)
  await page.locator('[data-testid="puppy-hint-speed"]').click()
  const escaped = await waitData('status', 'escaped', 15000)
  check('the hint replay times the sweep and escapes unseen', escaped && (await ds('spotted')) === '0' && (await ds('cams')) === '1')
}

await finish(browser)
