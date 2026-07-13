# Widget lessons & refinements

Hard-won fixes from building the game/character widgets (Round Clock, Six Seven,
Sword Ninja, Tic-Tac-Toe, Connect 4, Memory). **Read this before building or
tweaking a board / character / animation widget** — most entries are bugs a user
reported and asked to fix, captured so they don't recur.

## Layout & alignment (the ones that bit us most)

1. **A grid board grew as pieces were placed.** CSS grid tracks default to
   `min-*: auto`, so a placed SVG can push its `1fr` track past its share and
   expand the board (which then spills into the scrollable card). **Fix:** every
   grid cell gets `minWidth: 0; minHeight: 0` (and `overflow: 'hidden'` as a
   safety net). Applied in Tic-Tac-Toe, Connect 4, Memory.

2. **"Circles" rendered as ellipses and the SVG sat off-centre.** Connect 4's
   first cut used flex columns with *mismatched* row/column gaps and
   `aspectRatio` fighting `flex`, so holes were oval and heads weren't centred.
   **Fix:** lay the board out as a real CSS grid (`repeat(n, 1fr)` both axes,
   uniform `gap`) so cells are square, and render each disc as an inner circle
   sized off one axis — `width: '86%'; aspectRatio: '1 / 1'` — centred with
   `display:'grid'; placeItems:'center'`. A circle sized this way is always
   round regardless of tiny cell non-squareness.

3. **Board must fit the card in *both* dimensions and never overflow.** Sizing
   off width alone overflowed vertically. Put the board in a
   `containerType: 'size'` wrapper and size it with container-query units:
   - square board: `width/height: 'min(100cqmin, <cap>px)'`
   - non-square (Connect 4 is 7:6): `width: 'min(100cqw, calc(100cqh * 7 / 6))'`
     plus `aspectRatio: '7 / 6'`.

4. **`CardContent` is `overflow: 'auto'`.** Anything that spills past the widget
   body flashes a scrollbar (the Round Clock's orbiting head did this; so did the
   growing board). Keep content bounded — rules 1–3 prevent it; for decorative
   overflow use `overflow: 'hidden'` on the widget root.

5. **Centring an SVG with a non-square / asymmetric viewBox:** wrap it in a fixed
   box with `placeItems:'center'`; if it must read on arbitrary background
   colours, put it on a white disc (Memory cards, Connect 4 discs).

## Touch / drag

6. **react-grid-layout swallows taps.** Interactive controls inside a widget need
   `className="widget-no-drag"` **and** `onMouseDown`+`onTouchStart`
   `stopPropagation` — `onMouseDown` alone never fires on touch, which is why a
   button felt dead on mobile. `WidgetBoard` sets `draggableCancel=".widget-no-drag"`.

## SVG animation

7. **One-shot `animation … forwards` plays on mount → a flash.** Gate it behind an
   `animate`/`interacted` flag that is false until the first real interaction
   (Sword Ninja draw; the looping-ninja win celebration flashed a sheathe on
   mount until we deferred `animate` to the first loop tick).

8. **To loop a toggle-based animation, toggle the state on an interval** and reuse
   the existing one-shot keyframes — no keyframe rewrite (the winner celebration
   loops the sword draw/sheathe this way).

9. **Verifying animations:** pause `document.getAnimations()` and set
   `currentTime`, or screenshot at the true extremes. Mid-cycle frames look
   identical — an early "the two screenshots look the same" report came from
   sampling both near the mid-swing.

## State / redux

10. **`useWidgetField` fallbacks must be stable module constants** (never an inline
    `Array(n).fill(...)`), or the selector returns a fresh reference every render
    and loops effects. Use the `coerce` callback to validate arrays/enums.

11. **Keep reducers pure.** Shuffle/deal with `Math.random` in an effect, not in
    `defaultWidgetData`/the reducer (Memory deals its deck in an effect when
    `cards.length !== size*size`).

12. **redux-persist writes are debounced.** Assert game state via the **DOM**, not
    an immediate `localStorage` read — a verification script mis-read stale state
    this way.

13. **Timers get cleaned up.** AI "thinking" latency, the Memory resolve delay, and
    the celebration loop all live in `useEffect` with `clearTimeout`/
    `clearInterval` cleanup, so a reset/unmount can't drop a stale move onto a
    fresh board.

## Game UX / AI

14. **Easy AI must not look like it's throwing.** Pure ε-greedy randomness ignored
    obvious wins/blocks and read as intentional losing. The rule that felt right:
    **take an immediate win → block the opponent's immediate win → else random.**
    Medium/Hard use depth-limited alpha-beta.

15. **Simulate "thinking":** the computer commits its move after a short *random*
    `setTimeout` (≈0.4–1.2s) instead of instantly.

16. **Guard destructive control changes.** Any control that restarts/reshuffles
    (mode, difficulty, grid size, match rule) pops a `ConfirmDialog` **only while a
    game is in progress**; the explicit **New game** button stays unguarded.
    Treat "changing a setting" and "starting a new game" as the same action.

