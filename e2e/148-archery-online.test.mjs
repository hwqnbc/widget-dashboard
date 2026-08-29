/**
 * Archery over two devices — the netplay layer's first REAL-VALUED move.
 *
 * Every earlier consumer's move was an index (a column, a cell); a shot is a
 * launch vector plus the animation phases its outcome depends on. The design
 * under test: QUANTIZE at release (`packShot` → one safe integer riding the
 * protocol's existing `move: number`, no protocol change), then resolve with
 * the same fixed-step `resolveShot` on both devices — identical ints in,
 * identical outcome out. rAF-sampled hit detection could never promise that;
 * the pure resolver is what makes archery online possible at all.
 *
 * The live half aims CLOSED-LOOP, like the maze suites: it reads the live
 * state off the DOM, scans for a shot with the bundled resolver, inverts it
 * into the slingshot drag (drag = -v/K), and fires it — so a "hit" assertion
 * is a real flight, not a canned fixture. Scans demand a ±3-unit margin so
 * pixel rounding in the drag cannot flip a marginal outcome.
 *
 * This is also Archery's first e2e coverage, so one local pass-and-play check
 * rides along: the same scanned drag scores without any link.
 */
import { addArcheryWidgets, dragShot, launch, pairLoopback, reporter } from './helpers.mjs'
import {
  GAP,
  K,
  VMAX,
  WIN,
  dealHeightsFrom,
  packShot,
  resolveShot,
  unpackShot,
  windAt,
  worldW,
} from './.bundle/archeryModel.js'

const { check, finish } = reporter('archery-online')

// ------------------------------------------------------------ 1. the codec

const parts = { vx: 433, vy: -287, shooterY: 142, oppPhase: 1.234, obstaclePhase: null }
const packed = packShot(parts)
check('a shot packs to one safe integer', Number.isSafeInteger(packed) && packed >= 0)
const back = unpackShot(packed)
check('velocity round-trips exactly (already integral)', back.vx === 433 && back.vy === -287)
check('launch height round-trips', back.shooterY === 142)
check('a phase round-trips within its 9ms step', Math.abs(back.oppPhase - 1.234) < 0.03)
check('a missing phase stays missing', back.obstaclePhase === null)

const extremes = packShot({ vx: -VMAX, vy: VMAX, shooterY: 255, oppPhase: 6.2, obstaclePhase: 0 })
const exBack = unpackShot(extremes)
check(
  'extremes survive the packing',
  exBack.vx === -VMAX && exBack.vy === VMAX && exBack.shooterY === 255 && exBack.obstaclePhase !== null,
)
check('garbage rejects: negative', unpackShot(-5) === null)
check('garbage rejects: unsafe', unpackShot(2 ** 53) === null)
// Idempotence: re-packing an unpacked shot is the identity — the shooter fires
// the QUANTIZED vector, so what flew is exactly what the wire carries.
check('pack(unpack(x)) is the identity', packShot(unpackShot(packed)) === packed)

// ------------------------------------------------------- 2. the pure model

check(
  'heights deal deterministically from a seed',
  JSON.stringify(dealHeightsFrom(777)) === JSON.stringify(dealHeightsFrom(777)),
)
check(
  'dealt heights keep the minimum gap',
  [1, 2, 3, 4, 5].every((s) => {
    const h = dealHeightsFrom(s * 999)
    return Math.abs(h.p1y - h.p2y) >= GAP
  }),
)
check('wind derives deterministically', windAt(42, 3) === windAt(42, 3))
check(
  'wind varies by shot',
  new Set([0, 1, 2, 3, 4].map((i) => windAt(42, i))).size > 1,
)

/** Scan for a launch whose outcome holds across a ±3-unit margin — pixel
 * rounding in a CDP drag must not be able to flip it. */
function scanShot(w, shooter, heights, wind, wantHit) {
  const dir = shooter === 'toy' ? 1 : -1
  for (let vy = -430; vy <= -80; vy += 6) {
    for (let mag = 140; mag <= 600; mag += 6) {
      const vx = dir * mag
      if (Math.hypot(vx, vy) > VMAX - 4) continue
      let ok = true
      for (const [ox, oy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const r = resolveShot({
          w,
          shooter,
          vx: vx + ox,
          vy: vy + oy,
          shooterY: shooter === 'toy' ? heights.p1y : heights.p2y,
          oppFeetY: shooter === 'toy' ? heights.p2y : heights.p1y,
          oppPhase: null,
          wind,
          obstaclePhase: null,
        })
        if (r.hit !== wantHit || r.tEnd > 4) {
          ok = false
          break
        }
      }
      if (ok) return { vx, vy }
    }
  }
  return null
}

const w0 = worldW('short')
const h0 = dealHeightsFrom(12345)
const probeHit = scanShot(w0, 'toy', h0, 0, true)
const probeMiss = scanShot(w0, 'ninja', h0, 0, false)
check('a robust hit exists to scan for', probeHit !== null)
check('a robust miss exists to scan for', probeMiss !== null)
const det = resolveShot({
  w: w0, shooter: 'toy', vx: probeHit.vx, vy: probeHit.vy,
  shooterY: h0.p1y, oppFeetY: h0.p2y, oppPhase: null, wind: 0, obstaclePhase: null,
})
check('resolution is deterministic', det.hit === true && det.tEnd > 0)

// ------------------------------------------------------------- 3. two devices

const { browser, context, page } = await launch()
await addArcheryWidgets(page, 2)

const roots = page.locator('[data-testid="archery-root"]')
check('two Archery widgets on the board', (await roots.count()) === 2)
const A = roots.nth(0)
const B = roots.nth(1)
const attr = (r, name) => r.getAttribute(name)
const num = async (r, name) => parseInt(await attr(r, name), 10)
/** Wait for BOTH boards to be still (no arrow in flight, no replay running) —
 * `locked` includes the flying arrow, so a drag during a replay is refused. */
const bothStill = () =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid="archery-root"]')].every(
        (el) => el.dataset.arrow === 'none',
      ),
    null,
    { timeout: 15000 },
  )
