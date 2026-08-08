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

65. **Optional-capability rollouts need a rolling fallback target — and a
    plan for when the last one disappears.** While the per-avatar 3D
    figures rolled out one avatar per round, the fallback paths' e2e
    coverage (the "no 3D figure" placeholder in suite 121, the basic
    operator in suite 16) kept a live target by RETARGETING each round to
    a roster member that still lacked the capability (darkarin → frak →
    imperium). When the LAST member gained it, the positive assertions
    became unreachable from the UI — the right move is to retire them,
    keep the code branch as scaffolding for future members, demote
    coverage to a negative probe (e.g. "no unavailable placeholder for
    toy"), and say so in the suite's docblock, so the next reader knows
    the path is deliberately untested-positive rather than forgotten.
    The retarget step is not optional: skipping it drops the fallback
    branch's only coverage several rounds before the rollout finishes.

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

27b. **3D shoulders float unless the pivot lands on the body's actual
    surface — and a pivot-centred cap sphere closes the joint at every
    pose.** All three 3D models shipped with arm pivots at x ±0.38 while
    the tapered 4-seg torso is only ~0.22 half-wide at shoulder height —
    the arm cylinder's inner edge never touched the body and the figures
    read as arms floating beside a torso (user-reported, the 3D analogue
    of #24's floating heads). Two-part fix, applied uniformly: move the
    pivots inward to the torso's top-face width (±0.30 — a taper is
    narrower up top than the hip number suggests, so compute the width AT
    the pivot height), and add a sleeve-coloured sphere (r ≈ 0.1) as the
    arm group's first child, centred exactly on the pivot — like the 2D
    elbow-cap circle (#27) it overlaps torso and arm regardless of
    rotation, so no choreography can reopen the gap. And the SAME
    wrong-pivot mistake from #27 recurred in 3D: the toy's 6-7 v1 swung
    whole arms at the shoulder, where the 2D (and the meme) hinge the
    FOREARM at the elbow with a static upper arm (user caught it both
    times). The 2D pivot rules apply verbatim to 3D rigs — when the
    reference flexes a forearm, build the hierarchy for it (shoulder group
    for pose → elbow group for the move, each joint capped). Grip
    corollary (ninja/fireninja, also user-caught): a held weapon should
    EXTEND the forearm (obtuse, wrist ≈ extension + a slight fixed
    up-tilt) — counter-rotating the wrist per-frame to force a world-space
    blade angle (e.g. "keep it vertical") folds the sword acute against
    the raised arm and reads broken-wristed. Aim the FOREARM at the target
    direction via the elbow and let the weapon follow.

28. **Face-forward figures chop *forward*, not sideways.** A chop that sweeps the
    blade out to the side (a rotating windmill) looks comical on a figure that faces
    the viewer. Strike **down in front** instead: tween each sword-hand between a
    raised windup and a forward strike (hand in front of the chest, blade driven down
    toward centre), and **crossfade the forearm** between its two paths — a CSS
    `transition` on `transform`/`opacity` (the DarkArin tween-and-fade idiom), toggled
    on an interval, reads as a smooth motion-trail. See `frak/FrakFigure.tsx`
    (`phase` 0/1) + `FrakCelebration`.

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

37. **A fixed-viewpoint camera needs an adaptive field of view.** The
    line-of-sight pilot view plants the eye at a standing figure and only
    rotates — at a constant 60° fov the drone shrinks to an invisible pixel
    within ~40 units. Narrow the fov with distance (65° → 22°, damped) and
    the mode stays flyable across the whole map; ease it back to the base
    value when switching away so the other cameras are unaffected. Two
    companion tricks: damp the look target (λ ≈ 10) so tracking reads as a
    human head turn rather than a servo, and hide the avatar the camera
    stands inside (its head sphere would otherwise clip the near plane) —
    render it only in the views that see it from outside. Place the
    standing spot inside zones procedural generation already keeps clear
    (the spawn corridor), or a shuffled world will eventually bury it in a
    building.

38. **Chase-camera obstruction: clamp the damped position against the
    physics colliders.** Sweep the subject→camera segment with a pure
    slab-method AABB test (`boomClipT`) over the same pre-inflated colliders
    the flight model resolves against — camera and physics can then never
    disagree about where walls are. Clamp the *damped* boom position, not
    the desired target: that guarantees no wall between drone and camera on
    every frame, and when the path clears the existing damper re-extends the
    boom by itself — zero extra state. Stop a margin short of the wall (the
    near plane clips otherwise) and floor the boom so the camera never
    enters the subject. Publish the live boom length on the telemetry tick
    (`data-boom`) — camera behaviour is otherwise invisible to DOM-level
    tests. E2E sub-lesson: steering yaw continuously off 150 ms-stale
    telemetry overshoots; align with short nudge → settle → re-read rounds.

39. **A captured-pointer-id gate is not a complete release guarantee.**
    The drone sim's virtual joystick tracked one `pointerId` per stick and
    reset it only on `pointerup`/`pointercancel`/`lostpointercapture` for
    that id — but the spec doesn't require any of those to fire when a tab
    loses focus or is backgrounded mid-drag, only `blur`/`visibilitychange`
    are guaranteed. A single missed release event stuck the knob at its
    last position forever *and* the down-handler's "already tracking"
    guard then rejected every future touch on that stick too, since it only
    checked whether something was tracked, not whether it was stale. Fix:
    add a window-level `blur`/`visibilitychange` fallback (plus a
    capture-phase window `pointerup`/`pointercancel` listener as
    defense-in-depth against a dropped local dispatch) that force-calls the
    same release path. Any other imperative pointer-capture input in this
    codebase needs the same fallback or it can wedge itself the same way.
    E2E sub-lesson: reproduce with `page.evaluate(() =>
    window.dispatchEvent(new Event('blur')))` mid-drag, then assert both
    that the stat stops moving *and* that a fresh touch on the same stick
    still drives it — the second assertion is the one that actually catches
    the "stuck forever" failure mode, since a plain reset-on-blur check
    can pass even while the down-guard is still wedged shut.

40. **Waiting on named events to recover pointer-capture state is still
    incomplete — poll the ground truth instead.** #39's blur/visibilitychange
    fallback fixed the tab-switch case but the same joystick kept sticking
    on real mobile touchscreens: a foregrounded tab never fires blur, and
    mobile OS gesture arbitration (a long-press callout, or scroll/
    rubber-band arbitration right at the stick's `touch-action: 'none'`
    boundary) can drop pointer capture without firing `pointerup`,
    `pointercancel`, or `lostpointercapture` either. No amount of
    additional event listeners closes that gap, because the browser simply
    never dispatches one. The fix that actually closes it: poll
    `Element.hasPointerCapture(pointerId)` — a synchronous, non-throwing
    ground-truth check — on a short interval (400ms) and force-release the
    moment it goes false while still "tracked." This has no false-positive
    risk for a legitimate long, stationary hold (capture stays true for the
    whole press regardless of movement), unlike an idle/no-movement
    timeout, which was considered and rejected for exactly that reason.
    Pair it with prevention, not just recovery: `WebkitTouchCallout: 'none'`
    plus an `onContextMenu` preventDefault stops the long-press callout
    from ever hijacking the touch in the first place. E2E sub-lesson: a
    real silent capture loss can't be synthesized in headless
    Chromium — calling `releasePointerCapture` yourself still fires
    `lostpointercapture` per spec, so it only re-tests the already-covered
    event path. Instead monkey-patch the element's `hasPointerCapture` to
    return `false` for the duration of the drag; that isolates and proves
    the polling path specifically, independent of every other fallback.

41. **Give a world actor exactly one shared state object across every system
    that reads it.** The walking operator is one mutable `OperatorState` ref
    read by the sim loop (stepping), two camera modes (the eye), the world
    figure (the mesh), the minimap (the dot) and the HUD (telemetry) —
    switching views can never teleport anyone because there is nothing to
    disagree about. Related camera lesson: when the camera-holder CARRIES
    the subject, stop looking at the subject — half a metre from the eyes
    it fills the frame with fuselage; look down the walking path instead.
    And pause physics for a held object explicitly (zero velocity, impact
    0) so crash/landing/lap triggers see nothing, rather than fighting the
    integrator with position overwrites.

40. **Stub the hardware API at the page level and E2E-test "untestable"
    input.** Gamepads cannot exist in headless CI, but the code only ever
    sees `navigator.getGamepads()` — an `addInitScript` that replaces it
    with a fake pad whose `axes` read from a window global makes the whole
    path (per-frame poll, deadzone, mapping, release) drivable from the
    test via `page.evaluate`. Same idea as the `navigator.vibrate` recorder
    in the haptics suite: the boundary you stub is the browser API, not
    your own code. Companion input lesson: when multiple sources feed one
    shared control state, polled sources must claim/release ownership
    (write zeros exactly ONCE on going idle) — a per-frame poll that
    writes unconditionally stomps event-driven sources with zeros.

41. **Place-by-playing beats building an editor surface.** The course
    editor has no placement UI at all: you fly to a spot and press "drop
    gate" — position, altitude AND heading come from the live flight state,
    every input method works for free, and any spot you can reach is valid
    by construction (no building-overlap checks needed). When a game needs
    user-authored content, first ask whether the existing play verbs can
    BE the editor. Also: keep authored content out of "settings" — a reset
    button must not delete somebody's hand-built course.

## FPV shooter (Drone Strike)

The second WebGL widget — built almost entirely from Drone Sim parts, which
is itself the meta-lesson: #28–#41 all carried over unchanged.

42. **Fast projectiles must be swept as segments, never point-tested.** A
    bolt at 55 u/s covers 2.75 m in one `MAX_DT` step — bigger than every
    target and most walls, so a position-in-shape test tunnels constantly.
    Test the segment prev→pos each frame instead: the camera-boom slab test
    (`boomClipT`) already IS a ray-vs-world query, and a segment-vs-sphere
    quadratic covers targets; earliest hit fraction wins and even gives the
    impact point for free. Same reasoning as #34's tunneling bound, but for
    objects far faster than the drone.

43. **Every additional touch control needs the joystick's full
    release-hardening, not just its own pointerup.** The fire button is a
    second finger alongside two sticks; a silently dropped capture (#39/#40)
    would leave `fireHeldRef` stuck true — an *invisible* failure that just
    drains shots forever. Own pointer id + window-level fallbacks + the
    `hasPointerCapture` poll, exactly like the stick. Corollary: keyboard
    fire (Space) deliberately bypasses the stick ownership arbitration — a
    boolean side-channel lets tests (and desktop players) fire without
    stealing the sticks from touch.

44. **Encode an actor's whole motion envelope into its placement data.**
    Wave targets carry their drift amplitude — and enemies their orbit
    radius — in the same seeded spec fields, and the rejection sampler
    includes that reach in the building-clearance test. Result: drifting
    targets and orbiting enemies can never intersect the world at runtime,
    with zero per-frame NPC collision work. Cheaper and more robust than
    resolving collisions for things that don't need physics.

45. **Publish an aiming beacon in the telemetry and e2e can play the
    game.** `data-tgt-x/-y/-z/-kind` (nearest alive target, written on the
    HUD tick) is all the closed-loop pilot needs to fly onto targets and
    shoot them down — the suites clear real waves without window globals,
    staying inside the #31 data-* contract.

46. **One owner per data-attribute — React props and imperative telemetry
    must not share one, and tests must expect the tick lag between the two
    groups.** `data-wave-state` (React-owned, flips at commit) and
    `data-targets-left` (rig-owned, written on the throttled 150 ms tick)
    briefly disagree at every wave transition: the state says `active`
    while the count still shows the previous tick's `0`. The dual-written
    `data-wave-state` made it worse. Fix on both sides: each attribute gets
    exactly one owner (low-frequency values → React props; per-frame values
    → the telemetry tick), and the e2e wait helper settles for two ticks
    after a React-owned state flips before reading tick-owned attributes.
    Found by suite 101 failing deterministically — after the code around it
    changed timing, not behaviour, which is exactly what saved suites are
    for.

47. **Migrate a persisted field's type through its coercer, on the same
    key.** The gyro setting grew from a boolean to `'off' | 'zoom' |
    'always'`: `coerceGyroMode` simply maps the legacy `true`/`false` to
    `'always'`/`'off'`, so every existing widget instance upgrades on read —
    no redux-persist migration, no new key, and the settings reset keeps
    working because `defaultWidgetData` is still the single source of
    truth.

## Terrain tank game (Tank Battle)

The third WebGL widget — a heightfield instead of a flat city. #28–#46
carried over; these are the new ones.

48. **The R3F canvas is a separate React root with its own prop schedule —
    never synchronously mutate shared game state that a stale canvas prop
    can misread.** `restart()` emptied the enemy pool in the click handler;
    the rig inside `<Canvas>` still held `battleActive=true` for a frame
    (its props lag the body's commit) and saw "battle active, zero enemies
    alive" — a phantom wave-clear that overrode the restart's own phase
    change. Two-sided fix: don't empty the pool at all (the next load
    replaces it — prefer replace-over-clear for pooled state), and make
    the trigger transition-based (the clear check only arms after the
    current active phase has actually SEEN targets alive). Corollary of
    #28: props crossing the canvas bridge aren't just contexts that don't
    reach — they're also a frame stale.

49. **Give every physics/render/AI/test consumer the same analytic ground
    function, and terrain becomes cheap.** One pure seeded `heightAt(x,z)`
    (sines + gaussian hills) drives the displaced mesh, four-corner tank
    grounding (y from the corner average, pitch/roll from the differences,
    damped), grade-limited driving, shell sweeps, enemy line of sight, the
    camera's ground clamp and the e2e suites' predictions — no raycasts,
    no physics engine, no image heightmap, and rendering can never
    disagree with collision. Flatten the spawn area with an envelope
    factor rather than special-casing, so every seed starts level.

50. **Realistic constants can be unplayable at game scale — tune limits to
    the terrain you actually generate, and never let a limit eat the
    trigger.** The gun's scale-realistic −8° depression made every
    downhill shot unsolvable on hills the generator produces constantly
    (the closed-loop pilot found it: permanent `sol=none` at a valid
    lock). Widened to −22° AND the trigger fires a max-arc lob even
    without a solution — greying the reticle is feedback, refusing the
    button press reads as a broken control (auto-fire still demands a
    real solution, so assists never lob into a hill).

## Avatar Actions widget

51. **A picker that overflows the default card is unreachable — wrap it.**
    The Avatar Actions `ToggleButtonGroup` was a single non-wrapping row, so
    once the roster passed ~4 avatars the leftmost buttons (Toy) slid to a
    negative x, off the small default card — a real user couldn't select
    them, and Playwright reported the page container "intercepts pointer
    events" (a hit-test at off-screen coords). `sx={{ flexWrap: 'wrap' }}`
    on the group stacks the buttons onto more rows instead; the fix generalises
    as figures are added. Lesson: any button row whose item count grows with
    the roster must wrap (or scroll) — assume it won't fit the smallest card.
    RECURRED (roster at six): the Settings page's two seat pickers had the
    identical non-wrapping groups and overflowed a phone — when a roster
    row is fixed in one place, sweep every other roster-sized button row.
    And assert at PAGE level too (`document.documentElement.scrollWidth <=
    window.innerWidth`): the element-level box checks passed while the
    app-bar's brand text + nav labels still overflowed the same viewport —
    the page assertion is what caught the second offender (fixed by
    collapsing chrome to icons at `xs`; suite 122).

52. **A pure-SVG widget still gets an e2e suite — assert on a root data-*
    contract, not pixels.** Avatar Actions has no canvas and no telemetry
    tick, so `120-avatars` gives the root three stable attributes
    (`data-testid="avatar-actions"`, `data-avatar`, `data-playing`) and drives
    the real toggles + tap: selection round-trips and persists, play toggles,
    switching avatar resets play. Figure *identity* is checked only by "an svg
    renders" (the art itself is reviewed from screenshots) — the same
    app-generic harness the drone suites use, minus WebGL.

57. **An optional per-avatar capability slots into the registry as an
    optional lazy field — never a parallel registry.** The 3D figures are
    `AvatarVisual.Figure3D?: ComponentType<{playing?}>`, registered with
    `lazy(() => import(...))` so three.js loads only when a 3D view first
    renders (the widget wraps it in `<Suspense>`). Three rules made it
    clean: (a) the heavy component and its shared stage
    (`FigureStage3D`) must NOT be re-exported from the character `index.ts`
    barrels — a static re-export would pull three.js into the main chunk
    and silently defeat the `lazy()` (verify by checking `*Figure3D` gets
    its own file in the `vite build` output); (b) capability presence is
    part of the widget's data contract (`data-figure3d`:
    `available`/`unavailable`) with a visible placeholder for the have-nots,
    so the roster can gain the capability one avatar at a time; (c) the
    same interaction props drive both renders (`playing` mirrors the 2D
    Figure/Celebration swap), so the view toggle changes *presentation*,
    not behaviour — and the e2e play/stop checks run identically in both views.
    Bonus 3D-modeling trick: a 4-segment `cylinderGeometry` rotated 45° is
    a tapered box — the minifig's flared torso in one primitive.

58. **Tap-the-figure is an invisible control — give play/stop a labelled
    toggle.** The celebration originally played by tapping the figure
    itself (`TapStage`): no visible affordance, so the user couldn't tell
    where to tap or whether a tap had done anything — the same
    zero-feedback failure as lesson #36's icon toggles, just with an even
    bigger invisible hit area. Replaced with an explicit **Idle |
    Celebrate** `ToggleButtonGroup` beside the 2D/3D toggle: the control
    is discoverable, and the selected button shows the current state even
    when the two renders look momentarily alike. Companions: disable the
    toggle when the mode can't render (the 3D "no figure yet" placeholder
    — a control that would do nothing visible is the same bug again), and
    when a widget's main surface stops being a button, keep the test
    contract on data-* attributes so only the suites' *interaction* lines
    change, not the assertions. Counter-case that shows the real rule:
    tapping the 3D figure to toggle the TURNTABLE is fine — the feedback
    is immediate visible motion change (direct manipulation), where
    tap-to-play swapped between two near-identical renders. The rule is
    "no interaction whose effect is invisible", not "no taps". Follow-up bite: swapping the `<button>`
    wrapper for a plain div silently dropped a UA default the layout was
    leaning on — `text-align: center` — and the figure's inline svg (made
    narrower than its full-width wrapper by the stage's `width:auto` rule)
    slid to the left edge (user-reported). When replacing a semantic
    element, re-state every UA default the layout relied on
    (`textAlign: 'center'` on the stage now), and pin visual centring with
    a bounding-box e2e check (`|svg centre − stage centre| < 4px`), since
    presence-only svg assertions can't see alignment.

59. **Presentation animation belongs to the venue, not the character — split
    the mesh-level model from its viewer.** The first cut baked the
    turntable spin into `ToyFigure3D`, which made the character unusable
    anywhere else: a game can't have its operator pirouetting (the user
    caught this while asking for the Drone Sim reuse). The split that
    works: a venue-neutral `Model3D` (meshes + *character*-owned animation
    only — idle sway, celebration; faces +Z, feet at y=0, documented scale)
    and a thin `Figure3D` viewer = `FigureStage3D` (which owns the
    turntable via a `spin` prop) + the model. The registry carries both as
    lazy fields. Reuse then costs three lines at the call site: resolve the
    seat's avatar OUTSIDE the canvas (lesson #28) and pass the component
    down as a prop; render it inside `<Suspense>` whose fallback is the old
    primitive figure, so the actor never blinks out while the chunk loads;
    counter-rotate for the world's heading convention (drone-yaw −Z forward
    vs the model's +Z face). Presence mirrors onto the root as data-*
    (`data-op-figure`) since meshes aren't DOM-observable — and any avatar
    that later gains a `Model3D` upgrades every venue automatically.

