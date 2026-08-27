# In-app console viewer

A phone browser has no dev tools. When something goes wrong on a phone the
page just misbehaves — a blank widget, a dead button — and the message that
would explain it is unreachable. This feature mirrors the dev-tools Console
tab into the app itself: every `console.*` call and every uncaught error is
captured into a ring buffer, and a dialog off the app bar renders it.

It is a debugging instrument, not a widget: it lives in the app shell so it
works on every page — including while the page below has fallen back to the
[error boundary](../src/components/ErrorBoundary.tsx).

## Parts

| Piece | Role |
| --- | --- |
| `src/utils/consoleLog.ts` | The capture store: the patch seam plus a pure, DOM-free ring buffer, formatter and filters |
| `src/hooks/useConsoleLog.ts` | `useSyncExternalStore` bindings — `useConsoleEntries()` (the list) and `useConsoleIssueCount()` (the badge) |
| `src/components/ConsoleLogDialog.tsx` | The viewer dialog: level filters, text filter, follow-tail, copy, clear |
| `src/components/AppLayout.tsx` | The app-bar button + error badge that opens it |
| `src/main.tsx` | Calls `installConsoleCapture()` before anything renders |

## Capture

`installConsoleCapture()` runs once, first thing in `main.tsx`, and patches:

- `console.log/info/warn/error/debug` — the original method is **still
  called**, so real dev tools behave exactly as before.
- `window` `'error'` in the **capture phase** — uncaught exceptions, plus
  resource load failures (a dead `<script>`/`<img>`), which fire on the
  element and never bubble. Those carry no `error` object, so they are
  reported as `Failed to load script: <url>`.
- `'unhandledrejection'` — the rejected promises that are otherwise silent.

Recording never throws: the whole `recordLog` call is wrapped, because a
capture bug must not break the caller's logging.

### Formatting

`formatArgs` renders a call's arguments the way dev tools would: top-level
strings bare, nested strings quoted, `Error` as its stack (falling back to
`name: message` where an engine has none), DOM nodes as `<div#id.class>`,
`Map`/`Set` by size and contents. A naive `String(arg)` would turn the most
useful argument — the object you logged — into `[object Object]`.

Three guards keep a hostile value from taking the page down with it:
cycles resolve to `[Circular]`, recursion stops at depth 3 (`{...}`),
and each entry is capped at `TEXT_LIMIT` (4000) characters. Property
getters are read inside a `try` (`[getter threw]`).

### The ring

- `LOG_LIMIT` = 500 entries, oldest evicted. A per-frame logger (a game loop)
  must not grow the heap.
- **Consecutive identical messages collapse** into one row with a `count`,
  rather than filling the ring with 500 copies of the same line. The
  collapsed row is *replaced*, not mutated, so subscribers comparing by
  identity still see a change.
- Ids are monotonic and survive eviction — they are the React keys.
- Subscriber notification is coalesced on a 150 ms timer, so a chatty page
  drives a handful of renders a second at most, not sixty.

## Rendering

The badge and the list subscribe **separately**, on purpose:

- `useConsoleIssueCount()`'s snapshot is a plain `number` (the warn+error
  tally), so React bails out unless it actually moves. The badge is mounted
  in `AppLayout` for the whole session; had it subscribed to the entry list,
  every `console.log` would re-render the entire page tree below it.
- `useConsoleEntries()` returns a cached array whose identity only changes
  when the ring does (`useSyncExternalStore` loops forever on a snapshot that
  allocates every call).

The dialog goes **full-screen below `sm`** — the messages are wide and the
phone is where this feature earns its keep. Filtering is two independent,
pure functions of the entry list (`filterEntries` by level bucket, then by
case-insensitive substring), so a level pick and a search compose.

Copy prepends the user agent and the URL: a pasted log is only useful in a
bug report if it says which device and page produced it. `navigator.clipboard`
needs a secure context — a phone hitting a LAN dev server over plain `http`
has none — so there is a `<textarea>` + `execCommand` fallback, and the
footer says so plainly when both fail.

Follow-tail behaves like a terminal: new output scrolls into view, but the
moment the user scrolls up to read something it stops fighting them
(`data-follow`, and the ⤓ button re-arms it).

## Scope

The buffer is **session state, not persisted state** — a reload starts clean.
Nothing here goes through redux or `localStorage`: the store must work before
the store exists (persist rehydration is itself something you might need to
debug), and stale logs from a previous session would be more confusing than
useful. The consequence, worth knowing: an error that reloads the page takes
its own evidence with it.

## Test contract

`e2e/141-console.test.mjs` (see `e2e/README.md`). The pure half imports the
esbuild-bundled `utils/consoleLog` directly — formatting, the ring, repeat
collapsing, the issue tally, filters, export. The live half asserts on the
DOM contract:

| Hook | Meaning |
| --- | --- |
| `console-log-button` (`data-issues`) | App-bar opener; warn+error tally |
| `console-log-dialog` (`data-count`, `data-total`, `data-filter`, `data-follow`) | Shown rows, captured rows, active level filter, tail-follow state |
| `console-log-entry` (`data-level`, `data-repeat`) | One message row |
| `console-log-filter-<all\|issues\|error\|warn\|log\|info\|debug>` | Level filter buttons |
| `console-log-search`, `console-log-copy`, `console-log-clear`, `console-log-close`, `console-log-follow` | Toolbar controls |
| `console-log-empty` | Empty / no-match state |

## Future work

- **Persist the last session's errors** (sessionStorage mirror of warn+error
  rows) so a crash-and-reload doesn't erase its own cause.
- **Network capture** — a `fetch`/`XHR` wrapper recording failed requests,
  the other half of what dev tools would show.
- **Share sheet** — `navigator.share` on the copy path, so a phone log can go
  straight into a chat instead of the clipboard.
- **Expand/collapse long entries** — stack traces dominate the list once a
  render loop starts throwing.
- **Log-level threshold** — drop `debug`/`log` at capture time on slow
  devices, keeping only issues.
