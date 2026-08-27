/**
 * Netplay suite, real transport: the compact pairing token driven through an
 * actual `RTCPeerConnection` handshake between two independent browser
 * contexts.
 *
 * `143-netplay` covers the game rules over the loopback transport; this suite
 * covers the one thing loopback cannot — that a token small enough for a QR
 * still carries everything a browser needs to open a data channel. It is the
 * end-to-end check that the SDP we throw away really was boilerplate.
 *
 * Two separate contexts, not two tabs: same-origin tabs share localStorage, so
 * a single context would let the two boards agree through redux-persist rather
 * than through the link, and the suite would pass without a network.
 *
 * mDNS is disabled via a Chromium switch. Chrome normally hides local IPs
 * behind `<uuid>.local` names, and a container has no mDNS responder to
 * resolve them with; on real devices on real wifi, mDNS resolution is exactly
 * what makes this work, and the codec carries those names (asserted in 141).
 */
import { launch, reporter, BASE_URL } from './helpers.mjs'

const { check, finish } = reporter('netplay-webrtc')
const { browser } = await launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] })

/** A fresh context (own localStorage) with one online-mode Connect 4. */
async function device(label) {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (err) => console.log(`PAGE ERROR (${label}):`, err.message))
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: /Connect 4/ }).click()
  const root = page.locator('[data-testid="connect4-root"]')
  await root.waitFor()
  await root.locator('[data-testid="connect4-mode-online"]').click()
  await page.waitForSelector('[data-testid="netplay-dialog"]')
  return { page, root }
}

const one = await device('P1')
const two = await device('P2')

// localhost is a secure context, so the WebRTC APIs are available exactly as
// they are on the deployed https page.
check(
  'WebRTC is available on both devices',
  await one.page.evaluate(() => window.isSecureContext && typeof RTCPeerConnection === 'function'),
)

// --- hop 1: the host's offer -------------------------------------------
await one.page.locator('[data-testid="netplay-host"]').click()
await one.page.waitForSelector('[data-testid="netplay-token"]', { timeout: 15000 })
const offer = (await one.page.locator('[data-testid="netplay-token"]').textContent()).trim()
check('host produced an offer token', offer.startsWith('C1o'))
check(`offer token is QR-sized (${offer.length} chars)`, offer.length < 400)
check(
  'host is waiting for the reply hop',
  (await one.root.getAttribute('data-net')) === 'pairing',
)

// --- hop 2: the guest's reply ------------------------------------------
await two.page.locator('[data-testid="netplay-code-input"]').fill(offer)
await two.page.locator('[data-testid="netplay-code-submit"]').click()
await two.page.waitForSelector('[data-testid="netplay-token"]', { timeout: 15000 })
const reply = (await two.page.locator('[data-testid="netplay-token"]').textContent()).trim()
check('guest produced a reply token', reply.startsWith('C1a'))
check(`reply token is QR-sized (${reply.length} chars)`, reply.length < 400)

await one.page.locator('[data-testid="netplay-code-input"]').fill(reply)
await one.page.locator('[data-testid="netplay-code-submit"]').click()

// --- the channel opens --------------------------------------------------
const connected = (root) =>
  root.page
    .waitForFunction(
      () =>
        document.querySelector('[data-testid="connect4-root"]')?.dataset.net === 'connected',
      null,
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    )

const upOne = await connected(one)
const upTwo = await connected(two)
check('host opened the data channel', upOne)
check('guest opened the data channel', upTwo)
check('host plays Player 1', (await one.root.getAttribute('data-seat')) === 'toy')
check('guest plays Player 2', (await two.root.getAttribute('data-seat')) === 'ninja')

// --- a move crosses the wire -------------------------------------------
if (upOne && upTwo) {
  await one.page.waitForSelector('[data-testid="netplay-dialog"]', { state: 'detached' })
  await one.root.locator('[data-testid="c4-slot-3"]').click()
  const relayed = await two.page
    .waitForFunction(
      () => document.querySelector('[data-testid="connect4-root"]')?.dataset.ply === '1',
      null,
      { timeout: 10000 },
    )
    .then(
      () => true,
      () => false,
    )
  check('a move crosses a real data channel', relayed)
  check(
    'the guest sees the turn pass to it',
    (await two.root.getAttribute('data-turn')) === 'ninja',
  )
}

await finish(browser)
