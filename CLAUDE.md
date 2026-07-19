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
npm run e2e      # Drone Sim end-to-end suites (headless Chromium; see e2e/README.md)
```

There is no unit-test runner configured. Verify changes with `npm run build`
(catches type + bundling errors) and `npm run lint`; changes touching the
Drone Sim or Drone Strike widgets should also pass `npm run e2e` (filterable,
e.g. `npm run e2e core`, `npm run e2e strike`).

**E2E tests written during development are deliverables, not scaffolding —
for EVERY new feature or widget, not just the drone ones.** Whenever a
feature is verified with e2e-style tests while being built, those tests
must be saved with the feature: committed as a numbered
`e2e/NN-name.test.mjs` suite (shared setup goes in `e2e/helpers.mjs`,
pure-module bundling in `e2e/run.mjs`), asserting only on the feature's
`data-testid`/`data-*` contract, and listed in the `e2e/README.md` suite
table. The harness is app-generic (headless Chromium + CDP against the real
dev server), so any widget — a board game, an animation, a form — can and
should get suites the same way. Never throw verification scripts away after
the feature passes: saved suites are what keeps the next change from
silently breaking this one.

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

**Ask before merging into `main`.** Once the work is verified, push the
feature branch, then ask the user to confirm the merge. On confirmation,
merge directly (fast-forward/merge, no pull request) — only raise a PR when
explicitly asked to.

**After merging to main, don't wait for or verify the GitHub Pages deploy** —
the user checks it themselves.

**Docs ship with the change, by default.** Every feature or behaviour change
ends with a docs pass in the same round — no separate ask needed: update the
feature's design note (`docs/drone-sim.md` or the relevant `docs/*.md`),
`e2e/README.md` when test suites change, and append to `docs/lessons.md`
whenever the round produced a reusable lesson (a recurring refinement, a
debugging insight, a pattern worth repeating).

**Every new game widget ships with a gameplay backlog.** Whenever a new
game widget is created (and whenever a round ships a feature to one), its
design note ends with a **"Future work (enhancement backlog)"** section —
an enhancement menu proposing gameplay modes, settings, enemies/AI,
controls & feel, and meta ideas, each with the integration point it would
build on (see `docs/drone-sim.md`, `docs/drone-strike.md`,
`docs/tank-battle.md` for the pattern). Keep it current: mark items
~~shipped~~ (moving the detail into the doc body) as they land, and add
new ideas discovered while building. The backlog is what the user picks
the next round from — never leave a new game without one.

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
  components/fullscreen/  FullscreenProvider (transient fullscreen id) +
                      FullscreenView overlay; presentation context (usePresentation)
  hooks/useViewport   live viewport size + orientation (portrait/landscape)
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
`ninjaPalette`), `fireninja/` (`FireNinjaHead`, `FireBladeFigure`, `FireNinjaFigure`,
`FireNinjaCelebration`, `fireNinjaPalette`), `darkarin/` (`DarkArinHead`,
`TwinSwordFigure`, `DarkArinFigure`, `DarkArinCelebration`, `darkArinPalette`),
`frak/` (`FrakHead`, `FrakFigure`, `FrakCelebration`, `frakPalette`),
`imperium/` (`ImperiumHead`, `ClawFigure`, `ImperiumFigure`, `ImperiumCelebration`,
`imperiumPalette`), `shared/Hand`, `boy/Boy`.

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
`docs/memory.md` for the Memory widget (2-player pairs, 4×4/6×6, card faces are
every avatar head × colour sampled at random, flip animation; reuses PlayerBadge, ConfirmDialog
and WinnerCelebration). See `docs/archery.md` for the Archery widget (2-player
projectile game, drag-to-aim slingshot under gravity, random archer heights,
first to 5 hits; reuses the heads, PlayerBadge, TurnBanner and WinnerCelebration).
See `docs/drone-sim.md` for the Drone Sim widget (the first WebGL widget —
three.js/R3F lazy chunk, twin-stick touch joysticks, the altitude-hold flight
model, 1st/3rd-person camera rig, and the ref-based zero-render input path).
See `docs/drone-strike.md` for the Drone Strike widget (FPV wave shooter on
the Drone Sim's flight model and city — fly-to-aim reticle, fire button +
auto-fire, aim assist with target leading, segment-swept tracer bolts,
seeded waves with enemy AI drones, ADS zoom with three gyro fine-aim modes,
and the recorded hitscan/ballistic weapon variants).
See `docs/tank-battle.md` for the Tank Battle widget (the third WebGL
widget — seeded analytic heightfield terrain with four-corner tank
grounding and grade limits, WoT-style controls: left stick drives the hull,
right stick orbits the camera with the turret chasing it, auto-turn hull
assist (default on), automatic gun elevation via a ballistic solver,
Waves/Roam mode toggle, patrol/engage/attack enemy tank AI with terrain
line of sight).
See `docs/avatars.md` for the avatar system (seat-vs-avatar model, the per-avatar
character folders, the catalog/registry split, the Settings picker, and how to add
a new figure). See `docs/fullscreen.md` for full-screen mode (the WidgetCard
maximise button, the transient `FullscreenProvider` + portaled `Dialog` overlay,
the `usePresentation` fullscreen context, `useViewport` orientation, the per-widget
`preferredOrientation` catalog field + rotate hint, and the board size-cap relaxation).

**Read `docs/lessons.md` before building or tweaking a board / character /
animation widget** — it collects the recurring refinements (grid cells that
resize the board, true-circle alignment, container-query board sizing, mobile
tap handling, animation mount-flash, stable `useWidgetField` fallbacks, the
"sane" Easy AI, confirm-guarding restarts, and verification/ops gotchas).
