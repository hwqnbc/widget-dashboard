# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

TestSite is a single-page **widget dashboard**. Widgets are draggable and
resizable on a responsive grid; their layout and per-widget state persist to
`localStorage`.

## Commands

```bash
npm run dev      # dev server (Vite, HMR)
npm run build    # tsc -b (type-check) then vite build
npm run preview  # serve the production build
npm run lint     # ESLint 9 (flat config)
```

There is no test runner configured yet. Verify changes with `npm run build`
(catches type + bundling errors) and `npm run lint`.

## Stack

- Vite 8 + React 19 + TypeScript (strict, `verbatimModuleSyntax` — use
  `import type` for type-only imports).
- MUI (`@mui/material` v9): pass styling shorthands (`fontWeight`,
  `fontFamily`, `alignItems`, …) through the `sx` prop, **not** as direct
  props — this MUI major rejects them as top-level props.
- Redux Toolkit + react-redux 9 (`useDispatch.withTypes` / `useSelector.withTypes`).
- redux-persist → localStorage (key `testsite`).
- react-router-dom 7.
- react-grid-layout 2 — **import the grid from `react-grid-layout/legacy`**
  (`Responsive`, `WidthProvider`). The v2 main entry dropped the `WidthProvider`
  HOC. The `Layout` type is the layout **array** (readonly), `LayoutItem` is a
  single item.

## Architecture

```
src/
  app/store.ts        combineReducers → persistReducer; RootState / AppDispatch
  app/hooks.ts        typed useAppDispatch / useAppSelector — always use these
  features/widgets/   widgetsSlice (instances + layout), types, widgetCatalog
  features/ui/        uiSlice (theme mode)
  registry/           widgetRegistry: WidgetType -> component
  theme/              buildTheme + AppThemeProvider (reads ui.mode from redux)
  components/         AppLayout, WidgetBoard, WidgetCard, widgets/*
  pages/              DashboardPage, SettingsPage
```

Provider order (`main.tsx`): `Provider` → `PersistGate` → `AppThemeProvider`
→ `BrowserRouter` → `App`.

### State model

- `widgets.instances`: `{ id, type, data }[]` — `data` holds per-widget
  persisted state (e.g. counter value, notes text) via `updateWidgetData`.
- `widgets.layout`: serializable grid items (`{ i, x, y, w, h, minW, minH }`)
  fed to every react-grid-layout breakpoint; `onLayoutChange` writes it back.
- Dragging is restricted to the card header via the `.widget-drag-handle`
  class (see `WidgetCard` + `WidgetBoard`'s `draggableHandle`).

## Adding a widget

1. Add the string to `WidgetType` in `features/widgets/types.ts`.
2. Add a catalog entry (title, default size, default `data`) in
   `features/widgets/widgetCatalog.ts` (incl. `defaultWidgetData`).
3. Build the component in `components/widgets/` and register it in
   `registry/widgetRegistry.ts`.

Reusable primitives for new widgets: `hooks/useNow` (ticking clock),
`features/widgets/useWidgetField` (typed persisted-`data` selector),
`components/widgets/TapStage` (tap-to-animate button), and the shared character
pieces under `components/widgets/characters/` (`ToyHead`, `NinjaHead`, `Hand`,
`toyParts`, and the `toyPalette` / `ninjaPalette` colour modules).

## Docs

Per-feature design notes live in `docs/`. See `docs/tic-tac-toe.md` for the
Tic-Tac-Toe widget's considerations (difficulty levels incl. the "sane player"
Easy AI, 2-player vs vs-computer, the pass-opening-move button, board
responsiveness, and the persisted state model). See `docs/connect-4.md` for the
Connect 4 widget (7×6 board, depth-based Easy/Medium/Hard alpha-beta AI,
animated disc drop; reuses the same modes, latency, pass button and glow).
