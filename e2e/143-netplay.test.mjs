/**
 * Netplay suite: two-device Connect 4 over the same wifi.
 *
 * Two halves, matching the feature's two seams:
 *
 * 1. **The pairing codec** (pure, imported straight from the bundle). A real
 *    browser SDP is ~1 kB of boilerplate; `packSdp` keeps only the five things
 *    a data channel needs and rebuilds the rest, which is what makes the QR
 *    small enough to scan. The suite round-trips real Chrome offer/answer
 *    SDPs — including the mDNS `.local` candidates Chrome emits by default —
 *    and checks the raw-SDP escape hatch still round-trips when the compact
 *    path bails.
 *
 * 2. **A real two-seat game**, driven through the in-page `loopback`
 *    transport (`?netloop=1`). Two Connect 4 widgets in one document pair with
 *    each other, so every line of the feature except the WebRTC socket itself
 *    is under test: seat assignment, move relay, the turn lock, out-of-turn
 *    rejection, the host's position sync, and a broadcast new game.
 *
 * The widget's contract is its root `data-*`: `data-net` (link status),
 * `data-seat` (which seat this device plays), `data-ply`, `data-turn`.
 */
import { launch, reporter } from './helpers.mjs'
import { packSdp, unpackToken, isCompactToken } from './.bundle/sdpCodec.js'
import {
  decodeMsg,
  encodeMsg,
  seatForRole,
  NET_VERSION,
} from './.bundle/netProtocol.js'

const { check, finish } = reporter('netplay')

// ---------------------------------------------------------------- 1. codec

/** A Chrome data-channel offer, mDNS host candidates and all. */
const OFFER_SDP = [
  'v=0',
  'o=- 8331981665222417884 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1829768570 1 udp 2122260223 8bf4f4b9-1c2e-4f37-9d21-6a3c9f0e1a55.local 54321 typ host generation 0 network-id 1',
  'a=candidate:1829768571 1 udp 2122194687 192.168.1.42 54322 typ host generation 0 network-id 2',
  'a=ice-ufrag:Xk3P',
  'a=ice-pwd:8mLq2Rz7Yb1Nc4Vd6Tf9Wg0H',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
].join('\r\n')

const token = packSdp(OFFER_SDP, 'offer')
check('offer packs to a compact token', isCompactToken(token))
check(
  `compact token stays QR-sized (${token.length} chars)`,
  token.length < 300,
  `${token.length} chars vs ${OFFER_SDP.length} of raw SDP`,
)

const back = unpackToken(token)
check('token unpacks as an offer', back?.kind === 'offer')
check('ICE ufrag survives', back?.sdp.includes('a=ice-ufrag:Xk3P'))
check('ICE password survives', back?.sdp.includes('a=ice-pwd:8mLq2Rz7Yb1Nc4Vd6Tf9Wg0H'))
check(
  'DTLS fingerprint survives',
  back?.sdp.includes(
    'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  ),
)
check('setup role survives', back?.sdp.includes('a=setup:actpass'))
check(
  'mDNS candidate survives verbatim',
  back?.sdp.includes('8bf4f4b9-1c2e-4f37-9d21-6a3c9f0e1a55.local 54321 typ host'),
)
check('IPv4 host candidate survives', back?.sdp.includes('192.168.1.42 54322 typ host'))
check(
  'rebuilt SDP carries the data-channel m-line',
  back?.sdp.includes('m=application 9 UDP/DTLS/SCTP webrtc-datachannel'),
)

// An answer is the same shape with the other setup role.
const answerToken = packSdp(OFFER_SDP.replace('a=setup:actpass', 'a=setup:active'), 'answer')
const answer = unpackToken(answerToken)
check('answer round-trips as an answer', answer?.kind === 'answer')
check('answer keeps its active role', answer?.sdp.includes('a=setup:active'))

// Anything the compact path can't represent falls back to a raw token rather
// than to a subtly wrong compact one.
const oddball = packSdp(OFFER_SDP.replace('sha-256', 'sha-512'), 'offer')
check('an unexpected fingerprint falls back to raw', !isCompactToken(oddball))
const oddballBack = unpackToken(oddball)
check('the raw fallback still round-trips exactly', oddballBack?.sdp.includes('sha-512'))

const noCandidates = packSdp(
  OFFER_SDP.split('\r\n')
    .filter((l) => !l.startsWith('a=candidate:'))
    .join('\r\n'),
  'offer',
)
check('an SDP with no host candidates falls back to raw', !isCompactToken(noCandidates))

for (const junk of ['', 'hello', 'C1o~short', 'C1o~a~b~zz~a~4,1.2.3.4,99', 'C9o~x']) {
  check(`garbage token rejected: ${JSON.stringify(junk)}`, unpackToken(junk) === null)
}

// ------------------------------------------------------------- 2. protocol

check('seats: host is Player 1', seatForRole('host') === 'toy')
check('seats: guest is Player 2', seatForRole('guest') === 'ninja')
check(
  'a move round-trips',
  decodeMsg(encodeMsg({ t: 'move', seat: 'toy', ply: 3, move: 4 }))?.move === 4,
)
check('hello carries the protocol version', decodeMsg(encodeMsg({ t: 'hello', v: NET_VERSION }))?.v === NET_VERSION)
// A hello from a DIFFERENT version must still decode — the mismatch is the
// link's to report. Rejecting it as malformed would turn a fixable "reload
// both devices" into unexplained silence.
check('a foreign version still decodes', decodeMsg('{"t":"hello","v":99}')?.v === 99)
for (const bad of [
  '{}',
  'not json',
  '{"t":"move","seat":"bob","ply":1,"move":2}',
  '{"t":"move","seat":"toy","ply":-1,"move":2}',
  '{"t":"move","seat":"toy","ply":1.5,"move":2}',
  '{"t":"new","first":"x"}',
]) {
  check(`malformed message rejected: ${bad}`, decodeMsg(bad) === null)
}

// -------------------------------------------------- 3. two seats, one wifi

const { browser, page } = await launch()

// `?netloop=1` swaps WebRTC for the in-page transport; everything else in the
// feature is the production path.
await page.goto(`${process.env.E2E_BASE_URL ?? 'http://localhost:5199/'}?netloop=1`, {
  waitUntil: 'networkidle',
})
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: /Connect 4/ }).click()
}
const roots = page.locator('[data-testid="connect4-root"]')
await roots.nth(1).waitFor()
check('two Connect 4 widgets on the board', (await roots.count()) === 2)

