/**
 * Drone Strike combo-scoring suite. Kill-chain model (weapon-neutral —
 * shotgun pellets and laser ticks can't break it, only time and damage do):
 * each KILL bumps `combat.chain` and refreshes a COMBO_WINDOW (5 s) timer;
 * the multiplier paid on a kill is `min(chain, COMBO_MAX)` (first kill ×1,
 * a second inside the window ×2, capped ×4); the window expiring or the
 * player taking damage (enemy bolt, kamikaze contact, crash — the rig calls
 * `resetCombo` at all three sites) kills the chain. Multiplied points flow
 * into the same score the milestone hearts watch, so chains heal faster
 * too. The pure model lives on CombatState (comboKill / stepCombo /
 * resetCombo); the rig pays `t.points * comboKill(combat)` in the shared
 * applyPlayerHitEvent and publishes `data-combo` on the HUD tick.
 */
import { addStrikeWidget, createStrikePilot, launch, reporter, setStrikeAssist, setStrikeSwitch, strikeReaders, waitForWaveState } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { buildWave } from './.bundle/waveLayout.js'
import {
  COMBO_MAX,
  COMBO_WINDOW,
  comboKill,
  createCombatState,
  resetCombatState,
  resetCombo,
  stepCombo,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-combo')

// --- pure: the chain rules ---
{
  const c = createCombatState()
  check('a fresh combat state has no chain', c.chain === 0 && c.comboT === 0)
  check('the first kill pays ×1 and opens the window',
    comboKill(c) === 1 && c.chain === 1 && c.comboT === COMBO_WINDOW)
  check('a second kill inside the window pays ×2', comboKill(c) === 2)
  check('the chain climbs to the ×COMBO_MAX cap and holds', (() => {
    let last = 0
    for (let i = 0; i < 6; i++) last = comboKill(c)
    return last === COMBO_MAX && c.chain === 8
  })(), `cap=${COMBO_MAX}`)
}
{
  const c = createCombatState()
  comboKill(c)
  for (let i = 0; i < Math.ceil((COMBO_WINDOW - 0.5) * 60); i++) stepCombo(c, 1 / 60)
  check('the chain survives inside the window', c.chain === 1)
  for (let i = 0; i < 60; i++) stepCombo(c, 1 / 60)
  check('the window expiring kills the chain', c.chain === 0 && c.comboT === 0)
  comboKill(c)
  check('a kill after an expired window starts over at ×1', c.chain === 1 && comboKill(c) === 2)
}
{
  const c = createCombatState()
  comboKill(c)
  comboKill(c)
  resetCombo(c)
  check('taking damage breaks the chain immediately', c.chain === 0 && c.comboT === 0)
  comboKill(c)
  resetCombatState(c)
  check('a run reset clears the combo fields', c.chain === 0 && c.comboT === 0)
}

// --- live: boot at 0, one kill opens a ×1 chain, silence closes it ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
await setStrikeAssist(page, 'strong')
const { combat: readCombat } = strikeReaders(page)
const hud = page.locator('[data-testid="strike-hud"]')
check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('no chain at boot', (await hud.getAttribute('data-combo')) === '0')

const layout = buildWorldLayout(DEFAULT_SEED)
const w1 = buildWave(DEFAULT_SEED, 1, layout, 'easy')
const pointsByKind = new Map(w1.targets.map((t) => [t.kind, t.points]))

const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
const killed = await pilot.engage({ timeout: 90000 })
await pilot.touchEnd()
check('pilot scores a kill', killed)
if (killed) {
  const c = await readCombat()
  const combo = Number(await hud.getAttribute('data-combo'))
  check('the kill opened a chain', combo >= 1, `combo=${combo}`)
  // First kill pays base points (×1) — whatever kind died, its score must
  // be a single unmultiplied kind value from the seeded wave.
  check('the first kill paid base (×1) points',
    [...pointsByKind.values()].includes(c.score), `score=${c.score}`)
  // With the guns quiet the window expires and the chain dies.
  await page.waitForTimeout((COMBO_WINDOW + 1) * 1000)
  check('the chain dies after COMBO_WINDOW of silence',
    (await hud.getAttribute('data-combo')) === '0')
}

await finish(browser)
