# Full-screen mode — design notes

Any widget can be **maximised** to fill the viewport for a bigger, higher-res view
— games especially (larger boards, better play). On mobile it's orientation-aware:
a landscape-biased game (Archery) nudges the device to landscape.

## Model
- One widget at a time is fullscreen. The state is a single **transient** id
  (`fullscreenId`), held in React (`components/fullscreen/FullscreenProvider.tsx`),
  **not** redux — the `ui` slice is fully persisted and we don't want fullscreen to
  survive reloads. `FullscreenProvider` is mounted once around the app shell
  (`AppLayout`) and exposes `{ fullscreenId, open, close, overlayHost }` via
  `useFullscreen()` (`fullscreen/fullscreenContext.ts`).
- The **maximise button** lives in `WidgetCard`'s header (an optional
  `onFullscreen` prop; `WidgetBoard`'s `BoardWidget` wires it to `open(id)`). Every
  widget gets it. Same `widget-no-drag` + `stopPropagation` treatment as remove.
- The overlay is `components/fullscreen/FullscreenView.tsx`: a themed, portaled MUI
  `Dialog fullScreen` (same pattern as `ConfirmDialog`) with a slim title bar +
  exit button. Its body is an **empty host** element (not the widget) whose DOM
  node is reported up to the provider via a callback ref (`onHost` →
  `overlayHost`). Because every board sizes off its container (container queries),
  a bigger container ⇒ a bigger board for free. `Esc`/exit close it; it
  self-dismisses if the instance is removed.
- **Single live instance — reparented, never remounted.** Each grid cell's
  `BoardWidget` (`WidgetBoard.tsx`) mounts its `<Widget>` exactly once, into a
  **stable host `<div>`** via `createPortal`. A layout effect `appendChild`s that
  host into either the card's slot (normal) or `overlayHost` (fullscreen). Moving
  a DOM node does **not** remount its React subtree — fibers, refs, effects, and
  crucially the live `<canvas>`/WebGL context all survive. So the running game
  (flight, wave, score, projectile/target pools — much of it ref-held, not redux)
  keeps going across enter **and** exit. This was a real regression once: the old
  design swapped the card's `<Widget>` for a placeholder and mounted a *fresh*
  copy in the overlay, which restarted the WebGL games (Drone Sim/Strike, Tank)
  on every toggle. The MUI `Dialog` portals to `document.body`, i.e. outside the
  react-grid-layout item's CSS `transform` — so the reparented host escapes the
  grid cleanly (a `position:fixed` escape would be trapped by that transform, and
  swapping the portal's `container` arg would itself remount). Covered by
  `e2e/118-fullscreen-continuity.test.mjs`.

## Telling a widget it's fullscreen
`components/fullscreen/presentation.ts` — a tiny `PresentationContext`
(`{ fullscreen: boolean }`, default `false`). `BoardWidget` supplies it — the
portal's React subtree is `<PresentationContext.Provider value={{ fullscreen:
isFullscreen }}><Widget/></...>` — so the flag **flips live on the same instance**
as it moves between card and overlay (context follows the React tree through a
portal, regardless of where the host DOM sits). Widgets read `usePresentation()`.
Kept separate from `useViewport` so widgets that only need the boolean don't
re-render on resize. **The two capped board games and the WebGL widgets consume
it** (the latter for control sizing) —
Tic-Tac-Toe and Memory relax their fixed px cap when fullscreen
(`min(100cqmin, 88vmin/92vmin)` instead of `340px`/`460px`). Connect 4 and Archery
are uncapped already and grow automatically.

## Orientation (per-widget, not global)
Only Archery is landscape-biased; TTT/Memory are square, Connect 4 nearly so — so
orientation is opt-in per widget via `WidgetMeta.preferredOrientation`
(`features/widgets/widgetCatalog.ts`; archery → `'landscape'`, others omit it).
- **Rotate hint** (universal, in `FullscreenView`): when the widget declares a
  `preferredOrientation` and `useViewport().orientation` differs, a centered
  "Rotate your device to landscape" panel (`data-testid="rotate-hint"`) overlays
  the widget. On rotation the container queries fill the now-wide viewport.
- **Best-effort device lock** (progressive enhancement, in
  `FullscreenProvider.open`, inside the click gesture): for a `'landscape'` widget,
  `requestFullscreen()` + `screen.orientation.lock('landscape')`, all in `try/catch`;
  `close()` best-effort unlock/exit. Works on many Android browsers; iOS/desktop
  reject → caught, and the rotate hint covers them. Never fatal.

`hooks/useViewport.ts` is the app's first viewport hook — `{ width, height,
orientation, isMobile }` from `resize`/`orientationchange` (`isMobile` via
`matchMedia('(pointer: coarse)')`).

**Immersive layout example (Archery):** so rotating actually pays off, Archery
switches to an overlay layout **only in full-screen landscape**
(`fullscreen && orientation === 'landscape'`) — the scene fills the whole area and
the controls/scores/footer float over its margins; portrait and the grid tile keep
the stacked layout. See `docs/archery.md`. A widget that just needs to grow (TTT/
Memory cap relaxation) only reads `usePresentation().fullscreen`; one that also
reorganises by orientation additionally reads `useViewport()`.

## Verifying
`npm run build` + `npm run lint`, then headless Chromium: add a widget, click the
maximise button (`aria-label` contains "full screen"), assert a `role="dialog"`
appears and the board's bounding box grew past the old cap; the widget stays a
**single** instance in the DOM (its canvas reparents into `.MuiDialog-root`, no
second copy); `Esc`/exit closes and the widget reparents back into its card.
`118-fullscreen-continuity` proves a running Drone Strike game (ref-held
`data-shots`) survives the toggle instead of restarting. Archery in a portrait
viewport shows `data-testid="rotate-hint"`; landscape hides it; TTT/Memory show no
hint. Native fullscreen/lock failing headlessly is caught (no console errors).
