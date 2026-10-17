/**
 * Puppy Rescue — the shelter (one per mode).
 *
 * Pure: `shelterModel` counts each level's puppies once per mode (a replay
 * adds nothing), a partial escape adopts only the puppies brought out, a
 * pre-shelter ≥2★ record counts the whole level, modes never mix, and the
 * ✨ "fresh" set is adopted-but-not-seen; the records reducers OR the masks
 * and mark them seen.
 *
 * Live, through `puppy-shelter` (`data-mode`/`-adopted`/`-total`/`-fresh`/
 * `-view`), `puppy-shelter-btn`, `puppy-shelter-new`, the grid's
 * `puppy-shelter-level-<i>` cards: a fresh card's Classic shelter is empty;
 * escaping level 1 adopts its puppy ("+1 new friend" on the result card,
 * which opens the shelter with one ✨ arrival); a replay adopts nothing new;
 * reopening shows no ✨; the grid's next, unfinished level card jumps there;
 * Easy has its own (empty) shelter; the 🏠 hides mid-run; Reset records
 * empties it.
 */
import { addPuppyWidget, drivePuppy, launch, reporter } from './helpers.mjs'
import { parseLevel } from './.bundle/rescueModel.js'
import { LEVELS } from './.bundle/rescueLevels.js'
import { planLevel } from './.bundle/rescuePlanner.js'
import { adoptedMask, escapedMask, levelPuppyCounts, newlyAdopted, shelterSummary } from './.bundle/shelterModel.js'
import reducer, { markRescueShelterSeen, recordRescueEscape } from './.bundle/recordsSlice.js'

const { check, finish } = reporter('puppy-shelter')

// ------------------------------------------------------------- 1. pure
{
  const counts = levelPuppyCounts()
  const total = counts.reduce((a, b) => a + b, 0)
  check('every level has puppies; the shelter totals them', counts.length === LEVELS.length && counts.every((n) => n >= 1) && total > LEVELS.length)
  const rec = (o = {}) => ({ stars: {}, bestMs: {}, escapes: 0, ...o })
  check('an empty record: nobody adopted', shelterSummary(rec(), 'classic').adopted === 0 && shelterSummary(rec(), 'classic').total === total)
  const pen = LEVELS.findIndex((l) => l.tier === 'key') // a pen level: several puppies
  const n = counts[pen]
  const id = LEVELS[pen].id
  check('a pre-shelter ≥2★ record counts the whole level', adoptedMask(rec({ stars: { [id]: 2 } }), 'classic', pen) === (1 << n) - 1)
  check('…a 1★ record alone counts nobody', adoptedMask(rec({ stars: { [id]: 1 } }), 'classic', pen) === 0)
  check('a partial escape adopts only those puppies', adoptedMask(rec({ stars: { [id]: 1 }, pups: { [id]: 0b101 } }), 'classic', pen) === 0b101)
  check('newlyAdopted counts only the new ones', newlyAdopted(rec({ pups: { [id]: 0b101 } }), 'classic', pen, 0b111) === 1)
  check('modes never mix: an Easy rescue is not in the Classic shelter',
    adoptedMask(rec({ pups: { [`easy|${id}`]: 0b1 } }), 'classic', pen) === 0 && adoptedMask(rec({ pups: { [`easy|${id}`]: 0b1 } }), 'easy', pen) === 1)
  const s = shelterSummary(rec({ pups: { [id]: 0b111 }, pupsSeen: { [id]: 0b001 } }), 'classic')
  check('the ✨ set is adopted-but-not-seen', s.adopted === 3 && s.fresh === 2 && s.levels[pen].fresh === 0b110)
  check('escapedMask reads the line at the door', escapedMask({ order: [0, 3] }) === 0b1001)
  // The reducers.
  let st = reducer(undefined, { type: '@@init' })
  st = reducer(st, recordRescueEscape({ key: id, stars: 1, ms: 9000, pups: 0b011 }))
  st = reducer(st, recordRescueEscape({ key: id, stars: 1, ms: 8000, pups: 0b110 }))
  check('the reducer ORs each escape\'s puppies in', st.puppyRescue.pups[id] === 0b111)
  st = reducer(st, markRescueShelterSeen({ [id]: 0b111 }))
  check('markRescueShelterSeen records them as seen', st.puppyRescue.pupsSeen[id] === 0b111)
}

