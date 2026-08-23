import { lazy, type ComponentType } from 'react'

/**
 * React.lazy with stale-deploy recovery. Hashed chunk filenames change on
 * every deploy, so a browser holding a cached index.html (or a tab that was
 * already open) requests a chunk that no longer exists — the dynamic import
 * rejects (Safari: "Importing a module script failed", Chrome: "Failed to
 * fetch dynamically imported module"). One page reload refetches the fresh
 * index.html with the current hashes and cures it, so: on the FIRST failure
 * per session/key, reload; if the import fails again after the reload
 * (truly offline, or a real bug), rethrow so the ErrorBoundary shows its
 * chunk-error card. The sessionStorage flag prevents reload loops and is
 * cleared on the next successful load.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own signature; ComponentType<unknown> would reject prop-taking components (contravariance)
export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  key: string,
) {
  const flag = `chunk-reload:${key}`
  return lazy(() =>
    load().then(
      (module) => {
        try {
          sessionStorage.removeItem(flag)
        } catch {
          /* storage unavailable */
        }
        return module
      },
      (error: unknown) => {
        let retried = true
        try {
          retried = sessionStorage.getItem(flag) != null
          if (!retried) sessionStorage.setItem(flag, '1')
        } catch {
          /* storage unavailable — fall through to the boundary */
        }
        if (!retried) {
          window.location.reload()
          // reloading — never resolve, nothing should render meanwhile
          return new Promise<never>(() => {})
        }
        throw error
      },
    ),
  )
}