60. **A choreographed 3D move is a phase timeline — four things make it
    work.** The ninja's sword draw (reach → unsheathe → guard → sheathe,
    looping) surfaced all of these at once: (a) **start-time ref, not the
    global clock** — key the loop on `t - t0` where `t0` resets when the
    `action` prop changes, or the move starts mid-phase; (b) **lerp angles
    the short way** — the wrist tween from `π` to `-0.85` swept 300° through
    "blade pointing down" mid-draw because `lerp(π, -0.85)` takes the long
    arc; start from the coterminal `-π` instead (same pose, short path);
    (c) **phase-driven visibility is imperative** — `.visible` written every
    frame from the phase (self-correcting), not React props; (d) **verify
    with timestamped burst captures** — single "wait then screenshot" shots
    drift under software-GL screenshot overhead (~0.5 s each) and can miss
    every interesting phase; a burst of frames named with their real
    `Date.now()` offsets pins what pose existed when. Companion viewer
    lesson: a *directional* move on a turntable hides behind the body half
    of every turn — give the stage's `spin={0}` an ease-back-to-front
    behaviour and let directional actions select it. And the meta-pattern
    the user asked for: moves are a **named-action library** (`action`
    string prop + `actions3d` registry metadata living OUTSIDE the lazy
    chunk so pickers render three-free) — new moves add ids, they never
    overwrite the one celebration. Companion-object addendum (the toy's
    "6 7 Show" numerals): flat text-like props on a turntable read
    MIRRORED from behind — billboard them each frame
    (`local = parentWorldQuat⁻¹ · cameraQuat`, one module-scope scratch
    Quaternion, positions still orbiting with the figure), and park them
    at the 2D reference's height (the lower third) — at hand height they
    collide with the dancing arms.

