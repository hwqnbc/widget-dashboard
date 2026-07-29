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
  labelled **Idle | Celebrate** toggle (`data-testid="celebration-toggle"`) —
  pick a character, flip to Celebrate to loop its celebration, back to Idle for
  the static `Figure`. (It used to be tap-on-the-figure; the invisible tap
  surface gave no feedback about what a tap did, so it became an explicit
  toggle — lesson #36's pattern.) Using the one looping `Celebration` (rather
  than a separate per-avatar move) keeps the widget's behaviour uniform across
  every present and future avatar. The play state stays transient: it resets on
  reload and on avatar/view switches. The widget publishes a small test
  contract on its root —
  `data-testid="avatar-actions"`, `data-avatar` (selected id), `data-playing`
  (`yes`/`no`), `data-view` (`2d`/`3d`), `data-figure3d`
  (`available`/`unavailable`) — exercised by `e2e/120-avatars.test.mjs` and
  `e2e/121-avatars-3d.test.mjs`. Its avatar picker
  (a `ToggleButtonGroup`) **wraps** (`flexWrap`), so as the roster grows the
  buttons stack onto more rows instead of overflowing off the small card.

## 3D figures (`Figure3D`)
An avatar can optionally carry a **3D figure** — a three.js/R3F render of the
same character (`{ playing?: boolean }`: static-ish idle vs the looping
celebration move). The pieces:

- `characters/shared/FigureStage3D.tsx` — the shared stage: a transparent
  `<Canvas>` (camera framed on a ~1.9-unit figure), lights, and a figurine
  base disc. The per-avatar figure supplies the meshes and its own `useFrame`
  animation (mutating refs, zero React renders — the drone widgets' pattern).
- `characters/toy/ToyFigure3D.tsx` — the first one: the toy minifig from
  primitives (4-sided-cylinder trick for the flared torso, hemisphere cap +
  box brim), sharing `toyPalette`. Idle = slow turntable + arm sway; playing
  = bounce with raised arms pumping alternately (the "6 7" in 3D).
- **Chunking rule:** three.js must never reach the main bundle. The registry
  mounts each 3D figure with `lazy(() => import(...))` and the Avatar Actions
  widget wraps it in `<Suspense>`; `FigureStage3D`/`*Figure3D` are therefore
  **not** re-exported from the character `index.ts` barrels. Vite splits the
  figure into its own chunk sharing the existing lazy R3F/three chunk.

The **Avatar Actions** widget grew a persisted per-instance **2D/3D view
toggle** (`data-testid="avatar-view-toggle"`; the picker is
`data-testid="avatar-picker"`, the figure area `data-testid="avatar-stage"`).
In 3D view the Idle/Celebrate toggle drives `playing` exactly like the 2D
celebration swap; the canvas mounts under `data-testid="figure3d-stage"`. An
avatar without a `Figure3D` shows a placeholder
(`data-testid="figure3d-unavailable"`, head + "<Name> has no 3D figure yet")
instead, with the celebration toggle **disabled** (nothing would visibly
play) — so avatars gain 3D one at a time without gating the view toggle.

**Adding a 3D figure to an avatar:** build
`characters/<id>/<Name>Figure3D.tsx` (default-export `{ playing?: boolean }`,
meshes inside `<FigureStage3D>`; do NOT add it to the folder's `index.ts`),
then register it in `avatarRegistry.tsx` as
`lazy(() => import('.../<Name>Figure3D'))` on that avatar's `Figure3D` field.
The Avatar Actions 3D view picks it up automatically. Still missing 3D
figures: ninja, fireninja, darkarin, frak, imperium.

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
