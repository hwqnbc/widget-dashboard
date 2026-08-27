import { lazy, type ComponentType } from 'react'

/**
 * Identity of the bundle this code was built into. Every deploy changes it,
 * so a latch written by an older bundle can never gag a newer one.
 * `typeof` keeps it safe where the define isn't applied (plain esbuild).
 */
const BUILD = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'dev'
const FLAG_PREFIX = 'chunk-reload:'
/**
 * How long one recovery reload speaks for. Inside the window a second
 * failure is the SAME episode (the reload didn't help — stop, show the
 * card, never loop). Outside it, this is a new episode minutes later, and
 * a phone that dropped one request twice in a session deserves another go.
 */
const RELOAD_WINDOW_MS = 60_000
/** Cache-buster on the recovery reload — see `reloadFresh`. */
const BUST_PARAM = '_rv'

const flagKey = (key: string) => `${FLAG_PREFIX}${key}:${BUILD}`

/** True when this chunk already burned its reload in the current episode. */
function readFlag(key: string, now = Date.now()): boolean {
  try {
    const stored = sessionStorage.getItem(flagKey(key))
    if (stored == null) return false
    const at = Number(stored)
    // A malformed value (an older build's '1') must not latch forever.
    if (!Number.isFinite(at)) return false
    return now - at < RELOAD_WINDOW_MS
  } catch {
    return false // storage unavailable — treat as "not yet reloaded"
  }
}

function setFlag(key: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(flagKey(key), String(now))
    // Sweep latches left by other builds. Without this a single bad episode
    // poisons the tab: sessionStorage outlives many deploys (a phone can
    // hold a tab open for weeks), and a stale flag would send every later
    // failure straight to the error card with no reload attempted.
    for (const stored of Object.keys(sessionStorage)) {
      if (stored.startsWith(FLAG_PREFIX) && !stored.endsWith(`:${BUILD}`)) {
        sessionStorage.removeItem(stored)
      }
    }
  } catch {
    /* storage unavailable */
  }
}

function clearFlag(key: string): void {
  try {
    sessionStorage.removeItem(flagKey(key))
  } catch {
    /* storage unavailable */
  }
}

/**
 * Reload onto a URL the HTTP cache has never seen. GitHub Pages serves
 * index.html with `max-age=600`, so a plain `location.reload()` can be
 * answered from cache — handing back the very same stale document, with the
 * very same dead chunk hashes, and burning the one reload we allow
 * ourselves. A unique query parameter forces a real fetch; `replace` keeps
 * it out of the history stack, and `stripBustParam` tidies the address bar
 * once the fresh document is running.
 */
function reloadFresh(): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(BUST_PARAM, String(Date.now()))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}

function stripBustParam(): void {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(BUST_PARAM)) return
    url.searchParams.delete(BUST_PARAM)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* history unavailable — a visible query parameter is harmless */
  }
}

if (typeof window !== 'undefined') stripBustParam()

/**
 * Load a lazy chunk, recovering from the two ways it fails in the wild.
 *
 * 1. **A transient fetch failure.** The Map route alone pulls ~800 module
 *    files; on a phone connection any one of them can drop, and the whole
 *    dynamic import rejects.
 * 2. **A stale deploy.** Hashed chunk filenames change on every deploy, so a
 *    browser holding a cached index.html (or a tab opened before the deploy)
 *    asks for a chunk that no longer exists — Safari: "Importing a module
 *    script failed", Chrome: "Failed to fetch dynamically imported module".
 *
 * Both get the same cure, and it has to be a page load: **retrying the
 * import in the same document is a no-op**, because the browser's module
 * map remembers the failure for the document's lifetime and hands back the
 * same rejection without touching the network (measured — a second `load()`
 * issues no request, in dev and in the production build alike). So: reload
 * once, onto a cache-busted URL, latched per chunk AND per build so the
 * reload can neither loop nor gag a later deploy's recovery. If the fresh
 * document fails too, rethrow so the ErrorBoundary shows its chunk-error
 * card.
 */
async function loadWithRecovery<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
  key: string,
): Promise<{ default: T }> {
  try {
    const loaded = await load()
    clearFlag(key)
    return loaded
  } catch (error) {
    if (!readFlag(key)) {
      setFlag(key)
      reloadFresh()
      // Reloading — never resolve, nothing should render meanwhile.
      return new Promise<never>(() => {})
    }
    throw error
  }
}

/** React.lazy with transient-failure retry and stale-deploy recovery. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own signature; ComponentType<unknown> would reject prop-taking components (contravariance)
export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(() => loadWithRecovery(load, key))
}
