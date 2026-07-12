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

## Workflow

**Always start from the latest `main`.** Before doing any work on a task, sync the
current branch onto the newest `origin/main`:

```bash
git fetch origin main
git rebase origin/main
```

Resolve any conflicts before continuing. If the working tree has uncommitted
changes, stash first (`git stash`), rebase, then pop. Re-check before pushing if
`main` may have moved. A merged branch is finished — restart it from `origin/main`
rather than stacking new commits on already-merged history.

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
  features/ui/        uiSlice (theme mode + seat→avatar map)
  features/avatars/   AvatarId/Seat types, avatarCatalog (name/colour), useSeatAvatars
  registry/           widgetRegistry: WidgetType -> component
                      avatarRegistry: AvatarId -> { Head, Figure, Celebration }
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
`components/widgets/TapStage` (tap-to-animate button), and the per-avatar
character folders under `components/widgets/characters/` — `toy/` (`ToyHead`,
`ToyFigure`, `SixSevenFigure`, `ToyCelebration`, `toyParts`, `toyPalette`),
`ninja/` (`NinjaHead`, `SwordNinjaFigure`, `NinjaFigure`, `NinjaCelebration`,
`ninjaPalette`), `shared/Hand`, `boy/Boy`.

## Avatars (players vs seats)

Games have two fixed **seats**, `'toy'` and `'ninja'` (`features/avatars/types.ts`
`Seat`) — the identity board cells, scores, the AI and archer positions key on.
What a seat *looks like* is its chosen **avatar** (`AvatarId`); the persisted
`ui.avatars` seat→avatar map (default identity `{toy:'toy', ninja:'ninja'}`,
edited on the Settings page) drives only rendering. Resolve a seat's look with
`useSeatVisual(seat)` → `{ Head, Figure, Celebration }` (from
`avatarRegistry`) and `avatarMetaById[…].color`/`.name` (from `avatarCatalog`).
Never hardcode `seat === 'toy' ? <ToyHead/> : <NinjaHead/>` — go through the
registry so a swapped avatar follows everywhere (the chip, colour, turn banner and
win celebration). `Celebration` is the looping win animation; it's also what the
**Avatar Actions** widget plays on tap
(`components/widgets/AvatarActionsWidget.tsx` — pick a character, tap to play its
celebration, tap again to return to the static figure; works for any registered
avatar, uniformly).

### Adding an avatar (figure)

1. Add the id to `AvatarId` in `features/avatars/types.ts` (and `AVATAR_IDS`).
2. Add a catalog entry (name + colour) in `features/avatars/avatarCatalog.ts`.
3. Build the character folder `components/widgets/characters/<id>/` with `Head`,
   `Figure` and `Celebration` (+ palette), and register the bundle in
   `registry/avatarRegistry.tsx`. It becomes selectable on the Settings page and in
   the Avatar Actions widget automatically.

## Docs

Per-feature design notes live in `docs/`. See `docs/tic-tac-toe.md` for the
Tic-Tac-Toe widget's considerations (difficulty levels incl. the "sane player"
Easy AI, 2-player vs vs-computer, the pass-opening-move button, board
responsiveness, and the persisted state model). See `docs/connect-4.md` for the
Connect 4 widget (7×6 board, depth-based Easy/Medium/Hard alpha-beta AI,
animated disc drop; reuses the same modes, latency, pass button and glow). See
`docs/memory.md` for the Memory widget (2-player pairs, 4×4/6×6, extensible
motif×colour face registry, flip animation; reuses PlayerBadge, ConfirmDialog
and WinnerCelebration). See `docs/archery.md` for the Archery widget (2-player
projectile game, drag-to-aim slingshot under gravity, random archer heights,
first to 5 hits; reuses the heads, PlayerBadge, TurnBanner and WinnerCelebration).
See `docs/avatars.md` for the avatar system (seat-vs-avatar model, the per-avatar
character folders, the catalog/registry split, the Settings picker, and how to add
a new figure).

**Read `docs/lessons.md` before building or tweaking a board / character /
animation widget** — it collects the recurring refinements (grid cells that
resize the board, true-circle alignment, container-query board sizing, mobile
tap handling, animation mount-flash, stable `useWidgetField` fallbacks, the
"sane" Easy AI, confirm-guarding restarts, and verification/ops gotchas).
