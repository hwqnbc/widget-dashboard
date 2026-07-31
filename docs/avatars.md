# Avatars — design notes

How characters are grouped into pickable **avatars**, and how a player's chosen
avatar flows into every game as their chip.

## Seat vs avatar (the core split)
Two concepts that used to be one string:

- A **seat** is one of the two fixed players in a game — `'toy'` / `'ninja'`
  (`features/avatars/types.ts` → `Seat`). This literal is the *identity*: board
  cells, score keys, the AI seat (the computer is always seat `'ninja'`), archer
  positions and turn order all key on it. It never changes, so **no persisted game
  state migrates** as avatars are added.
- An **avatar** is a *look* — a grouped `{ head, figure, celebration }` plus a name
  and a brand colour (`AvatarId`). Each seat renders whichever avatar the player chose.

The bridge is the persisted **seat→avatar map** `ui.avatars`
(`Record<Seat, AvatarId>`), default identity `{ toy:'toy', ninja:'ninja' }` — so out
of the box seat `toy` shows the Toy avatar and nothing looks different from before
the split. Only *rendering* consults the map.

## The three-layer registry (mirrors the widget registry)
- `features/avatars/types.ts` — `AvatarId` (the extensible union), `Seat`, the
  `SeatAvatars` map type, `SEATS` / `AVATAR_IDS`, and `DEFAULT_SEAT_AVATARS`.
- `features/avatars/avatarCatalog.ts` — **component-free** metadata
  `AvatarMeta { id, name, color }` + `AVATAR_CATALOG` + `avatarMetaById`. The single
  source for a player's colour and display name (it replaced the old
  `playerColors.ts` map and the inline `'Toy'/'Ninja'` label strings). Kept free of
  component imports so the `ui` slice can depend on it.
- `registry/avatarRegistry.tsx` — **component-carrying**
  `AvatarVisual { Head, Figure, Celebration, Figure3D? }` + `avatarVisualById`,
  assembled from the per-avatar folder bundles. `Figure3D` is optional and
  registered via `lazy()` (see "3D figures" below).

## Per-avatar character folders
`components/widgets/characters/` groups each character's pieces physically:
```
shared/Hand.tsx                       cross-character primitive
shared/FigureStage3D.tsx              R3F turntable stage for the 3D figures (lazy-only)
toy/       ToyHead, ToyFigure, SixSevenFigure, ToyCelebration, ToyFigure3D, toyParts, toyPalette, index
ninja/     NinjaHead, SwordNinjaFigure, NinjaFigure, NinjaCelebration, ninjaPalette, index
fireninja/ FireNinjaHead, FireBladeFigure, FireNinjaFigure, FireNinjaCelebration, fireNinjaPalette, index
darkarin/  DarkArinHead, TwinSwordFigure, DarkArinFigure, DarkArinCelebration, darkArinPalette, index
frak/      FrakHead, FrakFigure, FrakCelebration, frakPalette, index
imperium/  ImperiumHead, ClawFigure, ImperiumFigure, ImperiumCelebration, imperiumPalette, index
boy/       Boy.tsx                    (an ImageToggle figure, not a game avatar)
```
- **Head** = the standalone `<svg>` chip/mark (`size` prop; default `'100%'`).
- **Figure** = the static full body (no-prop). `NinjaFigure` is a static
  `SwordNinjaFigure drawn={false}` wrapper so every avatar exposes a uniform Figure.