61. **An elbow hinge only bends in one plane — aim that plane with the
    SHOULDER'S y yaw, and a two-armed move becomes one mirrored scalar
    set.** DarkArin's Twin Cross needs both forearms (and the blades riding
    them as obtuse extensions, #27b) to cross the body's midline — but an
    elbow's `rotation.x` swings the forearm strictly forward in the arm's
    own sagittal plane, so two bent arms stay parallel forever. The lever
    is the shoulder group's `rotation.y`: it re-planes the elbow's hinge,
    so yawed OUTWARD the same bend sends the blades up-and-out (the ready
    V) and yawed INWARD it sends them across the midline into the X — the
    entire cross/uncross is then one lerp over a single right-arm scalar
    set `{shZ, shY, shX, elbow}` with the left arm applying `-shZ`/`-shY`.
    Corollary for pose height: the crossing point tracks the ELBOW bend
    (deeper = the X climbs to the face, shallower = it sits at the chest),
    so tune elevation there, not by moving the shoulders.

62. **A loop whose base pose differs from idle needs an entry blend — and
    antiphase arms are just k and 1−k.** Frak's Blade Flurry alternates
    the arms between raised-overhead and struck-down, but its idle guard
    is neither pose — starting the modulo loop directly snaps the arms to
    "raised" on the first frame. The fix is one extra scalar: `raise =
    smooth(min((t − t0) / 0.35, 1))`, blending every channel from the idle
    pose into the loop's computed pose, so the move eases in and the
    modulo timeline stays untouched (no special-cased first cycle). And
    for the alternation itself: compute one tween scalar `m` per
    half-beat and give the arms `k = m` and `1 − k` — antiphase costs no
    second timeline, only a swap of which arm reads which scalar at the
    half-beat boundary.