const A = roots.nth(0)
const B = roots.nth(1)
const attr = (w, name) => w.getAttribute(name)
const ply = async (w) => parseInt(await attr(w, 'data-ply'), 10)

check('link is off outside online mode', (await attr(A, 'data-net')) === 'off')

// A hosts.
await A.locator('[data-testid="connect4-mode-online"]').click()
await page.waitForSelector('[data-testid="netplay-dialog"]')
await page.locator('[data-testid="netplay-host"]').click()
await page.waitForSelector('[data-testid="netplay-token"]')
const code = (await page.locator('[data-testid="netplay-token"]').textContent()).trim()
check('host produced a pairing code', code.length > 0)
await page.locator('[data-testid="netplay-close"]').click()
await page.waitForSelector('[data-testid="netplay-dialog"]', { state: 'detached' })
check('host is waiting to pair', (await attr(A, 'data-net')) === 'pairing')

// B joins with it.
await B.locator('[data-testid="connect4-mode-online"]').click()
await page.waitForSelector('[data-testid="netplay-dialog"]')
await page.locator('[data-testid="netplay-code-input"]').fill(code)
await page.locator('[data-testid="netplay-code-submit"]').click()
await page.waitForSelector('[data-testid="netplay-connected"]')
// The dialog bows out on its own once the link is up.
await page.waitForSelector('[data-testid="netplay-dialog"]', { state: 'detached' })

check('host reports connected', (await attr(A, 'data-net')) === 'connected')
check('guest reports connected', (await attr(B, 'data-net')) === 'connected')
check('host takes Player 1', (await attr(A, 'data-seat')) === 'toy')
check('guest takes Player 2', (await attr(B, 'data-seat')) === 'ninja')

// Toy opens, so the host moves first and the guest's board is locked.
const col = (w, c) => w.locator(`[data-testid="c4-slot-${c}"]`)
await col(B, 3).click()
await page.waitForTimeout(150)
check('guest cannot move out of turn', (await ply(B)) === 0 && (await ply(A)) === 0)

await col(A, 3).click()
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="connect4-root"]')[1]?.dataset.ply === '1',
  null,
  { timeout: 3000 },
)
check('host move relays to the guest', (await ply(B)) === 1)
check('turn passes to Player 2 on both', (await attr(A, 'data-turn')) === 'ninja')
check('guest agrees whose turn it is', (await attr(B, 'data-turn')) === 'ninja')

await col(A, 4).click()
await page.waitForTimeout(150)
check('host cannot move twice', (await ply(A)) === 1)

await col(B, 4).click()
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="connect4-root"]')[0]?.dataset.ply === '2',
  null,
  { timeout: 3000 },
)
check('guest move relays back to the host', (await ply(A)) === 2 && (await ply(B)) === 2)

// A win still resolves on both devices: finish toy's vertical four in column 3.
for (const [w, c] of [
  [A, 3],
  [B, 5],
  [A, 3],
  [B, 5],
  [A, 3],
]) {
  await col(w, c).click()
  await page.waitForTimeout(200)
}
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="connect4-root"]')].every(
      (el) => el.dataset.winner === 'toy',
    ),
  null,
  { timeout: 3000 },
)
check('both devices agree on the winner', (await attr(B, 'data-winner')) === 'toy')

// New game is a broadcast, from either side.
await B.getByRole('button', { name: 'New game' }).click()
await page.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="connect4-root"]')].every(
      (el) => el.dataset.ply === '0' && el.dataset.winner === '',
    ),
  null,
  { timeout: 3000 },
)
check('new game clears both boards', (await ply(A)) === 0 && (await ply(B)) === 0)

// Leaving online mode drops the link rather than leaving it half-alive.
// (Re-tapping the selected toggle is a no-op by design — an exclusive
// ToggleButtonGroup reports null, and the widget ignores it rather than
// dumping the player into an unnamed mode.)
await A.getByRole('button', { name: '2-Player' }).click()
await page.waitForTimeout(250)
check('leaving online mode releases the link', (await attr(A, 'data-net')) === 'off')

await finish(browser)