// -------------------------------------------------------------- 2. live
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })
const sh = (k) => page.locator('[data-testid="puppy-shelter"]').evaluate((el, key) => el.dataset[key] ?? '', k)
const ds = (k) => page.locator('[data-testid="puppy-root"]').evaluate((el, key) => el.dataset[key] ?? '', k)
const openShelter = async () => {
  await page.locator('[data-testid="puppy-shelter-btn"]').click()
  await page.locator('[data-testid="puppy-shelter"]').waitFor({ timeout: 3000 })
  await page.waitForTimeout(300)
}
const closeShelter = async () => {
  await page.locator('[data-testid="puppy-shelter-close"]').click()
  await page.waitForTimeout(250)
}
const total = levelPuppyCounts().reduce((a, b) => a + b, 0)

await addPuppyWidget(page)
{
  check('ready: the 🏠 shelter button shows', (await page.locator('[data-testid="puppy-shelter-btn"]').count()) === 1)
  await openShelter()
  check('a fresh card: the Classic shelter is empty', (await sh('mode')) === 'classic' && (await sh('adopted')) === '0' && (await sh('total')) === String(total))
  check('…and its room is up', (await page.locator('[data-testid="puppy-shelter-room"] canvas').count()) === 1)
  await closeShelter()
  check('closing it returns to the level', (await page.locator('[data-testid="puppy-shelter"]').count()) === 0 && (await ds('status')) === 'ready')
}
{
  const st = await drivePuppy(page, planLevel(parseLevel(LEVELS[0])).route)
  check('(level 1 escaped)', st.status === 'escaped')
  const btn = page.locator('[data-testid="puppy-shelter-new"]')
  check('the result card announces "+1 new friend"', (await btn.count()) === 1 && (await btn.getAttribute('data-new')) === '1')
  await btn.click()
  await page.locator('[data-testid="puppy-shelter"]').waitFor({ timeout: 3000 })
  check('…and opens the shelter: 1 adopted, a ✨ new arrival', (await sh('adopted')) === '1' && (await sh('fresh')) === '1')
  await closeShelter()
  await page.locator('[data-testid="puppy-again"]').click()
  await page.waitForTimeout(300)
  const again = await drivePuppy(page, planLevel(parseLevel(LEVELS[0])).route)
  check('a replay escape adopts nobody new (no "+N" link)', again.status === 'escaped' && (await page.locator('[data-testid="puppy-shelter-new"]').count()) === 0)
  await page.locator('[data-testid="puppy-again"]').click()
  await page.waitForTimeout(300)
  await openShelter()
  check('reopened: still 1, no ✨ now it has been seen', (await sh('adopted')) === '1' && (await sh('fresh')) === '0')
  await page.locator('[data-testid="puppy-shelter-view"]').click()
  await page.waitForTimeout(200)
  check('the Levels view lists every level', (await sh('view')) === 'levels' && (await page.locator('[data-testid^="puppy-shelter-level-"]').count()) === LEVELS.length)
  const c0 = page.locator('[data-testid="puppy-shelter-level-0"]')
  const c1 = page.locator('[data-testid="puppy-shelter-level-1"]')
  check('…level 1 complete, level 2 unlocked but empty, level 3 locked',
    (await c0.getAttribute('data-adopted')) === (await c0.getAttribute('data-total')) && (await c1.getAttribute('data-adopted')) === '0' &&
      (await c1.getAttribute('data-locked')) === '0' && (await page.locator('[data-testid="puppy-shelter-level-2"]').getAttribute('data-locked')) === '1')
  await c1.click()
  await page.waitForTimeout(400)
  check('tapping the unfinished level jumps there', (await page.locator('[data-testid="puppy-shelter"]').count()) === 0 && (await ds('level')) === LEVELS[1].id && (await ds('status')) === 'ready')
}
{
  await page.locator('[data-testid="puppy-mode"] select').selectOption('easy')
  await page.waitForTimeout(250)
  await openShelter()
  check('Easy has its own shelter — empty', (await sh('mode')) === 'easy' && (await sh('adopted')) === '0')
  await closeShelter()
  await page.locator('[data-testid="puppy-mode"] select').selectOption('classic')
  await page.waitForTimeout(250)
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(200)
  await page.keyboard.up('ArrowLeft')
  check('mid-run the 🏠 is hidden', (await ds('status')) === 'play' && (await page.locator('[data-testid="puppy-shelter-btn"]').count()) === 0)
  await page.locator('[data-testid="puppy-restart"]').click()
  await page.waitForTimeout(250)
  await page.locator('[data-testid="puppy-settings"]').click()
  await page.locator('[data-testid="puppy-reset-records"]').click()
  await page.getByRole('button', { name: 'Reset records' }).click()
  await page.waitForTimeout(300)
  await openShelter()
  check('Reset records empties the shelter', (await sh('adopted')) === '0')
  await closeShelter()
}
await finish(browser)
