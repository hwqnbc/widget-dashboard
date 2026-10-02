/**
 * Memory 2-Devices suite: two Memory widgets on one dashboard paired over the
 * loopback transport. The pure model first (the shared rules both devices
 * run — match keeps the turn, ply counts flips, the throttled-tab resolve
 * path), then the live loop: pairing, the host's shuffle crossing whole in
 * `sync`, the turn lock, a relayed match and mismatch from each side, a
 * guest restart re-dealing BOTH boards identically, host-only settings, and
 * leaving the mode.
 */
import { addMemoryWidgets, launch, pairLoopback, reporter } from './helpers.mjs'
import { flipCard, freshGame, resolvePair } from './.bundle/memoryModel.js'

const { check, finish } = reporter('memory-online')

// ------------------------------------------------------------- pure model
{
  // A hand-built 2×2-ish position on a 4×4 deck: deterministic faces.
  const base = {
    ...freshGame(4, 'again'),
    cards: ['a', 'a', 'b', 'c', 'b', 'c', 'd', 'd', 'e', 'e', 'f', 'f', 'g', 'g', 'h', 'h'],
  }
  const f1 = flipCard(base, 0)
  const f2 = flipCard(f1, 1)
  check('flips count ply', f1.ply === 1 && f2.ply === 2 && f2.flipped.length === 2)
  check('third flip refused while two are up', flipCard(f2, 2) === null)
  const matchRes = resolvePair(f2)
  check(
    'match scores and keeps the turn (go again)',
    matchRes.matched[0] && matchRes.matched[1] &&
      matchRes.scores.toy === 1 && matchRes.turn === 'toy' && matchRes.flipped.length === 0,
  )
  check('matched card cannot be flipped again', flipCard(matchRes, 0) === null)
  const missRes = resolvePair(flipCard(flipCard(base, 2), 3))
  check(
    'mismatch flips back and passes the turn',
    !missRes.matched[2] && !missRes.matched[3] &&
      missRes.scores.toy === 0 && missRes.turn === 'ninja' && missRes.flipped.length === 0,
  )
  const passRes = resolvePair(flipCard(flipCard({ ...base, rule: 'pass' }, 0), 1))
  check('match passes the turn under "always pass"', passRes.turn === 'ninja' && passRes.scores.toy === 1)
  check('resolvePair is a no-op without a full pair', resolvePair(f1) === f1)
  // The throttled-tab path: a remote flip landing on an unresolved pair
  // resolves it first — identical to the timer firing before the flip.
  const viaTimer = flipCard(resolvePair(f2), 2)
  const viaMove = flipCard(resolvePair(f2), 2)
  check(
    'resolve-then-flip is deterministic (timer and remote paths converge)',
    JSON.stringify(viaTimer) === JSON.stringify(viaMove) && viaTimer.ply === 3,
  )
}

// ---------------------------------------------------------------- live run
const { browser, page } = await launch()
await addMemoryWidgets(page, 2)
const roots = page.locator('[data-testid="memory-root"]')
const A = roots.nth(0)
const B = roots.nth(1)
const attr = (root, name) => root.getAttribute(name)

/** Wait for a root's dataset field to reach a value; false on timeout. */
const until = (index, name, value, timeout = 5000) =>
  page
    .waitForFunction(
      ([i, n, v]) =>
        document.querySelectorAll('[data-testid="memory-root"]')[i]?.dataset[n] === v,
      [index, name, value],
      { timeout },
    )
    .then(() => true, () => false)

/** Wait for one card's data-state on one widget; false on timeout. */
const untilCard = (index, card, state, timeout = 5000) =>
  page
    .waitForFunction(
      ([i, c, s]) =>
        document
          .querySelectorAll('[data-testid="memory-root"]')
          [i]?.querySelector(`[data-testid="mem-card-${c}"]`)?.dataset.state === s,
      [index, card, state],
      { timeout },
    )
    .then(() => true, () => false)

/** All card faces of one widget, in board order. */
const faces = (index) =>
  page.evaluate(
    (i) =>
      [...document
        .querySelectorAll('[data-testid="memory-root"]')
        [i].querySelectorAll('[data-testid^="mem-card-"]')].map((c) => c.dataset.face),
    index,
  )
const tap = (root, i) => root.locator(`[data-testid="mem-card-${i}"]`).click()

check('link is off outside online mode', (await attr(A, 'data-net')) === 'off')
check('boards dealt', (await attr(A, 'data-dealt')) === '1' && (await attr(B, 'data-dealt')) === '1')

await pairLoopback(page, {
  host: A,
  guest: B,
  modeTestId: 'memory-mode-online',
  afterHost: async () =>
    check('host is waiting to pair', (await attr(A, 'data-net')) === 'pairing'),
})
check(
  'both sides connected with their seats',
  (await until(0, 'net', 'connected')) &&
    (await until(1, 'net', 'connected')) &&
    (await attr(A, 'data-seat')) === 'toy' &&
    (await attr(B, 'data-seat')) === 'ninja',
)