- **Celebration** = the looping victory animation (no-prop): `ToyCelebration` = the
  "6 7"; `NinjaCelebration` = the draw/sheathe loop (extracted from the old inline
  `LoopingNinja`). Rendered by `WinnerCelebration`, and also what the **Avatar
  Actions** widget (`components/widgets/AvatarActionsWidget.tsx`) plays via its
  labelled action toggle (`data-testid="celebration-toggle"`) — in 2D it is
  **Idle | Celebrate** (the one looping 2D celebration, uniform across
  avatars); in 3D it lists the model's named-move library (`actions3d`), one
  button per action. (It used to be tap-on-the-figure; the invisible tap
  surface gave no feedback about what a tap did, so it became an explicit
  toggle — lesson #36's pattern.) The playing action stays transient: it
  resets on reload and on avatar/view switches. The widget publishes a small
  test contract on its root —
  `data-testid="avatar-actions"`, `data-avatar` (selected id), `data-playing`
  (`yes`/`no`), `data-action` (action id or `idle`), `data-view` (`2d`/`3d`),
  `data-figure3d`
  (`available`/`unavailable`) — exercised by `e2e/120-avatars.test.mjs` and
  `e2e/121-avatars-3d.test.mjs`. Its avatar picker
  (a `ToggleButtonGroup`) **wraps** (`flexWrap`), so as the roster grows the
  buttons stack onto more rows instead of overflowing off the small card.

## 3D figures (`Model3D` + `Figure3D`) and the action library
An avatar can optionally carry a **3D figure** — a three.js/R3F render of the
same character. Its moves are a growing **library of named actions**: the
component prop is `{ action?: string }` (undefined/unknown = idle with a
subtle sway), and the id list lives as registry metadata
(`AvatarVisual.actions3d: { id, name }[]`) — **outside the lazy chunk**, so
the Avatar Actions picker can render the buttons without loading three.js.
New moves are *added* as new ids ("add action"); existing ones are improved
in place under a stable id ("refine"). Current libraries: toy
`[sixseven "6 7"]` (bounce + alternating arm pump); ninja `[pump "Pump"]`
(bounce + overhead katana pump) and `[draw "Draw"]` — the 2D celebration's
choreography in 3D: reach over the right shoulder, unsheathe the back
katana, sweep it to an upright guard, flourish, re-sheathe, loop (~3.2 s
phase timeline); fireninja `[blaze "Fire Blade"]` — the flaming blade
ignites out of the always-held hilt (overshoot scale-up from the start-time
ref) then sweeps across the body in a looping guard parry, flame flickering
via scale noise + emissive pulse.

The render is split into a venue-neutral **model** and a viewer **figure**,
so the same character can stand in a game world:

- `characters/toy/ToyModel3D.tsx` (registry `Model3D`) — the **mesh-level
  model**: the toy minifig from primitives (4-sided-cylinder trick for the
  flared torso, hemisphere cap + box brim), sharing `toyPalette`. Faces +Z,
  feet at y=0, ~1.85 u tall. It owns only the *character's* animation via its
  own `useFrame` (mutating refs, zero React renders — the drone widgets'
  pattern), one branch per `action` id. **It does not spin** — spinning is
  presentation, and baking it in would make the model unusable in a world.
  Choreographed loops (the ninja Draw) additionally keep a start-time ref
  (reset when the `action` prop changes) so the phase timeline begins at
  phase 0 rather than wherever the global clock happens to be, and write
  katana visibility imperatively every frame.
- `characters/shared/FigureStage3D.tsx` — the shared viewer stage: a
  transparent `<Canvas>` (camera framed on a ~1.9-unit figure), lights, a
  figurine base disc, and the **turntable** (`spin` prop, rad/s) — the stage
  owns the spin, not the model. `spin={0}` doesn't freeze mid-turn: it eases
  the figure back to face the camera, for **directional** actions (the
  ninja Draw sets 0 — a spinning figure hides the blade behind the body for
  half of every turn).
- `characters/toy/ToyFigure3D.tsx` (registry `Figure3D`) — the thin viewer:
  the model on `<FigureStage3D>` with a per-action spin choice.
  This is what the Avatar Actions 3D view renders.
- **Reuse in games:** the Drone Sim renders Player 1's (seat `'toy'`)
  `Model3D` as the walking RC operator when the chosen avatar has one
  (`droneSim/OperatorFigure.tsx`; primitive-figure fallback otherwise —
  also the `<Suspense>` fallback). Root contract `data-op-avatar` /
  `data-op-figure`, suite `16-op-avatar`. See `docs/drone-sim.md`.
- **Chunking rule:** three.js must never reach the main bundle. The registry
  mounts `Model3D`/`Figure3D` with `lazy(() => import(...))` and every render
  site wraps them in `<Suspense>`; `FigureStage3D`/`*Figure3D`/`*Model3D` are
  therefore **not** re-exported from the character `index.ts` barrels. Vite
  splits them into their own chunks sharing the existing lazy R3F/three chunk.

The **Avatar Actions** widget grew a persisted per-instance **2D/3D view
toggle** (`data-testid="avatar-view-toggle"`; the picker is
`data-testid="avatar-picker"`, the figure area `data-testid="avatar-stage"`).
In 3D view the Idle/Celebrate toggle drives `playing` exactly like the 2D
celebration swap; the canvas mounts under `data-testid="figure3d-stage"`. An
avatar without a `Figure3D` shows a placeholder
(`data-testid="figure3d-unavailable"`, head + "<Name> has no 3D figure yet")
instead, with the celebration toggle **disabled** (nothing would visibly
play) — so avatars gain 3D one at a time without gating the view toggle.

**Adding a 3D figure to an avatar:** build the mesh-level
`characters/<id>/<Name>Model3D.tsx` (default-export `{ action?: string }`,
faces +Z, feet at y=0, ~1.85 u, no spin) and the thin viewer
`<Name>Figure3D.tsx` wrapping it in `<FigureStage3D spin={...}>` (do NOT add
either to the folder's `index.ts`), then register both in
`avatarRegistry.tsx` as `lazy(() => import(...))` on the avatar's `Model3D` /
`Figure3D` fields, with at least one `actions3d` entry. The Avatar Actions
3D view and the Drone Sim operator pick them up automatically.

**Adding an action to a model:** one `useFrame` branch keyed on the new id
in the model (plus a spin choice in the viewer if the move is directional),
and one `{ id, name }` entry in the registry's `actions3d` — the widget's
toggle grows the button automatically. Ids are stable so future rounds can
"refine" a move in place.

Shipped so far: toy, ninja (`NinjaModel3D` — hooded faceted head + mask,
gold obi/medallion, crossed back katanas; actions Pump + Draw), fireninja
(`FireNinjaModel3D` — spiky hair, crossed sashes + silver emblem, gripped
hilt with the emissive fire blade; action Fire Blade). Still missing 3D
figures: darkarin, frak, imperium.

## Reading a seat's look
`features/avatars/useSeatAvatars.ts`:
- `useSeatAvatars()` → the `{ toy, ninja }` map from persisted state, with a coerced
  fallback to the identity default (guards pre-field state / removed ids).
- `useSeatVisual(seat)` → `{ Head, Figure, Celebration }`; `useSeatColor(seat)` → hex.

In a component that draws many seats (board cells), call `useSeatAvatars()` once and
resolve per-cell via `avatarMetaById[map[cell]].color` and `useSeatVisual` inside the
small leaf (`Mark`/`Disc`/`Archer`) so hooks aren't called in a loop. Consumers:
`PlayerBadge`, `TurnBanner`, `WinnerCelebration`, and the four games. `MemoryWidget`'s
card-face `MOTIF_BY_ID` deliberately stays independent — those heads are card
*decorations*, not the players.

## Settings picker
`pages/SettingsPage.tsx` adds an **Avatars** card: one `ToggleButtonGroup` per seat
("Player 1" = seat `toy`, "Player 2" = seat `ninja`), each option showing the avatar's
head preview + name, dispatching `setSeatAvatar`. To keep the two players visually
distinct, choosing an avatar already held by the other seat **swaps** them (the other
seat inherits this seat's previous avatar) instead of allowing a duplicate — with only
two avatars today that's a swap, and it generalises as figures are added.

## Verifying
`npm run build` + `npm run lint`, then `npm run e2e avatars` (both Avatar
Actions suites — 120: default selection, every catalogued avatar selectable +
rendering a figure, Celebrate/Idle play/stop, switch-resets-play, selection
persistence; 121: the 2D/3D toggle, the toy's lazy WebGL canvas, the
celebration toggle in 3D + its disabled state on the placeholder, and view
persistence). Then
headless Chromium for the seat picker. Default map is a pure
regression (each game's chips/colours/celebration look identical — check
`aria-label="Toy figure"/"Ninja figure"` on the expected cells). Then on Settings swap
Player 1 → Ninja, confirm `persist:testsite` → `ui.avatars` becomes
`{toy:'ninja', ninja:'toy'}`, reload, and confirm the in-game chip for seat `toy` now
renders the ninja head (and its colour + win celebration follow).
