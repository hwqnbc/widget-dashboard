# Full-screen mode — design notes

Any widget can be **maximised** to fill the viewport for a bigger, higher-res view
— games especially (larger boards, better play). On mobile it's orientation-aware:
a landscape-biased game (Archery) nudges the device to landscape.

## Model
- One widget at a time is fullscreen. The state is a single **transient** id
  (`fullscreenId`), held in React (`components/fullscreen/FullscreenProvider.tsx`),
  **not** redux — the `ui` slice is fully persisted and we don't want fullscreen to
  survive reloads. `FullscreenProvider` is mounted once around the app shell
  (`AppLayout`) and exposes `{ fullscreenId, open, close }` via
  `useFullscreen()` (`fullscreen/fullscreenContext.ts`).
- The **maximise button** lives in `WidgetCard`'s header (an optional
  `onFullscreen` prop; `WidgetBoard` wires it to `open(inst.id)`). Every widget
  gets it. Same `widget-no-drag` + `stopPropagation` treatment as the remove button.
- The overlay is `components/fullscreen/FullscreenView.tsx`: a themed, portaled MUI
  `Dialog fullScreen` (same pattern as `ConfirmDialog`) with a slim title bar +
  exit button, re-rendering the **same** `<Widget id>` at viewport size. Because
  every board sizes off its container (container queries), a bigger container ⇒ a
  bigger board for free. `Esc`/exit close it; it self-dismisses if the instance is
  removed.
- **Single live mount:** while a widget is fullscreen, `WidgetBoard` renders a
  placeholder ("Opened in full screen") in its grid card instead of the widget, so
  the widget is mounted only in the overlay — no duplicate rAF/animation loops.
  Game state lives in redux, so entering/exiting loses only transient animation
  state, never the game.

## Telling a widget it's fullscreen
`components/fullscreen/presentation.ts` — a tiny `PresentationContext`
(`{ fullscreen: boolean }`, default `false`). The overlay wraps its widget in
`<PresentationContext.Provider value={{ fullscreen: true }}>`; widgets read
`usePresentation()`. Kept separate from `useViewport` so widgets that only need the
boolean don't re-render on resize. **Only the two capped board games consume it:**
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

## Verifying
`npm run build` + `npm run lint`, then headless Chromium: add a widget, click the
maximise button (`aria-label` contains "full screen"), assert a `role="dialog"`
appears and the board's bounding box grew past the old cap; while open, the grid
card shows the placeholder (single board in the DOM); `Esc` closes and the card
returns. Archery in a portrait viewport shows `data-testid="rotate-hint"`; landscape
hides it; TTT/Memory show no hint. Native fullscreen/lock failing headlessly is
caught (no console errors).
