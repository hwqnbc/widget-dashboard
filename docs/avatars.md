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
  `AvatarVisual { Head, Figure, Celebration }` + `avatarVisualById`,
  assembled from the per-avatar folder bundles.

## Per-avatar character folders
`components/widgets/characters/` groups each character's pieces physically:
```
shared/Hand.tsx                       cross-character primitive
toy/       ToyHead, ToyFigure, SixSevenFigure, ToyCelebration, toyParts, toyPalette, index
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
  Actions** widget (`components/widgets/AvatarActionsWidget.tsx`) plays on tap —
  pick a character, tap to loop its celebration, tap again to return to the static
  `Figure`. Using the one looping `Celebration` (rather than a separate per-avatar
  tap move) keeps the widget's behaviour uniform across every present and future
  avatar. The widget publishes a small test contract on its root —
  `data-testid="avatar-actions"`, `data-avatar` (selected id), `data-playing`
  (`yes`/`no`) — exercised by `e2e/120-avatars.test.mjs`. Its avatar picker
  (a `ToggleButtonGroup`) **wraps** (`flexWrap`), so as the roster grows the
  buttons stack onto more rows instead of overflowing off the small card.

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
`npm run build` + `npm run lint`, then `npm run e2e avatars` (the Avatar Actions
contract: default selection, every catalogued avatar selectable + rendering a
figure, tap play/stop, switch-resets-play, and selection persistence). Then
headless Chromium for the seat picker. Default map is a pure
regression (each game's chips/colours/celebration look identical — check
`aria-label="Toy figure"/"Ninja figure"` on the expected cells). Then on Settings swap
Player 1 → Ninja, confirm `persist:testsite` → `ui.avatars` becomes
`{toy:'ninja', ninja:'toy'}`, reload, and confirm the in-game chip for seat `toy` now
renders the ninja head (and its colour + win celebration follow).