17. **Turn/score as an icon, not text.** `PlayerBadge` (head + label) reads faster
    than "Toy to move"; on game end the winner's looping `WinnerCelebration`
    overlays the dimmed board (the winning-line glow stays visible behind).

18. **Gate human→human hand-offs.** In pass-and-play, a turn pass with no pause
    invites mis-clicks into the next player's move. A brief `TurnBanner` overlay
    ("X's turn", tinted to `PLAYER_COLOR`) that locks the board, auto-dismisses
    (~1s via `useHandoff`) and is tap-to-skip fixes it. Announce **only** on a
    genuine pass — never on reset, never when the move ended the game, and never
    on the computer's turn (its thinking delay already gates). Colour-code the
    players (`PLAYER_COLOR`: toy teal / ninja ice-blue) so the active one is
    obvious. The banner's overlay sits on top and intercepts taps, which is a
    second guard on top of the handler's `if (hand.player) return`.

## Reuse

19. Extract shared pieces rather than inlining: character heads (`ToyHead`,
    `NinjaHead`) and their palettes (`toyPalette`, `ninjaPalette`) as **their own
    modules** — a component file that also exports a constant trips the
    `react-refresh/only-export-components` lint. Also shared: `PlayerBadge`,
    `WinnerCelebration`, `ConfirmDialog`, `TapStage`, `SixSevenFigure`,
    `SwordNinjaFigure`, `toyParts`, `Hand`, hooks `useNow` / `useWidgetField`. Use
    an **extensible registry** for variant sets (Memory's `FACE_MOTIFS`).

## Verification & ops

20. Every change: `npm run build` (tsc + vite) **and** `npm run lint`, then drive it
    in headless Chromium (`/opt/pw-browsers/chromium`) via `data-testid` hooks.
    Watch for assertions polluted by new UI — counting `svg[aria-label="Toy figure"]`
    globally once included the new footer `PlayerBadge` head, not just board marks.

21. Environment quirks: `pkill -f vite` returns exit 144 and aborts a compound
    bash command — run commit/push separately. The Pages green check can't be
    confirmed from this environment (cached Actions API, `github.io` blocked) —
    hand the user the URL instead.

22. Branch hygiene: when the working branch is fully merged, reset it from
    `origin/main` before new work; fast-forward merges keep history linear.

## Physics / pointer interaction (Archery)

23. **Projectile + drag aiming.** Keep world = SVG viewBox units and size the
    container to the viewBox aspect ratio, so pointer→world is a straight scale
    off `getBoundingClientRect` (no letterbox maths). Run the flight in
    `requestAnimationFrame` (timestamp delta → `t`) and **`cancelAnimationFrame`
    on unmount/reset**. Only the *outcome* (score, turn) is persisted — aiming
    and the in-flight arrow are transient, so a mid-flight reload just returns to
    the shooter's turn. Use unified **pointer events** (`onPointerDown/Move/Up` +
    `setPointerCapture`, `touchAction:'none'`) so mouse and touch share one path.
    Embed reused character `<svg>` heads inside the scene with `<foreignObject>`
    so they scale with the viewBox. For deterministic tests, mirror the physics
    constants, solve a launch that lands in the target hitbox, and invert the
    slingshot mapping (`dragΔ = −v/K`) to synthesise the pointer drag.

## Character figures (heads, hoods, action pivots)

These bit us on **three** avatars in a row (Fire Ninja, DarkArin, frak). Read
before drawing a new character.

24. **Connect the head to the body — every time.** New heads keep coming out
    *floating* above the torso with a neck gap. The head SVG is drawn high in the
    240×380 space; the torso top is ~`y196`. **Fix (proven on DarkArin/FireNinja):**
    draw a short neck rect (`~x111–129`, down to the torso top) **and** wrap the whole
    head group in `<g transform="translate(0 N)">` (N ≈ 18–24) so the chin drops onto
    the collar — near-zero visible neck. A collar shape at the torso top
    (`characters/frak` uses a small `torsoShade` V) hides the seam. Always eyeball the
    head↔torso join in the first render.
25. **Heads read best faceted, short, and helmet-like.** A tall, round head looks
    wrong at avatar scale (reads as a blob/hair). Prefer straight-edged facets (an
    octagon-ish silhouette, like `DarkArinHead`) over smooth curves, and keep the head
    **short** (minifig proportions) — squash it and pull the features up.
26. **Match a hood/mask to the reference's coverage.** A hood drawn as two side
    pieces framing an open face reads as *hair*. If the reference *covers* the face,
    draw one continuous covering piece (crown + sides + jaw) with a **small face
    opening** for the eyes/skin/wrap — see `frak`'s faceted hood over an orange face
    patch with green eyes + wrap.
