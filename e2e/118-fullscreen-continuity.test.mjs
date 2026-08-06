/**
 * Full-screen continuity suite: toggling full screen must NOT restart the
 * game. The Drone game's session (score, shots, flight, wave) lives in refs,
 * so a remount zeroes it — the regression the user hit. The board now keeps a
 * single widget instance and reparents its live DOM into the overlay instead
 * of remounting, so runtime telemetry must survive an open AND a close.
 *
 * Probe: `data-shots` on the HUD is written imperatively from a ref; a remount
 * resets it to 0. We fire a few shots, then assert `data-shots` never drops
 * back below what we fired across the full-screen enter/exit. (data-world-seed
 * is persisted redux state, so it would survive even a remount — not a valid
 * continuity probe; shots is.)
 */
import {
  addStrikeWidget,
  launch,
  reporter,
  strikeReaders,
  tapFire,
  waitForWaveState,
} from './helpers.mjs'

const { check, finish } = reporter('fullscreen-continuity')
const { browser, context, page } = await launch()
await addStrikeWidget(page)

const { hud } = strikeReaders(page)
const shots = async () => parseInt(await hud.getAttribute('data-shots'), 10)
const roots = async () => await page.locator('[data-testid="drone-strike-root"]').count()
const canvases = async () => await page.locator('[data-testid="strike-canvas"]').count()

// 1. Get a live session going and put some ref-held state on the clock.
check('wave active before full screen', await waitForWaveState(page, 'active'))
await tapFire(page, context, 120)
await tapFire(page, context, 120)
await page.waitForTimeout(400)
const shotsBefore = await shots()
check('fired some shots before full screen', shotsBefore >= 1, `shots=${shotsBefore}`)
// Single live instance to begin with.
check('one widget instance in the grid', (await roots()) === 1 && (await canvases()) === 1)

// 2. Enter full screen — the same instance is reparented into the overlay.
await page.getByRole('button', { name: 'full screen Drone Strike widget' }).click()
await page.waitForTimeout(800)
check('overlay shows the widget', (await roots()) === 1)
check('still exactly one canvas (no second instance)', (await canvases()) === 1)
// The canvas now lives inside the MUI Dialog overlay (reparented out of the
// grid), proving it moved rather than a fresh copy being mounted there.
check(
  'canvas reparented into the full-screen dialog',
  await page
    .locator('.MuiDialog-root [data-testid="strike-canvas"]')
    .count() === 1,
)
const shotsInFs = await shots()
check(
  'shots preserved entering full screen (not reset to 0)',
  shotsInFs >= shotsBefore,
  `before=${shotsBefore} inFullscreen=${shotsInFs}`,
)
check('wave still active in full screen', (await hud.getAttribute('data-wave-state')) === 'active')

// Fire again while full screen — accumulates on the SAME session.
await tapFire(page, context, 120)
await page.waitForTimeout(400)
const shotsFsFired = await shots()
check('firing continues the same session in full screen', shotsFsFired >= shotsInFs)

// 3. Exit full screen — the instance reparents back to its card, uninterrupted.
await page.getByRole('button', { name: 'Exit full screen' }).click()
await page.waitForTimeout(800)
check('one widget instance after exit', (await roots()) === 1 && (await canvases()) === 1)
check(
  'canvas back out of the dialog after exit',
  (await page.locator('.MuiDialog-root [data-testid="strike-canvas"]').count()) === 0,
)
const shotsAfter = await shots()
check(
  'shots preserved after exiting full screen (game did not restart)',
  shotsAfter >= shotsFsFired,
  `inFullscreen=${shotsFsFired} after=${shotsAfter}`,
)
check('wave still active after exit', await waitForWaveState(page, 'active'))

await finish(browser)
