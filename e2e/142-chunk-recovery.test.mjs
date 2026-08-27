/**
 * Lazy-chunk recovery suite (`src/utils/lazyWithReload.ts`).
 *
 * A hashed chunk dies on every deploy, and on a phone connection any one of
 * the Map route's ~800 module requests can drop — both reject the dynamic
 * import and, unhandled, blank the page. The cure is one page load, because
 * retrying the import in the same document is a NO-OP (the browser's module
 * map caches the failure); this suite pins the whole policy:
 *
 *  - a transient failure self-heals with exactly one reload, no error card;
 *  - the reload is CACHE-BUSTED (`_rv` on the document request) so a cached
 *    index.html can't hand back the same dead chunk names, and the parameter
 *    is stripped from the address bar afterwards;
 *  - a persistent failure shows the boundary's Reload card and stops there —
 *    no reload loop;
 *  - the latch is keyed per chunk AND per build, so a flag left by an older
 *    bundle can never suppress a newer bundle's recovery (the bug that made
 *    a phone tab fail forever on a fresh deploy);
 *  - the latch is cleared by a successful load.
 *
 * Every case runs in its own context — these reload games must not leak.
 */
import { BASE_URL, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('chunk-recovery')
const { browser } = await launch()

const CHUNK = /MapPageBody/
const flags = (page) =>
  page.evaluate(() =>
    Object.keys(sessionStorage).filter((k) => k.startsWith('chunk-reload:')),
  )

/** A fresh context wired with load/navigation counters and a chunk blocker. */
async function scenario({ block, seed }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const state = { chunkHits: 0, loads: 0, documents: [] }
  page.on('load', () => state.loads++)
  page.on('request', (request) => {
    if (request.resourceType() === 'document') state.documents.push(request.url())
  })
  if (seed) {
    // sessionStorage is per-origin: plant the stale latch on a cheap page
    // first, then navigate to the route under test.
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate((entry) => sessionStorage.setItem(entry[0], entry[1]), seed)
    state.loads = 0
    state.documents = []
  }
  await context.route(CHUNK, (route) => {
    state.chunkHits++
    return block(state.chunkHits) ? route.abort('failed') : route.continue()
  })
  return { context, page, state }
}

// ---- transient failure: one drop, cured by the automatic reload ----
{
  const { context, page, state } = await scenario({ block: (hit) => hit === 1 })
  await page.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
  check('a transient chunk failure self-heals', true)
  check('no error card was shown', (await page.locator('[data-testid="error-boundary"]').count()) === 0)
  check('recovery took exactly one reload', state.loads === 2, `loads ${state.loads}`)
  check('the chunk was re-requested after the reload', state.chunkHits === 2, `hits ${state.chunkHits}`)
  check('the latch is cleared by the successful load', (await flags(page)).length === 0)

  // The reload must defeat an HTTP-cached index.html, so it asks for a URL
  // the cache has never seen — and then cleans up after itself.
  const reloadDoc = state.documents[state.documents.length - 1] ?? ''
  check('the recovery reload is cache-busted', reloadDoc.includes('_rv='), reloadDoc)
  check('the cache-buster is stripped from the address bar', !page.url().includes('_rv='), page.url())
  check('the route itself is preserved', page.url().endsWith('/map'), page.url())
  await context.close()
}

// ---- persistent failure: one reload, then the card; never a loop ----
{
  const { context, page, state } = await scenario({ block: () => true })
  await page.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="error-boundary"]', { timeout: 30000 })
  check(
    'a persistent failure shows the chunk-error card',
    (await page.locator('[data-testid="error-boundary-reload"]').count()) === 1,
  )
  check('it reloaded exactly once before giving up', state.loads === 2, `loads ${state.loads}`)

  const latched = await flags(page)
  check('the reload latch is recorded', latched.length === 1, JSON.stringify(latched))
  check('the latch is keyed by chunk and build', /^chunk-reload:map:.+/.test(latched[0] ?? ''), latched[0])
  check(
    'the latch stores a timestamp (an episode), not a bare flag',
    Number.isFinite(Number(await page.evaluate((k) => sessionStorage.getItem(k), latched[0]))),
  )

  // Sit on the card: nothing may reload again on its own.
  await page.waitForTimeout(3000)
  check('the latch stops a reload loop', state.loads === 2, `loads ${state.loads}`)

  // The card's own button recovers once the chunk is reachable.
  await context.unroute(CHUNK)
  await page.locator('[data-testid="error-boundary-reload"]').click()
  await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
  check('the Reload card recovers when the chunk is reachable', true)
  check('a successful load clears the latch', (await flags(page)).length === 0)
  await context.close()
}

// ---- a latch from an OLDER build must not gag this build's recovery ----
{
  const stale = ['chunk-reload:map:2000-01-01T00:00:00.000Z', '1']
  const { context, page, state } = await scenario({ block: (hit) => hit === 1, seed: stale })
  await page.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
  check('a stale-build latch does not suppress recovery', true)
  check('recovery still ran its reload', state.loads === 2, `loads ${state.loads}`)
  const left = await flags(page)
  check('the stale-build latch is swept', !left.includes(stale[0]), JSON.stringify(left))
  await context.close()
}

await finish(browser)
