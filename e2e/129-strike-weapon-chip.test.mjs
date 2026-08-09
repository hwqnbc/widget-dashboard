/**
 * Drone Strike in-game weapon selector (the swipe-to-scroll chip). A chip
 * above the fire button shows the equipped gun: swiping vertically on it
 * scrolls the selection one notch per ~28 px (WeaponChip's STEP_PX — swipes
 * here use generous margins around multiples of it), wrapping at both ends;
 * a clean tap cycles to the next gun; the mouse wheel steps it; keyboard
 * 1–5 direct-selects. Every path writes the SAME persisted `weapon` field
 * as the settings picker (so picks survive reload). The chip and the root
 * both publish `data-weapon`.
 */
import {
  addStrikeWidget,
  launch,
  reporter,
  swipeChip,
  tapFire,
  waitForWaveState,
} from './helpers.mjs'
import { WEAPON_IDS } from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-weapon-chip')
const { browser, context, page } = await launch()
await addStrikeWidget(page)

const root = page.locator('[data-testid="drone-strike-root"]')
const chip = page.locator('[data-testid="strike-weapon-chip"]')
const weapon = async () => await root.getAttribute('data-weapon')

check('the chip is mounted', (await chip.count()) === 1)
check('chip and root agree on the default bolt',
  (await weapon()) === 'bolt' && (await chip.getAttribute('data-weapon')) === 'bolt')
check('WEAPON_IDS is the 5-gun scroll order', WEAPON_IDS.length === 5 && WEAPON_IDS[0] === 'bolt')

// Swipe up one notch → next weapon (bolt → laser).
await swipeChip(page, context, -40)
await page.waitForTimeout(200)
check('one up-notch scrolls to the next gun', (await weapon()) === 'laser', `got=${await weapon()}`)

// A long up-swipe scrolls several notches (laser +3 → homing).
await swipeChip(page, context, -90)
await page.waitForTimeout(200)
check('a long swipe scrolls multiple notches', (await weapon()) === 'homing', `got=${await weapon()}`)

// Swipe down one notch → previous (homing → shotgun).
await swipeChip(page, context, 40)
await page.waitForTimeout(200)
check('a down-notch scrolls back', (await weapon()) === 'shotgun', `got=${await weapon()}`)

// Keyboard direct-select: 1 = bolt … 5 = homing.
await page.keyboard.press('Digit1')
await page.waitForTimeout(150)
check('hotkey 1 selects the bolt', (await weapon()) === 'bolt')
await page.keyboard.press('Digit4')
await page.waitForTimeout(150)
check('hotkey 4 selects the shotgun', (await weapon()) === 'shotgun')

// Wrap: from bolt, one notch DOWN wraps to the end of the list (homing).
await page.keyboard.press('Digit1')
await page.waitForTimeout(150)
await swipeChip(page, context, 40)
await page.waitForTimeout(200)
check('scrolling below the first gun wraps to the last',
  (await weapon()) === WEAPON_IDS[WEAPON_IDS.length - 1], `got=${await weapon()}`)

// ...and from the last, one notch UP wraps back to the bolt.
await swipeChip(page, context, -40)
await page.waitForTimeout(200)
check('scrolling past the last gun wraps to the first', (await weapon()) === 'bolt')

// A clean tap (no movement) cycles to the next gun.
await tapFire(page, context, 60, 'strike-weapon-chip')
await page.waitForTimeout(200)
check('a tap cycles to the next gun', (await weapon()) === 'laser', `got=${await weapon()}`)

// Mouse wheel over the chip steps the selection (down = next, up = back).
const box = await chip.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.wheel(0, 120)
await page.waitForTimeout(200)
check('wheel-down steps to the next gun', (await weapon()) === 'lob', `got=${await weapon()}`)
await page.mouse.wheel(0, -120)
await page.waitForTimeout(200)
check('wheel-up steps back', (await weapon()) === 'laser')

// The gun still fires after an in-game switch, and the pick persists.
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
await tapFire(page, context, 60)
await page.waitForTimeout(400)
check('the switched gun fires', Number(await hud.getAttribute('data-shots')) > 0)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('the chip pick persists across reload (same field as settings)',
  (await page.locator('[data-testid="drone-strike-root"]').getAttribute('data-weapon')) === 'laser')

await finish(browser)