63. **Held props have two grips — extension and pistol — and sagittal
    moves need a touch of outward yaw to read face-on.** Every sword so
    far EXTENDS the forearm (`rotation-z = π` at the hand, #27b's grip
    corollary), but imperium's energy claw is a pistol grip: the blade
    mounts PERPENDICULAR to the forearm (local +z of the elbow group, no
    flip), and then the elbow's x-hinge is not a wrist detail — it IS the
    swing, arcing the tip exactly like the 2D's elbow-pivoted rotation.
    Second half (hit twice this round-pair): a forward/sagittal move or
    guard is invisible face-on — the prop foreshortens to a sliver
    pointing at the camera (frak's idle guard, imperium's blade). The fix
    is a modest fixed outward shoulder yaw (~0.4 rad, #61's lever), which
    angles the whole plane just enough to read from the front without
    breaking the forward chop (#28).

64. **Orient the EDGE into the swing — a flat blade's wide face goes
    PERPENDICULAR to the swing plane.** The primitive swords were built
    as boxes wide in local x and thin in z; held as forearm extensions,
    that puts the broad flat facing the direction of every sagittal chop
    — slapping the air with the flat of the blade, which is not how a
    saber/knife cuts (user-reported on frak's sabers, and the same
    mistake sat unnoticed in the ninja katana and darkarin ice swords).
    The fix is one roll about the blade's own long axis on the held
    group: `rotation-y = π/2` alongside the existing `rotation-z = π`
    (Euler XYZ — the useFrame wrist writes touch only `.x`/`.z`, so the
    JSX `.y` persists). Check it from two angles: side-on the blade now
    shows its broad face, face-on it thins to an edge line. Bonus from
    the frak sabers: once a curved blade bows FORWARD (in each arm's
    sagittal plane), the left/right pair is mirror-symmetric by
    construction — the earlier `rotation-y = π` mirror flip becomes
    unnecessary. Weapon-shape checklist alongside #27b/#63's grip rules:
    grip (extension vs pistol), edge orientation, curve direction.

66. **The 2D celebration is the 3D action's spec — copy its clock before
    inventing motion.** Every 3D action that landed cleanly took its loop
    period, easing shape and phase structure verbatim from the 2D source
    component: DarkArin's cross = the 2D's 2.6 s interval with 0.7 s
    tween + hold, frak's flurry = the 2D's 620 ms antiphase half-beats
    with the 0.5 s move, imperium's slash = the 2D keyframes' symmetric
    0.7 s −18°→+48° ease-in-out (a plain cosine). What needed
    screenshot-tuning rounds was only ever the 3D-specific part — pose
    angles, yaw planes, joint distribution. So when translating a 2D
    move: read the 2D component's keyframes/intervals FIRST, transcribe
    the timing constants into the useFrame timeline unchanged, and spend
    the iteration budget exclusively on what 3D adds. (Timing disputes
    never came back from review; pose disputes did, every time.)

## Responsive touch layout (Drone Strike → Tank Battle)

53. **"Fullscreen" is not "big" — size touch controls from the container's
    measured height, and grow button clusters sideways, not upward.** Both
    shooters sized their controls with a mode flag (`fullscreen ? 140 :
    88`), which encodes a false assumption: an iPhone in landscape
    fullscreen has ~330–390 CSS px of height, where those "big" sizes
    stacked the fire button onto the top toolbar and pushed the scope
    button off-screen entirely. The fix (strike commit, then ported to the
    tank): (a) measure the widget root with a ResizeObserver and derive
    sizes from the REAL height with clamps (`stick = clamp(72, 0.28·h,
    max)`, fire/scope proportional) — resize/rotate/fullscreen frequency,
    never per-frame; (b) place extra buttons in a column INWARD of the
    thumb stick — the layout then consumes width, which landscape always
    has, instead of height, which a phone doesn't; (c) pin it with a
    viewport-emulating suite (`launch({viewport: {844, 390}})` + fullscreen
    + rect assertions vs the toolbar), because desktop-sized runs can never
    catch it. New game widgets should start from the responsive version —
    the tank copied the strike's layout BEFORE its fix and inherited the
    bug verbatim, which is exactly how copy-paste propagates a layout
    assumption.

54. **In a seeded generator, draw the difficulty-independent items BEFORE
    the difficulty-gated ones, or their "identical" placement silently
    drifts.** Drone Strike's `buildWave` shares one `mulberry32` stream
    across all the placements in a wave. Ground trucks are meant to be
    fully difficulty-independent (same count AND same positions on
    Easy/Normal/Hard), but I first appended them *after* the enemy block —
    whose count varies by difficulty (Easy caps at 2 drones, Normal at 4).
    Each enemy placement consumes a variable number of `rand()` calls, so
    by the time the trucks drew, the stream was at a *different offset* per
    difficulty and their positions shifted — count matched, positions
    didn't, and suite 108's "gallery unchanged by difficulty" caught it.
    The fix is ordering: place the difficulty-independent draws (gallery
    balloons, then trucks) first, then the difficulty-gated draws (enemies,
    turrets). Anything drawn before the first difficulty-dependent
    `rand()` is reproducible across difficulties for free; anything after
    is not. The e2e guard is a JSON-equality check on the
    difficulty-independent kinds across two difficulties at a high wave —
    cheap, and it fails loudly the moment a new draw is inserted in the
    wrong place.

55. **When a subsystem's output is unobservable in tests (audio, haptics,
    GPU), constrain the code to a minimal API surface and make the recorder
    stub of that surface the whole contract.** The Drone Sim sound engine
    could have scheduled envelopes with `exponentialRampToValueAtTime`,
    `cancelScheduledValues`, `OscillatorNode.onended`, buffer sources, etc.
    — and the e2e `AudioContext` stub would have to faithfully mimic each
    one or silently miss events. Instead the engine deliberately uses only
    three AudioParam schedulers (`setValueAtTime`, `linearRampToValueAtTime`,
    `setTargetAtTime`) plus direct `.value` writes, chosen *while designing
    the engine* with the stub in mind. The stub is then ~40 lines, records
    every scheduled value with its oscillator type, and can assert real
    behaviour (idle 85 Hz vs full-stick 161 Hz, an 880 Hz chime on a real
    gate pass, rotor gain → 0 during a real crash) with zero risk of the
    stub lying. Corollary of #40 (stub browser APIs at the page level):
    don't just stub what the code happens to call — design what the code
    calls so the stub stays trivially complete.

56. **Audio can't be heard in headless, so make its CONTRACT a counter, not
    the sound.** Web Audio SFX (Drone Strike's `webAudio.ts`/`strikeSounds.ts`)
    seem untestable — headless Chromium has no audio device and asserting
    oscillator graphs is brittle. Two moves make them solid: (a) the rig
    bumps a **monotonic per-effect counter** (`data-sfx-fire/-pop/...`) at
    each event and publishes it on the telemetry tick — the e2e asserts the
    *dispatch path* (a shot bumps fire, a kill bumps pop, wave-clear bumps
    clear), which is the thing that can actually regress; and (b) a
    `page.addInitScript` **recorder stub** for `AudioContext` counts
    `resume()`s and `createOscillator()`s, proving the engine really reaches
    Web Audio when unmuted and stays silent when muted (mirrors suite 70's
    `navigator.vibrate` stub). The non-vacuous mute assertion is key: fire
    while muted and check the *gameplay* `shots` counter still advanced while
    `sfx-fire` stayed flat — otherwise "counter didn't move" also passes when
    nothing fired at all. Two more gotchas worth reusing: **autoplay policy**
    means the context must resume from a user gesture, so unlock from a
    **capture-phase** window `pointerdown`/`keydown`/`touchstart` listener
    (a child's `stopPropagation` on the sticks otherwise hides every touch,
    and `keydown` covers the Space-fire path the pilot uses); and gate the
    counter bump on the mute flag, not on API support, so the counter still
    tracks intent (and the suite still passes) on a browser with no Web Audio.
    (Sibling to #55 — that one shapes the engine's API for the stub; this one
    shapes the widget's data-* so the *dispatch* is assertable at all.)

## Maps (ArcGIS)

67. **Never let an ArcGIS `Accessor` (a view, a layer) into React state or
    props.** React 19's dev-mode render instrumentation
    (`logComponentRender` → `addObjectDiffToProperties`) deep-walks every
    *changed* prop object — including its getters. An ArcGIS `SceneView`
    held in `useState` and passed as a prop meant that after a 3D→2D toggle
    destroyed it, React's next commit read the dead view's `zoom` getter,
    which threw **inside `commitPassiveMountOnFiber`** and corrupted the
    scheduler ("Should not already be working") — every later click dead,
    app gone, and only in dev. Fix: keep the view in a `useRef` and hand
    children the **ref + a `viewRevision` number** (refs are identity-stable
    so the dev diff never walks them; the primitive revision re-runs their
    effects on view swap). Corollary: wrap every ArcGIS construct/teardown in
    try/catch (`safeDestroy`) — with its asset/tile CDN unreachable, ArcGIS
    constructors and `destroy()` genuinely throw, and an exception escaping
    an effect cleanup unmounts the entire tree.

68. **A renderer that needs third-party servers gets a three-layer e2e
    contract: readiness as data, theme as render-computed state, external
    APIs mocked.** The Map page can't assert on tiles (the ArcGIS CDN may be
    blocked — it *is* blocked in this sandbox). What keeps the suite green
    everywhere: (a) readiness is `view.when()` mirrored to
    `data-map-status` — never `networkidle`, which tile servers keep alive
    forever; (b) the theme contract (`data-basemap`) is computed from the
    MUI mode in render, not read back from the map, so theme-follow asserts
    with zero network; (c) the reachability probe runs **in the page**
    (`page.evaluate(fetch)`) because node-side fetch doesn't share the
    browser's proxy path, and picks the online/offline branch; (d) the
    external API (OSRM routing) is always `page.route()`-mocked so its
    checks are deterministic; (e) dev serves the ArcGIS runtime assets from
    `node_modules` (`esriConfig.assetsPath`, DEV-gated) so widget locale
    bundles don't 404 into crashes offline while prod keeps the CDN default.

69. **Mock a geometry-returning third-party API as an ECHO, not a fixture.**
    The first OSRM mock returned a fixed canned route — fine for "the chip
    shows a distance", useless the moment the feature interacted with the
    *drawn* geometry: insert-a-waypoint-by-clicking-the-line needs the route
    polyline to lie where the test actually clicked, and a fixture's line is
    in Munich while the clicks are wherever the view happens to be. The fix
    is an echo mock: parse the coordinates out of the intercepted request
    URL and answer with a geometry that runs straight through them (plus
    per-point `waypoints[].location`), so every drawn artifact lands at the
    test's own click positions and screen-space interactions become
    deterministic. Pair it with recording the parsed coordinates per request
    — asserting "the third request had 3 pairs, the new one in the middle"
    tests the *request contract*, not just the UI echo. (Extends #68's
    always-mock rule; the mock's fidelity has to match what the feature
    reads back from the response.)

70. **ArcGIS drag needs a synchronous stopPropagation, but knowing WHAT was
    grabbed needs an async hitTest — pre-arm on pointer-down.** To drag a
    graphic instead of panning the map, the view's `drag` event must have
    `stopPropagation()` called *during dispatch*; by the time
    `view.hitTest()` resolves, the event is gone and the map already pans.
    The pattern: `pointer-down` fires the hitTest and stores the grabbed
    graphic's identity (here `attributes.waypointIndex`) in a ref; the
    `drag` handler only consults the ref — set → stopPropagation, move the
    graphic live with `view.toMap({x, y})`, commit on `action === 'end'`;
    unset → let the map pan. Clear the ref on `pointer-up` too, or a plain
    click (no drag) leaves the candidate armed and the *next* pan drags the
    graphic. The race (drag starting before the hitTest resolves) loses only
    the first few pixels of movement — invisible in practice. Works
    identically for MapView and SceneView and for touch.

71. **Commit gesture results in the gesture's OWN end event — a parallel
    listener's "cleanup" can outrace it.** Follow-up to #70's drag pattern:
    the first ship cleared the armed waypoint index in `pointer-up`
    (needed so a plain click doesn't leave a drag armed), but ArcGIS can
    deliver `pointer-up` BEFORE the synthesized drag `end` — when it did,
    the end handler found nothing armed and the moved waypoint silently
    never re-routed (user-reported: marker moves, route doesn't redraw; it
    also never reproduced in the offline sandbox, where drags can't run).
    Two rules fixed it, and they generalize to any gesture built from
    multiple event streams: (a) the commit lives in the gesture's own
    terminal event, and every other listener may only clean up gestures
    that are provably NOT in flight (pointer-up disarms only never-active
    "click" arms); (b) remember the last good intermediate position — the
    terminal event's own coordinate can be invalid (3D `toMap` returns null
    over the sky) and must fall back to it. The ordering rules were moved
    into a pure state machine (`src/pages/map/dragModel.ts`) precisely so
    the e2e bundle can unit-test the race orderings offline — the
    live-drag path needs a network the sandbox doesn't have.

72. **A live WebGL view goes fullscreen by restyling in place — never by
    portal or remount.** The widget fullscreen system (portaled MUI
    `Dialog` re-rendering the same widget) is the right shape for
    redux-backed game widgets: remounting them costs only transient
    animation state. For a component owning a persistent native resource —
    the Map page's ArcGIS view, with its WebGL context, loaded tiles and
    camera — a portal remount means full teardown and an expensive, visibly
    flashing rebuild. The map's fullscreen instead flips the SAME root node
    to `position: fixed; inset: 0` at modal z-index (+ best-effort native
    `requestFullscreen`): zero DOM moves, the view just resizes with its
    container. Corollary of #67's ArcGIS-out-of-React rule, at the layout
    level: around persistent-context components, layout changes must be
    pure CSS on the existing nodes. Sync the CSS state with a
    `fullscreenchange` listener so the browser's own exit (Esc in native
    fullscreen) doesn't leave the overlay stuck on.

73. **Never throttle input handling with requestAnimationFrame on a page
    that can go idle — rAF only fires when the browser schedules a frame.**
    The coordinate readout gated pointer-move processing behind an rAF
    flag; on the offline sandbox (static map, nothing animating) headless
    Chromium scheduled no frames, the callback never ran, the pending flag
    stayed set, and every later pointer-move was dropped — the readout
    froze on its placeholder, intermittently (any concurrent animation,
    like a loading spinner, unwedged it — hence flaky, not red). Real
    browsers do the same to background/occluded tabs. Throttle event
    handlers by TIMESTAMP (`performance.now() - last < 50ms → skip`,
    process synchronously otherwise); reserve rAF for work that composes
    with rendering (drawing, style writes read back by layout), and if rAF
    must gate something, pair it with a timeout fallback. Found because the
    e2e suite runs on exactly such an idle page — the flake WAS the bug.

## Gold Gunner avatar

74. **A CSS animation with a start-delay shows the element's OWN state
    during the delay — hide it explicitly if the first keyframe is
    "invisible".** Gold Gunner's "both guns blaze" staggers the two muzzle
    flashes (gold delayed 0.25s so it fires after the black rifle). Each
    flash's keyframes go opacity 0 → 1 → 0, but with no `fill-mode` the
    delayed element renders its base style (default `opacity:1`) for the
    whole 250 ms delay — so the gold flash sat lit before it ever "fired,"
    both guns flashing at once. Fix: set `opacity: 0` on the element as its
    resting state; the running animation overrides it, the delay period
    shows the intended dark. (Equivalent: `animation-fill-mode: backwards`
    to borrow the first keyframe during the delay — but an explicit base
    style is clearer.) Caught by pausing `getAnimations()` and sampling the
    true extremes (#9) at a delayed frame, not the t=0 one.

75. **Namespace gradient ids per avatar (`gg-…`), and prefer flat fills in
    the head chip.** The source art reused generic ids (`gold-grad`,
    `black-metal`); multiple avatars on one page (the settings seat pickers,
    the Avatar Actions roster) share a document, and duplicate gradient ids
    resolve to the first definition — a later avatar can inherit an
    unrelated gradient. Prefix every def with the avatar's short key so
    figures stay self-contained. The 20×20 head chip renders many times over
    (picker + settings), so it keeps solid fills from the palette rather than
    its own gradient defs — cheaper and immune to the id-collision trap.

## Model Viewer

76. **R3F silently ignores transform props on geometry elements — put
    `rotation`/`position` on the `<mesh>`, not the `<cylinderGeometry>`.**
    The user-provided SWAT truck set `rotation={[Math.PI/2,0,0]}` on the
    head/tail-light `<cylinderGeometry>` elements. `BufferGeometry` is not
    an `Object3D`; R3F applies unknown JSX attributes as object properties,
    so the rotation landed on the geometry as an inert property and the
    lights rendered unrotated (cylinders lying flat in their faces) with no
    warning anywhere. TypeScript doesn't catch it either — the geometry
    element types accept arbitrary object props. When adapting pasted R3F
    code, audit every transform prop for what element it sits on; a
    transform that must rotate *rendered* geometry belongs on the mesh (or
    a wrapping group).

77. **A viewer widget doesn't need drei — three ships OrbitControls as an
    addon.** `three/addons/controls/OrbitControls.js` resolves under Vite +
    `moduleResolution: "bundler"` with matching `@types/three` declarations,
    lands in the lazy 3D chunk like any other three import, and gives
    damped orbit/zoom/pan + `autoRotate` for free. Construct it in a
    `useEffect` against `useThree()`'s camera + `gl.domElement`, dispose in
    the cleanup, and call `controls.update()` in `useFrame` (damping and
    auto-rotate both require it). Adding `@react-three/drei` for one
    control would have been a whole extra dependency tree.

78. **Text on a 3D model needs no fonts, assets or drei — draw it on an
    offscreen canvas and use a `CanvasTexture` on an unlit plane.** The
    truck's S.W.A.T. lettering is canvas 2D (`strokeText` outline +
    `fillText`) wrapped in `new CanvasTexture(...)`, mapped onto a
    `meshBasicMaterial` (unlit = crisp, `toneMapped={false}` keeps the
    white white) on a `planeGeometry` positioned a hair (~0.005) off the
    body face — an offset beats tuning polygonOffset against z-fighting.
    Make the texture a lazy module singleton when the model can be
    multi-instanced (the strike mounts a pool of trucks): per-instance
    `useMemo` + dispose-on-unmount would re-rasterize per copy and tear the
    texture out from under surviving instances.

79. **Never spread a `THREE.Material` instance into a JSX material element —
    convert pasted "shared materials" to plain prop objects.** The AA
    turret source created module-level `new THREE.MeshStandardMaterial({...})`
    constants and spread them as `<meshStandardMaterial {...matteOliveGreen} />`.
    That spread dumps the live object's internals (uuid, id, type, version,
    every default field) onto a fresh material as props — it happens to
    mostly work, but it's setting dozens of junk props, defeats the sharing
    it looks like it does (each mesh still gets its own material), and a
    copied `type`/`uuid` prop is a latent footgun. Adaptation rule: turn
    each into a plain prop-object constant (`const OLIVE = { color, roughness,
    metalness }`) and spread that; per-mesh overrides written after the
    spread keep working. (True sharing via `material={sharedInstance}` also
    exists, but then the instance must be a never-disposed module singleton
    — same rule as the shared CanvasTexture, #78.) The tell in pasted code:
    `new THREE.*Material` at module scope feeding JSX spreads.

80. **A closed-loop rate ratio is confounded by FOV-dependent framerate under
    software GL — verify a config factor on the pure module instead.** Drone
    Strike suite 103 timed a yaw sweep unzoomed vs scoped and asserted the
    ratio ≈ 0.5 (the 2× scope halves aim sensitivity). It rode the threshold
    for a while, then adding more scene models tipped it to flaky (ratios
    0.44–0.99, `ads` sometimes ≈ `hip`). Root cause: the sim clamps `dt` at
    20 fps, so when the *wide-FOV* unzoomed pass renders the whole city and
    dips below that, it runs slow-motion and yaws less per wall-second — while
    the *narrow-FOV* scoped pass culls most of the scene, stays fast, and
    yaws full — inflating the ratio. It's not tick jitter (signed
    accumulation didn't fix it) and not scenery load alone (richWorld off
    didn't fix it): the confound is FOV↔framerate, which no measurement
    tweak removes. The scoped factor is pure config (`zoomSensFor(p) = 1/p`,
    `zoomFovFor(p) = BASE_FOV/p`), so the fix was to bundle `aimModel` and
    assert the factor directly (`zoomSensFor(2) === 0.5`, monotonic across
    powers) — deterministic, instant — and keep only the *mechanics* live
    (scope toggles, fire-while-scoped, persistence). Rule: when a live
    measurement's noise scales with what you're rendering, you're measuring
    the renderer, not the feature — pull the invariant down to the pure layer
    (siblings #55/#56: make the assertable contract the deterministic thing).

81. **Full-screen must *reparent* the live widget, not remount a copy —
    otherwise ref-held / WebGL state is wiped.** Full screen used to swap the
    grid card's `<Widget>` for a placeholder and mount a *fresh* `<Widget>` in
    the overlay `Dialog`. Board games survived (their whole state is persisted
    redux `data`), but the WebGL games — Drone Sim/Strike, Tank — keep their
    session in **refs** (flight pose, wave, score, projectile/target pools) read
    in `useFrame`, so every toggle mounted a new instance and **restarted the
    game** (the user's report: "toggle full screen and it restarts"). Fix: keep
    **one** instance per cell, mounted once into a stable host `<div>` via
    `createPortal`, and `appendChild` that host into either the card slot or the
    overlay body as full screen toggles (`WidgetBoard`'s `BoardWidget` +
    `overlayHost` on `FullscreenContext`). Moving a DOM node does **not** remount
    its React subtree — same fibers, same `<canvas>`/WebGL context — so the game
    keeps running. Two traps this avoids: (a) swapping a portal's `container`
    arg *does* remount, so the host must be stable and only its DOM parent
    changes; (b) `position:fixed` can't escape a react-grid-layout item because
    the grid item carries a CSS `transform` (a containing block for fixed) — but
    the MUI `Dialog` already portals to `document.body`, outside that transform,
    so reparenting into it works. Drive the reparent off **state** (callback-ref
    slot + `overlayHost` state), not a bare ref, so the layout effect re-runs the
    moment the target element attaches — no child-before-parent effect-ordering
    hazard. `PresentationContext` is supplied by `BoardWidget` (it follows the
    React tree through the portal), so `usePresentation().fullscreen` flips live
    on the same instance. Probe continuity with a ref-held datum that a remount
    would zero (`data-shots`), never a persisted one (`data-world-seed` survives
    a remount too) — `e2e/118-fullscreen-continuity.test.mjs`.

82. **Model-rendered targets are one pool, not one component per kind — the
    variation is a handful of props, and an `onFrame` hook is the seam for
    aiming/animated variants.** Drone Strike grew three near-identical
    renderers (`CarTargets`, `TurretTargets`, the ground trucks) that each
    allocated a fixed pool of `<group>`s, assigned alive targets of one `kind`
    to slots per frame, placed them on the deck, and hid spares — differing
    only in scale, ground-lift, whether they yaw into velocity, and (turret)
    an aim ref. Collapsing them into a generic `ModelTargets`
    (`kind`/`max`/`scale`/`groundLift`/`faceVelocity`/`onFrame`/`renderModel`)
    made adding the `MilitaryTruck` ground truck a ~10-line wrapper and turned
    "cater for future ground kinds" (rooftop/patrolling avatar-soldier enemies)
    into filling in the same props — `renderModel` returns the avatar's lazy
    `Model3D`, `onFrame` computes the bearing to the player for a weapon slew.
    Keep per-slot mutable state (aim refs) owned by the *caller* and passed
    through `renderModel(slot)`/`onFrame`, so the generic pool stays stateless
    and each kind keeps its own refs. Leave a genuinely divergent case bespoke
    if migrating it isn't covered by a live test (turrets appear too late for
    any closed-loop suite) rather than refactor blind.

83. **A transmissive `meshPhysicalMaterial` costs a full-scene render pass
    *per transmissive object* every frame — fine for a one-off showcase,
    ruinous for a multi-instance game model.** The `MilitaryTruck` model has
    three glass panes with `transmission: 0.9`; showing it as a Drone Strike
    ground target (up to 4 on screen) added ~4× the per-frame scene renders
    under swiftshader. The symptom was not a visual one but a **timing** one:
    the frame loop slowed so much that pointer events queued, and suite 107's
    tap/double-tap gesture (which rides real-time thresholds — 400 ms tap /
    500 ms double-tap in the handler) silently missed, so the gimbal never
    recentered. The tell was that the model was *mounted but hidden* before
    (three.js skips transmission for invisible objects) and only regressed
    once it became visible in wave 1. Fix at the source: give multi-instance
    game models a cheap `lowSpec` path (opaque tinted glass instead of
    transmission, a matte finish, no decorative light meshes), keeping the
    full-quality look for the single-model Model Viewer. When a heavy render
    makes a *timing* assertion flake, suspect per-frame GPU cost (transmission,
    big shadow maps, post-processing) before touching the test — the fix
    belongs in the render, and it helps real mobile devices too, not just the
    headless suite.

    **This became a convention (see CLAUDE.md):** every model reused as a
    multi-instance in-game target renders low-spec. Models shown *both* as a
    showcase and as a target expose a `lowSpec?: boolean` prop the render pool
    passes — `MilitaryTruck` / `LegoSwatTruck` (drop transmission + strobe,
    matte, no decorative lights) and `AaTurret` (matte; it had no
    transmission/emissive, so the knob is just uniformity). Why not mechanically
    add the prop everywhere: audit first — `droneSim/DroneModel` (the enemy +
    player craft) already uses default matte materials with no
    metalness/transmission/emissive, so it is low-spec by construction and
    gets no prop. The knob is for the *expensive* features; the standard is
    "author game targets cheap, and only carry a `lowSpec` toggle where a
    showcase needs the expensive version too."

84. **Reusing an avatar `Model3D` as a multi-instance in-game enemy: the cost
    is draw calls, not materials — resolve the lazy component *outside* the
    registry, one `<Suspense>` per slot, cap the pool, drive pose/facing from
    the pool's `onFrame`.** Drone Strike's rooftop soldiers reuse the Scar /
    Bazooka Joe avatar `Model3D`s (the same figures Avatar Actions shows) as
    enemies via a `SoldierTargets` wrapper over the generic `ModelTargets`
    pool (#82). Four things made it a clean reuse rather than a special case:
    (a) **the avatar `Model3D`s were already low-spec by construction** — only
    `meshStandardMaterial`, no transmission/physical/persistent emissive (the
    lesson #83 killer) — so unlike the trucks they needed *no* `lowSpec` prop;
    the only budget is their ~45–60 meshes = draw calls, so the pool is capped
    at 2. (b) **Import the models with a direct `lazy(() => import('.../ScarModel3D'))`
    in the pool, NOT through `avatarRegistry`** — the registry's whole point is
    to keep three.js out of the main chunk, and importing a `Model3D` eagerly
    (even transitively via the registry barrel) would drag three into it; a
    direct `lazy` keeps each model in its own split chunk that loads only when
    a soldier first appears. (c) **`ModelTargets` seats every slot on the deck
    (its y ignores `t.pos.y`)** — a rooftop target overrides Y in `onFrame`
    (`g.position.y = t.pos.y - torsoLift`) instead of touching the pool; the
    same hook yaws the figure to face the player (models face +Z, so a plain
    `atan2(dx, dz)`, no negation). (d) **Behaviour was pure reuse** — a
    stationed shooter is exactly `stepTurret` (the fire-without-movement AI
    step), so the AI guard widened to `kind !== 'turret' && kind !== 'soldier'`
    and StrikeRig dispatched the new kind down the same branch; no new AI, no
    new fire/score path. The general pattern: a figure authored for one surface
    (an avatar viewer) drops into another (an enemy pool) when you respect the
    chunk boundary and express the surface's differences (roof Y, facing) as
    pool-hook overrides, not forks of the shared code.

85. **Live aim + a one-shot fire pose on a zero-render model come from a ref,
    not the `action` prop or React state; and one projectile pool renders as
    two things via a `visual` tag.** Making Drone Strike's rooftop soldiers
    *visibly aim and shoot* (instead of a red tracer from the torso) needed the
    avatar `Model3D`s to (a) elevate the weapon toward a moving target every
    frame and (b) play a recoil/muzzle/launch pose on each shot — both in a
    component whose whole discipline is *no re-renders* (all animation mutates
    refs in `useFrame`). The `action` prop is the wrong tool: it's a discrete
    string that restarts a canned loop, and switching it per shot would churn
    React and can't carry a continuous aim angle. Instead the models gained an
    `aimRef: RefObject<{ pitch; fire }>` (the `AaTurret` `TurretAim` precedent):
    the pool writes `pitch` (target elevation) and `fire` (the target's
    `fireTimer` countdown normalised to (0,1]) into the ref each frame, and the
    model reads `.current` in its own `useFrame` — elevating the weapon elbow
    and playing the fire pose keyed on `fire`, zero renders. The `action` prop
    stays for the Avatar Actions widget (canned loops on the model's own clock);
    the same pose code serves both, driven by two different sources. Separately,
    to make a *soldier's* shot a rocket while drones/turrets keep the bolt —
    all sharing one `combat.enemy` pool — the fix was a **visual tag on the
    projectile** (`Projectile.visual: 'bolt' | 'rocket'`, copied from the firing
    `WeaponSpec.projectile` in `spawnProjectile`), NOT a second pool: `Tracers`
    skips `visual==='rocket'` and a sibling `EnemyRockets` draws those, so one
    pool renders as two things by a per-item tag. And keep the render↔logic
    agreement seeded, not slot-derived: the soldier's rocket-vs-SMG `variant`
    lives on the target (read by both StrikeRig for the weapon and the pool for
    which model is visible), so a compacting pool never shows a launcher firing
    bullets.

86. **A persistent world-space trail (a rocket contrail) is puffs left in
    place and faded by age — keyed by the STABLE pool index, not the compacting
    render slot — and `PointsMaterial` can't fade per-vertex, so a tiny
    `alpha`-attribute points shader does it in one draw call.** The soldier
    rocket's first trail was a cone glued to the warhead (a motion streak): it
    moved with the rocket and vanished on despawn, so it never marked the flight
    path. A real contrail (`EnemyRockets`) instead **emits puffs into world
    space** at the rocket's position every `EMIT_DIST` units and never moves
    them — they hang where they were dropped and fade over `LIFETIME`, so the
    smoke line lingers a beat after the rocket passes or detonates. Three things
    made it clean: (a) **key the per-rocket puff ring by the enemy *pool* index,
    not the render slot** — the pool `Projectile` objects are stable across a
    rocket's life while the compacted warhead slots shift as rockets despawn;
    keying by render slot would splice two rockets' trails together. Detect the
    pool slot being reused (an inactive→active edge) and clear that block, or a
    new rocket inherits the dead one's smoke. (b) **Emit by distance, not per
    frame**, for framerate-independent spacing, and size the ring so a puff ages
    out before it's overwritten (`PUFFS * EMIT_DIST > LIFETIME * speed`). (c)
    **Fade needs a shader**: `PointsMaterial` has one global size/opacity and
    `vertexColors` carries no alpha, so a ~15-line `<shaderMaterial>` with a
    per-vertex `alpha` attribute (size-attenuated, growing as it fades) keeps
    the whole effect a single draw call — the `RainField` `Points` discipline,
    plus per-point life. All buffers pre-allocated and mutated in place (the
    zero-alloc `useFrame` rule).

87. **Two actions that share a timeline read as ONE action — differentiate
    by pose arc and pacing, not by a modifier layered on the same beats.**
    Bazooka Joe's Take Aim was Rocket Launch's exact 2.6 s loop (recoil,
    backblast, warhead-away, fireball) plus a ±7° elevation bob — the bob
    was invisible next to the explosion firing every loop, and the user
    reported the two actions as identical. The fix restructured Take Aim
    into its own arc (raise into a level chest-height sighting hold →
    track with settling sweeps → ONE shot → lower, ~4.2 s): different
    silhouette, different rhythm, the shared beats reused only inside the
    distinct arc. Rule of thumb: if two moves differ only by a low-amplitude
    modulation on top of identical dominant events, viewers will see one
    move — give each action its own dominant event order or hold pose.

88. **A patrolling enemy needed NO new movement code — a mover is the existing
    sinusoidal drift seeded onto a new kind — and a believable walk is sold by
    translation + facing + a body bob, no leg gait.** Turning the static rooftop
    soldiers into walking patrols (rooftop pacers + free-roam ground patrols)
    looked like it wanted a bespoke `stepSoldier`; it didn't. `stepDrift`'s
    sinusoid branch (the drifting ring-drones' code) already paces a target
    around its `base` along an axis and writes the true velocity derivative for
    shot-leading — so seeding a soldier with `driftAmp > 0` + a horizontal
    `driftAxis` makes it patrol for free (ease-in-out at the turnarounds is a
    bonus), and the fire step (`stepTurret`) reads the moving `t.pos` unchanged.
    The lesson: before writing a new step function, check whether an existing
    one *parameterises* to the new behaviour. Three supporting points: (a)
    **no model in this repo animates legs** — the operator "walks" with pure
    translation + heading + a `|sin(walkPhase)|·0.05` body bob; a patrol reuses
    that (bob derived from position × speed so it fades to nothing at the
    turnarounds — no `dt` needed in the render hook), and a real gait is a
    deferred, shared-rig upgrade, not a per-model retrofit. (b) **A single body
    yaw can't face two ways** (torso is welded to the body group; only arms
    pivot), so arbitrate it by state — face travel while `fireTimer===0`, snap
    to the player while firing — and slew shortest-arc; the weapon *elevation*
    (arm pitch via the aim ref) is independent of body yaw, so only azimuth
    conflicts. (c) **Seat by feet-offset, not by surface**: seating a soldier
    at `t.pos.y - torsoLift` plants the boots on a rooftop *or* the ground with
    the same code — the only difference between a rooftop pacer and a ground
    patrol is the seeded `base.y`, so one render path serves both. Free-roam
    ground placement just validates the whole beat (centre + both endpoints)
    clear of buildings at seed time, so the route never needs runtime collision.
