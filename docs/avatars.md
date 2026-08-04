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
darkarin/  DarkArinHead, TwinSwordFigure, DarkArinFigure, DarkArinCelebration, DarkArinFigure3D, DarkArinModel3D, darkArinPalette, index
frak/      FrakHead, FrakFigure, FrakCelebration, FrakFigure3D, FrakModel3D, frakPalette, index
imperium/  ImperiumHead, ClawFigure, ImperiumFigure, ImperiumCelebration, ImperiumFigure3D, ImperiumModel3D, imperiumPalette, index
goldgunner/ GoldGunnerHead, GunnerFigure, GoldGunnerFigure, GoldGunnerCelebration, GoldGunnerFigure3D, GoldGunnerModel3D, goldGunnerPalette, index
scar/      ScarHead, SoldierFigure, ScarFigure, ScarCelebration, ScarFigure3D, ScarModel3D, scarPalette, index
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
`[dance "Dance"]` — a generic energetic dance (not 6-7 related): jumping
with the arms raised overhead, waving with both joints (shoulder swing +
smaller offset-phase elbow wave) — and
`[sixsevenshow "6 7 Show"]` — the 6-7 meme: the figure stands still, elbows
at the sides, forearms hinged FORWARD at the elbow (rotation.x — hands out
in front of the body, not to the side) bobbing up/down alternately, flanked
by big red "6"/"7" numerals built from primitives (torus + boxes, no
fonts), popping in with a spring and bobbing in counter-phase with the
hands; both dances swap the smile for the open hyped mouth; the flat
digits are
**billboarded at the camera** each frame (local = parentWorldRot⁻¹ ·
cameraRot) so they never read mirrored on the turntable; ninja `[pump "Pump"]`
(bounce + overhead katana pump) and `[draw "Draw"]` — the 2D celebration's
choreography in 3D: reach over the right shoulder, unsheathe the back
katana and land in a FORWARD guard (the elbow bends the forearm ahead, the
blade riding as its obtuse extension, pointing forward-up at ~45°),
flourish, re-sheathe, loop (~3.2 s phase timeline); fireninja
`[blaze "Fire Blade"]` — the flaming blade ignites out of the always-held
hilt (overshoot scale-up from the start-time ref) as the forward forearm's
obtuse extension pointing ~45° up, then the shoulder sweeps FORWARD
(rotation.x, sagittal plane) so the blade slashes up-and-down in front,
flame flickering via scale noise + emissive pulse; darkarin
`[cross "Twin Cross"]` — the 2D celebration's defensive X in 3D: from the
ready V (both ice blades up-and-out) BOTH arms sweep down-forward-inward
and the blades land crossed in front of the chest, hold, then open back
out (2.6 s loop matching the 2D's 0.7 s tween + hold). Both arms mirror
one scalar set; the inward/outward aim lives in the shoulder's **y yaw** —
it re-planes the elbow's bend so the forearms (and the blades riding them
as obtuse extensions) cross the midline instead of staying parallel; frak
`[flurry "Blade Flurry"]` — the 2D celebration's alternating chop: the
arms run in ANTIPHASE (each gets its own strike progress, k and 1−k —
unlike the darkarin cross's mirrored single set), one raising its gold
blade overhead-forward while the other chops down-and-inward across the
front, swapping every 620 ms half-beat (1.24 s loop); a short raise-in
blend at action start lifts both arms out of the idle guard so the loop
never pops; imperium `[slash "Claw Slash"]` — the 2D celebration
verbatim: ONLY the right elbow animates, sweeping the oversized
translucent-orange energy blade from hip height up past the face and
back on a symmetric 0.7 s cosine (the 2D's −18°→+48° ease-in-out
keyframes); the claw is a PISTOL grip — blade perpendicular to the
forearm (local +z of the elbow group), so the elbow's hinge IS the
swing — with a slight outward shoulder yaw so the sagittal arc stays
readable face-on.

The render is split into a venue-neutral **model** and a viewer **figure**,
so the same character can stand in a game world:

- `characters/toy/ToyModel3D.tsx` (registry `Model3D`) — the **mesh-level
  model**: the toy minifig from primitives (4-sided-cylinder trick for the
  flared torso, hemisphere cap + box brim), sharing `toyPalette`. Faces +Z,
  feet at y=0, ~1.85 u tall. It owns only the *character's* animation via its
  own `useFrame` (mutating refs, zero React renders — the drone widgets'
  pattern), one branch per `action` id. Shared skeleton note: ALL three
  models use the two-joint arm rig — shoulder group at x ±0.30 / y 1.14
  (ON the tapered torso's top face, whose half-width is only ~0.22 up
  there; upper arm h 0.22) → elbow group at (0, −0.22) (forearm h 0.24,
  hand at −0.26) — with a pivot-centred **cap sphere** on each joint
  (shoulder r 0.1, elbow r 0.08, sleeve colour) so joints stay closed at
  every pose. Held weapons attach INSIDE the elbow group at the hand and
  ride as the forearm's obtuse extension (`wrist.rotation.z = π` + a fixed
  slight up-tilt) — never counter-rotated to a world-space angle, which
  folds them acute against the arm — and flat blades are additionally
  rolled `rotation-y = π/2` so the cutting EDGE leads the sagittal swing
  and the broad face points sideways (a slice, not a flat slap; lesson
  #64). **It does not spin** — spinning is
  presentation, and baking it in would make the model unusable in a world.
  Choreographed loops (the ninja Draw) additionally keep a start-time ref
  (reset when the `action` prop changes) so the phase timeline begins at
  phase 0 rather than wherever the global clock happens to be, and write
  katana visibility imperatively every frame.
- `characters/shared/FigureStage3D.tsx` — the shared viewer stage: a
  transparent `<Canvas>` (camera framed on a ~1.9-unit figure), lights, a
  figurine base disc, and the **turntable** (`spin` prop, rad/s) — the stage
  owns the spin, not the model. `spin={0}` doesn't freeze mid-turn: it eases
  the figure back to face the camera.
- `characters/toy/ToyFigure3D.tsx` (registry `Figure3D`) — the thin viewer:
  the model on `<FigureStage3D>`. This is what the Avatar Actions 3D view
  renders. **The turntable is the user's toggle, uniform across every
  avatar**: viewers take `spinning?: boolean` (default true) and map it to
  the one 0.45 rad/s rate or 0 — tapping the 3D figure in Avatar Actions
  flips it (persisted `spin3d`, root `data-spin`). A tap works here where
  tap-to-play didn't (lesson #58): the feedback is immediate visible motion
  change, and stopping also turns a directional move (Draw, Fire Blade)
  face-on.
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
No current avatar exercises the placeholder (the roster is fully 3D since
Gold Gunner's figure landed); it stays as scaffolding for future avatars,
probed only by suite 121's negative check on the toy block.

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
hilt with the emissive fire blade; action Fire Blade), darkarin
(`DarkArinModel3D` — faceted chin-pointed mask, gold crown band +
spike/studs/temple fins, gunmetal pauldrons + gorget, magenta dragon
emblem, black obi + shin wraps, two permanently-held translucent ice
blades; action Twin Cross), frak (`FrakModel3D` — faceted lime hood with
peak spike + darker back drape, orange face opening over the green
lower-face wrap, gunmetal torso with the lime hex chest plate + belt bar,
orange arms with black gloves, printed grey legs, two permanently-held
pearl-gold sabers — broad curved blades with knuckle-bow hilts, the pair
mirrored via `rotation-y=π` on the left hand's copy; action Blade
Flurry), imperium
(`ImperiumModel3D` — black faceted helmet with horn spikes, gold face
plate under the black V-crest with four orange eye slits + glowing mouth
vent, gold rib print + hex core emblem, left fist akimbo on the hip, the
pistol-grip energy claw in the right; action Claw Slash), and goldgunner
(`GoldGunnerModel3D` — smooth yellow minifig head under the brown
hair cap + fringe/back drape, yellow jacket torso with the black
open-jacket V lapels, black tactical legs, both guns pistol-gripped ⊥
the forearm like the imperium claw: the black rifle raised in the right
fist, the gold twin-barrel blaster low-forward in the left; action Guns
Blazing — alternating elbow recoil on a 0.6 s loop with an emissive
muzzle-flash burst per shot, `visible`-toggled in useFrame; the flash
carries a forward cone because a flat star reads end-on as nothing when
a barrel points at the camera), and scar (`ScarModel3D` — tactical
helmet with the flatter 8-seg dome, NVG mount, earmuffs + mic boom over
the stubbled, scarred face (red scar slabs on the right cheek, slash on
the left), MOLLE vest with three mag pouches, the suppressed SMG
pistol-gripped in the right fist and the red-banded flashbang standing
out of the left; action Breach & Clear — a ~2.4 s phase timeline: the
left arm winds back and hurls the canister (`visible` OFF at release,
an emissive white burst pops up-forward-left), then three right-elbow
recoil pulses lay covering fire with muzzle-flash windows at the
suppressor). **Every avatar
now ships a 3D figure** — the Avatar Actions "no 3D figure yet"
placeholder and the Drone Sim's `data-op-figure="basic"` value are no
longer reachable from any current avatar; both code paths stay as
scaffolding for future avatars (suite 121 keeps only the toy block's
negative placeholder check, and `BasicOperator` remains as the operator's
Suspense fallback).

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
head preview + name, dispatching `setSeatAvatar`. The groups **wrap**
(`flexWrap`, lesson #51) — six head+name buttons never fit a phone row — and
the app bar collapses its brand text + nav labels to icons at `xs`; suite
`122-settings-mobile` pins both on a portrait-phone viewport. To keep the two players visually
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