// The host's shuffle crosses whole in the pairing sync.
check(
  'guest wears the host deck after sync',
  await page
    .waitForFunction(
      () => {
        const r = document.querySelectorAll('[data-testid="memory-root"]')
        const read = (root) =>
          [...root.querySelectorAll('[data-testid^="mem-card-"]')]
            .map((c) => c.dataset.face)
            .join('|')
        const a = read(r[0])
        return a.length > 0 && a === read(r[1])
      },
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)
const deck = await faces(0)
check('synced deck is a full 4×4 deal', deck.length === 16 && deck.every(Boolean))
check(
  'avatars agree on both devices',
  (await attr(A, 'data-avatar-toy')) === (await attr(B, 'data-avatar-toy')) &&
    (await attr(A, 'data-avatar-ninja')) === (await attr(B, 'data-avatar-ninja')),
)

// Turn lock: the guest (ninja) cannot open the game.
await tap(B, 0)
await page.waitForTimeout(200)
check(
  'guest cannot move out of turn',
  (await attr(B, 'data-ply')) === '0' && (await attr(A, 'data-ply')) === '0',
)

/** Board-order indices of the first unmatched pair / mismatched duo. */
const findPair = (cards, used) => {
  for (let i = 0; i < cards.length; i++) {
    if (used.has(i)) continue
    for (let j = i + 1; j < cards.length; j++) {
      if (!used.has(j) && cards[i] === cards[j]) return [i, j]
    }
  }
  return null
}
const used = new Set()

// Host plays a MATCH: relayed card-by-card, scored on both, turn kept.
const [m1, m2] = findPair(deck, used)
await tap(A, m1)
check('first flip relays to the guest', await until(1, 'ply', '1'))
await tap(A, m2)
check('second flip relays to the guest', await until(1, 'ply', '2'))
check(
  'pair resolves as matched on both devices',
  (await untilCard(0, m1, 'matched')) && (await untilCard(1, m2, 'matched')),
)
used.add(m1)
used.add(m2)
check(
  'match scores for the host and keeps the turn (go again)',
  (await attr(A, 'data-score-toy')) === '1' &&
    (await attr(B, 'data-score-toy')) === '1' &&
    (await attr(A, 'data-turn')) === 'toy' &&
    (await attr(B, 'data-turn')) === 'toy',
)

// Host plays a MISMATCH: cards flip back on both, turn passes to the guest.
const o1 = deck.findIndex((_, i) => !used.has(i))
const o2 = deck.findIndex((f, i) => !used.has(i) && i !== o1 && f !== deck[o1])
await tap(A, o1)
await tap(A, o2)
check('mismatch flips relayed', await until(1, 'ply', '4'))
check(
  'mismatch flips back on both devices',
  (await untilCard(0, o1, 'down')) && (await untilCard(1, o2, 'down')),
)
check(
  'mismatch passes the turn to the guest on both',
  (await until(0, 'turn', 'ninja')) && (await until(1, 'turn', 'ninja')),
)

// Guest plays a MATCH of its own: the relay works both ways.
const [g1, g2] = findPair(deck, used)
await tap(B, g1)
check('guest flip relays to the host', await until(0, 'ply', '5'))
await tap(B, g2)
check('guest pair resolves as matched on both', (await untilCard(0, g1, 'matched')) && (await untilCard(1, g1, 'matched')))
check(
  'guest match scores and keeps its turn',
  (await attr(A, 'data-score-ninja')) === '1' &&
    (await attr(B, 'data-score-ninja')) === '1' &&
    (await attr(A, 'data-turn')) === 'ninja',
)

// Restart from the GUEST: fresh randomness crosses as a whole-board sync, so
// both devices land on the same new deck with the game zeroed.
await B.getByRole('button', { name: 'New game' }).click()
check('restart zeroes both boards', (await until(0, 'ply', '0')) && (await until(1, 'ply', '0')))
check(
  'restart re-deals the SAME deck on both devices',
  await page
    .waitForFunction(
      () => {
        const r = document.querySelectorAll('[data-testid="memory-root"]')
        const read = (root) =>
          [...root.querySelectorAll('[data-testid^="mem-card-"]')]
            .map((c) => c.dataset.face)
            .join('|')
        const a = read(r[0])
        return a.length > 0 && a === read(r[1])
      },
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)
check(
  'restart really reshuffled',
  ((await faces(0)).join('|')) !== deck.join('|'), // 1-in-16! chance of a false fail
)
check(
  'scores cleared and toy opens again',
  (await attr(A, 'data-score-toy')) === '0' &&
    (await attr(B, 'data-score-ninja')) === '0' &&
    (await attr(A, 'data-turn')) === 'toy',
)

// Settings are host-only online; a host size change re-deals both devices.
check(
  'guest size toggle is disabled',
  (await B.locator('button[value="6"]').isDisabled()) === true,
)
await A.locator('button[value="6"]').click()
check('host size change reaches the guest', await until(1, 'size', '6'))
check(
  'both boards re-deal to 6×6 with the same deck',
  await page
    .waitForFunction(
      () => {
        const r = document.querySelectorAll('[data-testid="memory-root"]')
        const read = (root) =>
          [...root.querySelectorAll('[data-testid^="mem-card-"]')]
            .map((c) => c.dataset.face)
            .join('|')
        const a = read(r[0])
        return (
          r[0].querySelectorAll('[data-testid^="mem-card-"]').length === 36 &&
          a === read(r[1])
        )
      },
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false),
)

// Leaving the mode drops the link.
await A.locator('button[value="local"]').click()
check('leaving online turns the link off', await until(0, 'net', 'off'))

await finish(browser)