27. **Pick the action's pivot to match the motion.** Whole-arm *swings* pivot at the
    **shoulder**; *chops* and wrist flicks pivot at the **elbow** (draw a static upper
    arm shoulder→elbow, rotate the forearm+weapon about the elbow, cap the joint with a
    small circle). The wrong pivot makes an action read as a wave/flap — see the Fire
    Ninja shoulder-vs-wrist sweep and frak's elbow chop. Long blades sweep out of the
    viewBox fast, so keep blades short enough that the swing's extremes stay in-bounds
    (lessons #4), and remember `Figure` (static) and `Celebration` (animated) are
    separate renders — the rest pose can be posed independently of the animation's
    endpoints.

## 3D / WebGL (Drone Sim)

The first three.js/R3F widget. These carried across every one of its six
feature rounds (flight, collision, gates, time trial, courses, weather, crash).

28. **The R3F `<Canvas>` is a separate React root.** MUI theme, redux and any
    other context do **not** cross into it. Resolve theme/store values outside
    and pass them as props (palettes, layout); object props and refs cross
    fine. Symptom when forgotten: `useTheme`/`useAppSelector` inside the scene
    throws or returns defaults.

29. **Zero-render input path.** High-frequency data never touches React state
    or redux: joystick values write into a shared mutable ref that `useFrame`
    reads; the flight state mutates in place; the HUD is updated by direct DOM
    writes on a throttled (150 ms) tick. React renders only on genuine events
    (gate pass, lap complete, crash) — a few per minute. Dispatching per
    pointer-move or per frame re-renders the whole widget tree and thrashes
    redux-persist.

30. **Keep the simulation in pure, React-free modules** (`flightModel`,
    `worldLayout`, `lapTimer`: mutate-in-place, allocation-free, no
    `Date.now`/`Math.random` inside step functions). Payoff: with no test
    runner configured, `npx esbuild --bundle` + plain node scripts unit-test
    the physics exactly as shipped. Seed procedural content (mulberry32) so
    worlds are deterministic; when a layout becomes seed-driven later, keep
    the default seed reproducing the original hand-tuned content bit-for-bit
    so existing instances (and tests) are unaffected.

31. **Publish telemetry as `data-*` attributes and treat them as the test
    contract.** The HUD's throttled tick writes `data-alt/speed/x/z/yaw/wind/
    crash-state` (plus lap/gate state on the chips). E2E suites assert only on
    these + `data-testid` — never on internals — and the same attributes are
    the first debugging tool. Costs nothing beyond writes already happening.

32. **Drive E2E flight closed-loop, not with timed input.** Open-loop "hold
    the stick for 0.34 s" steering misses a 4°-wide target under browser
    timing jitter. A P-controller reading the telemetry attributes and
    steering via CDP touch events threads 2-unit gate rings reliably. Two
    sub-lessons: **brake before precision moves** (damped inertia coasts
    ~`v/λ` — the drone drifted off a roof mid-descent), and **test routes must
    obey the game rules as they evolve** (crash mode broke the old full-speed
    return leg; the pilot now cruises above the skyline).

33. **New forces interact with every trigger you wrote earlier.** Storm wind
    (position drift) pushed the *idle* drone off the pad and started a lap by
    itself — fixed by gating lap start on the drone being self-propelled
    (velocity, not drift). When adding a force/mode, sweep all
    position-triggered logic (start/finish zones, gate checks) and re-run the
    older suites; a fresh screenshot caught this one.

34. **Collision cheaply done right:** AABBs pre-inflated by the drone radius,
    resolve along the axis of least penetration, zero **only** the inward
    velocity component — wall sliding and rooftop landings fall out for free,
    and the magnitude you zero *is* the impact speed (return it and a crash
    threshold costs nothing). Verify no tunneling: max speed × `MAX_DT` must
    stay below the smallest inflated footprint.

35. **Headless WebGL needs software GL:** launch Chromium with
    `--enable-unsafe-swiftshader --use-angle=swiftshader`. And the lowercase
    `<line>` JSX element collides with the SVG intrinsic in TypeScript — build
    a `THREE.Line` imperatively and mount it with `<primitive>`, disposing
    geometry/material in the effect cleanup.

36. **Per-feature icon toggles do not scale — regroup into a described**
    **settings surface once they pass a handful.** Each Drone Sim feature
    added "one more icon button" until eleven sat in the top-right corner:
    unlabelled, cryptic, clipping at narrow card widths. Worse, a toggle
    with a static icon gives **zero feedback** — the landing-challenge
    button was reported "not working" when it worked perfectly; its effects
    (rooftop pads ≥ 15 units away) were simply invisible from spawn and the
    button itself never changed. Fixes: (a) keep only universal actions as
    inline buttons (camera, reset, settings) and move every mode into a
    grouped dialog of labelled Switch rows with one-line descriptions —
    state becomes self-evident; (b) give distant world effects a visible
    beacon (tall translucent column over each pad) so toggling produces
    on-screen change; (c) mirror all mode state onto the widget root as
    `data-*` attributes so tests read state without hunting buttons. Debug
    "toggle does not work" reports empirically first — the state usually
    flips fine and the real defect is missing feedback.
