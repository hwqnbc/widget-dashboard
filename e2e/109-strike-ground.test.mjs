/**
 * Drone Strike ground-target suite. Pure module (deterministic): from wave 1
 * the seeded wave includes military supply trucks (`ground`) — moving road
 * vehicles bound to the city's lanes (fixed cross-coord on a road, constant
 * travel velocity via stepDrift), sitting on the deck (low y); from
 * TURRET_WAVE it includes AA turrets (`turret`); trucks are
 * difficulty-independent while turrets follow the difficulty preset
 * (hp + shared return-fire gate). From CAR_WAVE_START it also includes moving
 * `car` targets, road-bound the same way. DOM: clear wave 1 closed-loop and
 * confirm wave 2 fields the seeded target count — proof the app actually
 * spawns the seeded vehicles (101-style). The hit model is a normal
 * pos+radius sphere, covered by 100.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  CAR_WAVE_START,
  GROUND_WAVE_START,
  TURRET_WAVE,
  buildWave,
  createTargetStates,
  loadWave,
  stepDrift,
} from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-ground')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { combat } = strikeReaders(page)

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// --- pure module: military supply trucks (moving road vehicles) from wave 1 ---
const layout = buildWorldLayout(DEFAULT_SEED)
const w1 = buildWave(DEFAULT_SEED, GROUND_WAVE_START, layout)
const ground1 = w1.targets.filter((t) => t.kind === 'ground')
check('ground trucks appear from wave 1', ground1.length > 0, `n=${ground1.length}`)
check('trucks sit on the deck (low y)', ground1.every((t) => t.y <= 2), `ys=${ground1.map((t) => t.y)}`)
check('trucks die in one hit', ground1.every((t) => t.hp === 1))
check('trucks are moving road vehicles', ground1.every((t) => t.driftSpeed !== 0))
// Road-bound: the fixed cross-coordinate matches a road lane (±the 0.8 offset).
const trucksOnRoad = ground1.every((g) => {
  const alongX = g.driftAxis === 0
  const cross = alongX ? g.z : g.x
  return layout.roads.some(
    (r) => r.axis === (alongX ? 'x' : 'z') && Math.abs(cross - r.at) <= 1,
  )
})
check('trucks are bound to a road lane', trucksOnRoad)
check('no turrets before TURRET_WAVE', w1.targets.every((t) => t.kind !== 'turret'))

const wT = buildWave(DEFAULT_SEED, TURRET_WAVE, layout)
const turretsT = wT.targets.filter((t) => t.kind === 'turret')
check('AA turrets appear from TURRET_WAVE', turretsT.length > 0, `n=${turretsT.length}`)
check('turrets are static (no drift)', turretsT.every((t) => t.driftAmp === 0))
check('turrets sit on the deck (low y)', turretsT.every((t) => t.y <= 2))

// Trucks are difficulty-independent; turrets follow the preset.
const gcount = (d) =>
  buildWave(DEFAULT_SEED, 6, layout, d).targets.filter((t) => t.kind === 'ground').length
check(
  'truck count identical across difficulties',
  gcount('easy') === gcount('normal') && gcount('normal') === gcount('hard') && gcount('easy') > 0,
  `easy=${gcount('easy')} normal=${gcount('normal')} hard=${gcount('hard')}`,
)
const w6easy = buildWave(DEFAULT_SEED, 6, layout, 'easy')
const w6normal = buildWave(DEFAULT_SEED, 6, layout, 'normal')
const turEasy = w6easy.targets.filter((t) => t.kind === 'turret')
const turNormal = w6normal.targets.filter((t) => t.kind === 'turret')
check('turret hp follows difficulty', turEasy.every((t) => t.hp === 1) && turNormal.every((t) => t.hp === 2))

// Turret fire rides the shared return-fire gate: wave 5 armed on normal, held on easy.
const w5easy = buildWave(DEFAULT_SEED, 5, layout, 'easy')
const w5normal = buildWave(DEFAULT_SEED, 5, layout, 'normal')
check('wave 5 turrets hold fire on easy but shoot on normal', !w5easy.enemiesShoot && w5normal.enemiesShoot)

// --- moving cars: road-bound, constant-velocity ---
const wCar = buildWave(DEFAULT_SEED, CAR_WAVE_START, layout)
const cars = wCar.targets.filter((t) => t.kind === 'car')
check('cars appear from CAR_WAVE_START', cars.length > 0, `n=${cars.length}`)
check('cars sit on the deck (low y)', cars.every((t) => t.y <= 2))
check('cars have a travel speed', cars.every((t) => t.driftSpeed !== 0))
// Road-bound: the fixed cross-coordinate matches a road lane (±the 0.8 lane offset).
const onRoad = cars.every((c) => {
  const alongX = c.driftAxis === 0
  const cross = alongX ? c.z : c.x
  return layout.roads.some(
    (r) => r.axis === (alongX ? 'x' : 'z') && Math.abs(cross - r.at) <= 1,
  )
})
check('cars are bound to a road lane', onRoad)
// Count is difficulty-independent (pure practice, like the trucks).
const ccount = (d) =>
  buildWave(DEFAULT_SEED, 6, layout, d).targets.filter((t) => t.kind === 'car').length
check(
  'car count identical across difficulties',
  ccount('easy') === ccount('normal') && ccount('normal') === ccount('hard') && ccount('easy') > 0,
  `easy=${ccount('easy')} normal=${ccount('normal')} hard=${ccount('hard')}`,
)
// stepDrift drives the car along its road axis at constant velocity, holding the lane.
const states = createTargetStates()
loadWave(states, wCar)
const carState = states.find((s) => s.alive && s.kind === 'car')
const alongX = carState.driftAxis === 0
stepDrift(carState, 0)
const move0 = alongX ? carState.pos.x : carState.pos.z
const cross0 = alongX ? carState.pos.z : carState.pos.x
const vel0 = alongX ? carState.vel.x : carState.vel.z
stepDrift(carState, 0.5)
const move1 = alongX ? carState.pos.x : carState.pos.z
const cross1 = alongX ? carState.pos.z : carState.pos.x
check('car moves along its road axis', Math.abs(move1 - move0) > 0.1, `${move0.toFixed(2)}→${move1.toFixed(2)}`)
check('car holds its lane (cross axis fixed)', Math.abs(cross1 - cross0) < 1e-6)
check('car velocity equals its travel speed', Math.abs(vel0 - carState.driftSpeed) < 1e-6)

// The military truck rides the same road branch — drives its axis, holds lane.
const truckState = states.find((s) => s.alive && s.kind === 'ground')
const truckAlongX = truckState.driftAxis === 0
stepDrift(truckState, 0)
const tMove0 = truckAlongX ? truckState.pos.x : truckState.pos.z
const tCross0 = truckAlongX ? truckState.pos.z : truckState.pos.x
stepDrift(truckState, 0.5)
const tMove1 = truckAlongX ? truckState.pos.x : truckState.pos.z
const tCross1 = truckAlongX ? truckState.pos.z : truckState.pos.x
check('truck moves along its road axis', Math.abs(tMove1 - tMove0) > 0.1, `${tMove0.toFixed(2)}→${tMove1.toFixed(2)}`)
check('truck holds its lane (cross axis fixed)', Math.abs(tCross1 - tCross0) < 1e-6)

// --- DOM: the app fields the seeded wave-2 targets ---
const w2 = buildWave(DEFAULT_SEED, 2, layout)
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
let cleared = true
const start = Date.now()
while ((await combat()).targetsLeft > 0) {
  if (Date.now() - start > 240000) {
    cleared = false
    break
  }
  if (!(await pilot.engage({ timeout: 60000 }))) {
    cleared = false
    break
  }
}
await pilot.touchEnd()
check('wave 1 fully cleared', cleared, `targetsLeft=${(await combat()).targetsLeft}`)
check('wave 2 goes active', await waitForWaveState(page, 'active', 8000))
const c2 = await combat()
check('wave counter advanced', c2.wave === 2, `wave=${c2.wave}`)
check(
  'wave 2 fields the seeded target count',
  c2.targetsLeft === w2.targets.length,
  `app=${c2.targetsLeft} expected=${w2.targets.length}`,
)

await finish(browser)