// NB: `name` is a DATASET key, so hyphenated attributes camelCase
// (data-score-toy → scoreToy).
const until = (index, name, value, timeout = 10000) =>
  page.waitForFunction(
    ([i, n, v]) => document.querySelectorAll('[data-testid="archery-root"]')[i]?.dataset[n] === v,
    [index, name, value],
    { timeout },
  )

await pairLoopback(page, { host: A, guest: B, modeTestId: 'archery-play-online' })
check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')

// The host's sync carries its whole dealt world.
await page.waitForFunction(
  () => {
    const [a, b] = document.querySelectorAll('[data-testid="archery-root"]')
    return a && b && a.dataset.gameSeed === b.dataset.gameSeed
  },
  null,
  { timeout: 5000 },
)
const svg = (r) => r.locator('svg[data-w]')
check(
  "the guest adopted the host's archer heights",
  (await svg(B).getAttribute('data-p1y')) === (await svg(A).getAttribute('data-p1y')) &&
    (await svg(B).getAttribute('data-p2y')) === (await svg(A).getAttribute('data-p2y')),
)

// Live world, read off the DOM — the suite aims with the widget's own maths.
const world = {
  w: parseFloat(await svg(A).getAttribute('data-w')),
  p1y: parseFloat(await svg(A).getAttribute('data-p1y')),
  p2y: parseFloat(await svg(A).getAttribute('data-p2y')),
}
check('default mode is calm (wind 0)', (await svg(A).getAttribute('data-wind')) === '0')

// Toy opens: a guest drag is dead.
const guestPoke = scanShot(world.w, 'ninja', world, 0, false)
await dragShot(page, context, { vx: guestPoke.vx, vy: guestPoke.vy, index: 1, k: K })
await page.waitForTimeout(400)
check('the guest cannot shoot out of turn', (await num(B, 'data-shots')) === 0)

// The host fires a scanned, guaranteed hit.
const hit = scanShot(world.w, 'toy', world, 0, true)
check('a robust hit exists on the live world', hit !== null)
await dragShot(page, context, { vx: hit.vx, vy: hit.vy, index: 0, k: K })
await until(1, 'shots', '1')
check('the shot relays as one packed integer', (await num(B, 'data-shots')) === 1)
check(
  'the score agrees on both devices',
  (await attr(A, 'data-score-toy')) === '1' && (await attr(B, 'data-score-toy')) === '1',
)
check('the turn passes on both', (await attr(A, 'data-turn')) === 'ninja' && (await attr(B, 'data-turn')) === 'ninja')

// The guest fires a scanned, guaranteed miss — once both replays have landed.
await bothStill()
const miss = scanShot(world.w, 'ninja', world, 0, false)
await dragShot(page, context, { vx: miss.vx, vy: miss.vy, index: 1, k: K })
await until(0, 'shots', '2')
check('the miss relays too', (await num(A, 'data-shots')) === 2)
check(
  'and scores nothing on either device',
  (await attr(A, 'data-score-ninja')) === '0' && (await attr(B, 'data-score-ninja')) === '0',
)
check('the turn returns to the host', (await attr(A, 'data-turn')) === 'toy')

// A restart needs fresh randomness, so it is a whole-position sync — from
// EITHER side; the guest presses it here.
await bothStill()
const oldSeed = await attr(B, 'data-game-seed')
await B.getByRole('button', { name: 'New game' }).click()
await page.waitForFunction(
  ([prev]) => {
    const [a, b] = document.querySelectorAll('[data-testid="archery-root"]')
    return a && b && a.dataset.gameSeed === b.dataset.gameSeed && b.dataset.gameSeed !== prev
  },
  [oldSeed],
  { timeout: 5000 },
)
check('a guest restart re-deals BOTH devices identically', true)
check('the restart cleared the shots on both', (await num(A, 'data-shots')) === 0 && (await num(B, 'data-shots')) === 0)

// Leaving the mode releases the link (fresh board — no confirm needed).
await A.locator('[data-testid="archery-play-local"]').click()
await page.waitForTimeout(300)
check('leaving 2 Devices releases the link', (await attr(A, 'data-net')) === 'off')

// ------------------------------------------- 4. local pass-and-play still works

// Same physics, no link: a scanned hit scores when its arrow lands.
const lw = {
  w: parseFloat(await svg(A).getAttribute('data-w')),
  p1y: parseFloat(await svg(A).getAttribute('data-p1y')),
  p2y: parseFloat(await svg(A).getAttribute('data-p2y')),
}
const localHit = scanShot(lw.w, 'toy', lw, 0, true)
check('a robust hit exists on the local board', localHit !== null)
await bothStill()
await dragShot(page, context, { vx: localHit.vx, vy: localHit.vy, index: 0, k: K })
await until(0, 'scoreToy', '1', 12000)
check('local play scores at the arrow, same resolver', (await attr(A, 'data-score-toy')) === '1')
check(`first to ${WIN} still the rule`, WIN === 5)

await finish(browser)
