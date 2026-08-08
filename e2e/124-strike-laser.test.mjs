/**
 * Drone Strike laser suite. The hitscan laser + heat meter are pure
 * (`combatModel.ts`): `fireHitscan` resolves the whole origin→maxRange
 * segment on the spawn frame (earliest of building/ground/target wins, same
 * tests the projectile sweep uses), heat is on CombatState — `addHeat` per
 * shot, `stepHeat` cooling with an overheat latch cleared at HEAT_RESET
 * (hysteresis, battery-style events) — and the beam ring (`spawnLaserBeam`)
 * recycles its oldest slot. The weapon is a persisted settings pick
 * (`strike-weapon`, root `data-weapon`); the laser's cooldown is a real fire
 * tick (never 0 — per-frame fire would be frame-rate-dependent). DOM: picking
 * the laser shows the heat bar, firing raises `data-level` on the fill and
 * counts `data-sfx-zap`, and the pick survives a reload.
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  launch,
  openStrikeSettings,
  reporter,
  waitForWaveState,
} from './helpers.mjs'
import {
  BEAM_LIFE,
  HEAT_COOL,
  HEAT_MAX,
  HEAT_PER_SHOT,
  HEAT_RESET,
  LASER,
  WEAPON_SPECS,
  addHeat,
  coerceWeapon,
  createCombatState,
  createHitscanResult,
  createLaserBeams,
  fireHitscan,
  spawnLaserBeam,
  stepHeat,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-laser')

// --- pure: the spec + picker plumbing ---
check('LASER is a hitscan spec', LASER.kind === 'laser')
check('laser cooldown is a real fire tick (not per-frame)', LASER.cooldown > 0)
check('weapon table maps both ids', WEAPON_SPECS.bolt.kind === 'bolt' && WEAPON_SPECS.laser === LASER)
check('coerceWeapon accepts ids, rejects junk',
  coerceWeapon('laser') === 'laser' && coerceWeapon('bolt') === 'bolt' && coerceWeapon('plasma') === undefined)

// --- pure: heat rises, latches, recovers with hysteresis ---
const c = createCombatState()
check('gun starts cold', c.heat === 0 && !c.overheated)
addHeat(c)
check('a shot adds heat', c.heat === HEAT_PER_SHOT)
let overheatEvents = 0
for (let i = 0; i < 40 && !c.overheated; i++) {
  if (addHeat(c) === 'overheated') overheatEvents++
}
check('sustained fire trips the overheat latch once', c.overheated && overheatEvents === 1, `heat=${c.heat}`)
check('heat clamps at max', c.heat === HEAT_MAX)
// Cooling: latched until HEAT_RESET, 'ready' exactly once, then to 0.
let readyEvents = 0
let stillLatchedAboveReset = true
for (let i = 0; i < 400; i++) {
  const evt = stepHeat(c, 1 / 60)
  if (c.overheated && c.heat < HEAT_RESET - 1) stillLatchedAboveReset = false
  if (evt === 'ready') readyEvents++
}
check('latch holds until HEAT_RESET then clears once (hysteresis)',
  readyEvents === 1 && stillLatchedAboveReset, `ready=${readyEvents}`)
check('gun cools back to 0', c.heat === 0 && !c.overheated)
check('cooling outpaced by fire (heat is a real constraint)',
  HEAT_PER_SHOT / LASER.cooldown > HEAT_COOL)

// --- pure: hitscan resolution (instant, earliest hit wins) ---
const out = createHitscanResult()
const origin = { x: 0, y: 5, z: 0 }
const AHEAD = { x: 0, y: 0, z: -1 }
const targets = [
  { alive: true, pos: { x: 0, y: 5, z: -20 }, radius: 2 },
  { alive: true, pos: { x: 0, y: 5, z: -40 }, radius: 2 },
]
fireHitscan(origin, AHEAD, LASER, [], targets, out)
check('hitscan hits the nearest target on the spawn frame',
  out.hit === 'target' && out.targetIdx === 0, `hit=${out.hit} idx=${out.targetIdx}`)
check('beam ends at the sphere surface', Math.abs(out.z - -18) < 1e-6, `z=${out.z.toFixed(3)}`)
targets[0].alive = false
fireHitscan(origin, AHEAD, LASER, [], targets, out)
check('dead targets are skipped (next in line hit)', out.targetIdx === 1)
// Ground plane: aiming down ends the beam at y = 0.
const DOWN = { x: 0, y: -1, z: 0 }
fireHitscan(origin, DOWN, LASER, [], [], out)
check('ground stops the beam (world hit at y=0)', out.hit === 'world' && Math.abs(out.y) < 1e-6)
// A clear miss flies the full range.
fireHitscan(origin, { x: 0, y: 1, z: 0 }, LASER, [], [], out)
check('a miss ends at maxRange (no hit)',
  out.hit === null && Math.abs(out.y - (5 + LASER.maxRange)) < 1e-6)

// --- pure: beam ring recycles the oldest slot ---
const beams = createLaserBeams()
spawnLaserBeam(beams, 0, 0, 0, 1, 1, 1)
check('beam spawns into a free slot', beams[0].active && beams[0].ex === 1)
for (const b of beams) if (b.active) b.age = 0.05
beams[0].age = BEAM_LIFE * 0.9 // the oldest
for (let i = 1; i < beams.length; i++) spawnLaserBeam(beams, i, 0, 0, i, 0, 1)
spawnLaserBeam(beams, 99, 0, 0, 99, 0, 1) // all live → recycle the oldest
check('a full ring recycles its OLDEST beam', beams[0].sx === 99 && beams[0].age === 0)

// --- live: picker round-trip, heat bar, zap counter, persistence ---
const { browser, page } = await launch()
await addStrikeWidget(page)
const root = page.locator('[data-testid="drone-strike-root"]')
check('default weapon is the bolt', (await root.getAttribute('data-weapon')) === 'bolt')
check('no heat bar with the bolt', (await page.locator('[data-testid="strike-heat"]').count()) === 0)

await openStrikeSettings(page)
await page.locator('[data-testid="strike-weapon-laser"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('picking the laser updates the root', (await root.getAttribute('data-weapon')) === 'laser')
check('heat bar appears with the laser', (await page.locator('[data-testid="strike-heat"]').count()) === 1)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
const fill = page.locator('[data-testid="strike-heat-fill"]')
await page.keyboard.down('Space')
await page.waitForTimeout(900)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
const shots = Number(await hud.getAttribute('data-shots'))
const zaps = Number(await hud.getAttribute('data-sfx-zap'))
const heatLevel = Number(await fill.getAttribute('data-level'))
check('the laser fires on its tick', shots > 3, `shots=${shots}`)
check('laser shots play the zap voice', zaps > 0, `zaps=${zaps}`)
check('firing heats the gun (bar level rose)', heatLevel > 0, `level=${heatLevel}`)
check('sparks still fly (muzzle flash per laser shot)',
  Number(await hud.getAttribute('data-sparks')) > 0)

// Persistence: the pick survives a reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('weapon pick persists across reload',
  (await page.locator('[data-testid="drone-strike-root"]').getAttribute('data-weapon')) === 'laser')
check('heat bar still mounted after reload',
  (await page.locator('[data-testid="strike-heat"]').count()) === 1)

await finish(browser)
