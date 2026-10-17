# Puppy Rescue widget — design notes

A stealth-rescue maze game: you are a dog sneaking through a 3D maze to free
caged puppies. Each freed puppy follows you in a conga line, and you lead
them all out of the green **ESCAPE** door. Dog catchers stand guard or
patrol, and each one has a red **vision cone**. Stay out of every cone,
and keep your tail out of them too.

Modelled on the "Dog Rescue" style of mobile ads (two reference screenshots
supplied by the user). Round 1 shipped the playable core: 10 levels in two
tiers. Round 2 added **sweeping sentries** and the **gold key → padlocked
pen**, bringing the pack to 20 levels in four tiers. Round 3 added
**hiding spots (bushes)** and a fifth tier, **Hide**, for 25 levels.
Round 4 added the **Bark lure**, an optional tool available in every level.
Round 5 added **Easy and Arcade modes** beside Classic: a mode picker
next to the level picker, each mode keeping its own stars and bests.
Round 6 added the **💡 Hint**: a ghost replay of the level's proven 3-star
route. Then came **colour themes**: five floor/surround sets in ⚙, with
Sunshine (blue floor on yellow) the new default. Then **pick your dog**:
six hero coats in ⚙ (two with real markings), and the dog's ground ring and
the stick knob now follow the theme. Round 7 added **doors and pressure
plates** and a sixth tier, **Doors**, for 30 levels. Round 8 added
**security cameras** and a seventh tier, **Cameras**, for 35 levels.

## Decisions (settled with the user before building)

| # | Question | Decision |
|---|---|---|
| 1 | How does the dog move? | **Free movement** with a **fixed joystick in its own strip under the maze** (any direction, full speed past a small dead zone; Left / Centre / Right in ⚙, default Centre), or arrows/WASD. Revised twice after play-testing; see *Touch control*. No inertia, so the dog stops when you let go, and corner assist slides it into gaps. |
| 2 | What happens when you're spotted? | **Caught = retry in under a second** (Round 1). Easy mode (the netted puppy goes back to its cage) and Arcade mode (catchers chase, then search) shipped in Round 5; see *Modes*. |
| 3 | 2D or 3D? | **3D only**, low-poly toy look like the screenshots, in a lazy three.js chunk. A 2D view is in the backlog. |
| 4 | Camera | **Fixed portrait**: the whole maze is always visible from a tilted camera fitted to the card, with the exit at the top. Fullscreen prefers portrait. |
| 5 | Round 1 scope | **Small and polished**: 10 levels, Sneak (static catchers) + Patrol (walkers). |
| 6 | Stars | ★ escaped · ★ every puppy · ★ **never spotted** (the "?" meter never started). The best time per level is kept separately. |
| 7 | Level picking | **Unlock in order** (escaping level n opens n+1), plus an **Unlock all levels** switch in the ⚙ menu. |
| 8 | Name | **Puppy Rescue** |
| 9 | Hero | One orange/tan pup; freed puppies come in 4 coat colours. Six pickable dogs came later; see *Pick your dog*. |
| 10 | Catchers | A new chunky model: dark round body, white collar, hat, red-handled net. |

### Round 2 decisions (sentries, key and pen)

| # | Question | Decision |
|---|---|---|
| R2-1 | How does the pen count toward the stars? | **The pen is the goal.** In a key-and-pen level, the "every puppy" star needs the whole pen crowd out of the door. |
| R2-2 | How long does the line get? | **Pen puppies huddle closer**, at `PEN_GAP` = 0.3 cells (caged puppies keep 0.55), so a pen of 6–8 makes a tail of about 2–2½ cells. |
| R2-3 | How do sentries move? | **A smooth sweep back and forth** across a 90–120° arc (default 45°/s), with a 0.6 s pause at each end. |
| R2-4 | Tier order | **Sentry first (levels 11–15), then Key & Pen (16–20).** Key & Pen levels use all three catcher types. |
| R2-5 | The tip covering the maze | **A compact banner above the maze**, gone on the first move. |

### Round 3 decisions (hiding spots)

| # | Question | Decision |
|---|---|---|
| R3-0 | What's next? | **Hiding spots now; the Bark lure in its own later round.** Bark pulls a catcher off its fixed track, which breaks the "pose is a pure function of time" rule the solver depends on. |
| R3-1 | How does hiding work? | **Hidden only while standing still** in a bush. Moving, even inside it, reveals the dog. Puppies are never hidden. |
| R3-2 | Can a catcher catch a hidden dog by walking into it? | **Yes.** Touching still catches, so a bush on a walker's route is a trap. |
| R3-3 | Where do the levels go? | **A new Hide tier, levels 21–25, after Key & Pen.** |

### Round 4 decisions (the Bark lure)

| # | Question | Decision |
|---|---|---|
| R4-0 | What's next? | **The Bark lure, as an optional helper.** Every level stays proven 3-star-escapable without it. |
| R4-1 | What does a catcher do when it hears a bark? | **Walk over and investigate:** the nearest catcher within about 4 cells (through walls) walks the shortest path there, cone on, looks around for about 2 s, walks back and resumes its route exactly where it left. |
| R4-2 | How often can you bark? | **Unlimited, with a 6 s cooldown**, shown as a filling ring on the button. Barking never counts as being spotted. |
| R4-3 | Which levels? | **Every level, no new tier**, with a short first-use tip. |
| defaults | Controls and feedback | The button sits opposite the stick in the strip (right when the stick is centred); **Space** or **B** also bark. Static catchers and sentries leave their post too. A woof, an expanding ring and a "?" over the drawn catcher. |

### Round 5 decisions (Easy and Arcade modes)

| # | Question | Decision |
|---|---|---|
| R5-1 | Scope | **Both modes in one round**, with Classic the default. Every proof is a Classic proof, and a Classic run is bit-identical to before. |
| R5-2 | Easy: the meter fills on a puppy | **The net cuts the line:** that puppy and every one behind it go back to their cages, and the meter resets. The ones ahead stay with you. The dog itself being seen is still a catch. |
| R5-3 | Arcade: chase speed | **0.9× the dog.** On "!", the catcher runs at the dog, follows to where it lost sight, searches about 3 s, then walks home. You can always pull away by keeping moving. Only a touch catches. |
| R5-4 | Arcade: a catcher touches a puppy | **The Easy rule:** the line is netted from that puppy back; the chase goes on. Touching the dog is caught. |
| R5-5 | Records | **Separate stars and bests per mode**; an escape in **any** mode unlocks the next level. Pre-mode records became the Classic records. |
| R5-6 | Where's the picker? | **A Classic / Easy / Arcade dropdown beside the level picker** (the user asked for the recommendation). Switching restarts the level, confirm-guarded mid-run, and a HUD badge shows EASY / ARCADE (CHASE! while chased). |
| defaults | Arcade details | A bush (standing still) hides you from a chaser too, so it searches beside you without touching. A bark can't draw a catcher that's already chasing. Only the catcher that spotted you chases. A red "!" and a sting on the chase. |

### Round 6 decisions (the 💡 Hint)

| # | Question | Decision |
|---|---|---|
| R6-0 | What's next? | **"Show me how": a ghost replay** of the planner's proven route. |
| R6-1 | How does the hint play? | **Watch, then play.** Before your first move, 💡 Hint replays the proven 3-star route with the catchers moving exactly as they will in your run, then the level returns to ready, untouched. |
| R6-2 | Does it cost anything? | **Free.** Watch as often as you like; stars are unaffected. |
| R6-3 | Speed and controls | **Real time by default**, a ⏩ 2× toggle, tap anywhere on the maze (or Escape) to skip. |
| defaults | Look and source | The button sits beside Restart, only while ready. The dog is a see-through ghost under a "💡 Hint — tap to skip" banner. The Classic route plays in every mode (it's never seen, so it works in Easy and Arcade too). Routes ship pre-computed: the planner takes up to ~3.3 s on Patrol 5 in node, too slow for a phone at tap time. |

### Theme decisions (floor and surround colours)

| # | Question | Decision |
|---|---|---|
| T-1 | Which sets? | **Sunshine (default)**, Toybox (the original violet-on-cyan look), Ocean, Night Watch, Sandbox. The user asked for a yellow option; yellow went AROUND the maze, since a yellow floor would swallow the gold key, the Bark ring, the orange dog and the white walls. Slate and Lavender Dream were proposed but not taken. |
| T-2 | Default | **Sunshine**, for existing cards too (a card with no saved theme opens as Sunshine). |
| T-3 | Where's the picker? | **The ⚙ menu, a row of swatch chips** split floor/surround. It applies instantly, even mid-run (looks only, no restart), and is saved per card. |
| T-4 | The strip and tip banner | **Follow the theme**, using a deep shade of each floor. |

### Pick-your-dog decisions

| # | Question | Decision |
|---|---|---|
| D-1 | What's on offer? | **Six dogs, colours plus real markings** (the user asked for the recommendation): Ginger (the original), Golden, Dalmatian (spots), Husky, Black & Tan, Chocolate. Accessories were not taken. |
| D-2 | The picker | **A row of coat chips in ⚙ next to Theme**, applied live (even mid-run, no restart), saved per card. |
| D-3 | The violet leftovers | **Follow the theme:** the hero's ground ring takes the theme's deep `strip` shade, and the stick knob a bright per-theme `knob` accent. |
| defaults | | Ginger stays the default, so existing cards look the same. Rescued puppies keep their own four coats; the hero is bigger and wears the ring. The hint ghost wears your dog. |

### Round 7 decisions (doors and switches)

| # | Question | Decision |
|---|---|---|
| R7-1 | What does a plate do? | **Toggle** (the user asked for the recommendation): each step on flips its doors open↔shut, and they stay flipped. Shut doors block movement AND catchers' sight. |
| R7-2 | Who triggers a plate? | **Only the dog**, once per step on; the puppy line crosses plates harmlessly. |
| R7-3 | Showing which plate works which door | **Colour-coding plus a symbol**: red ▲, yellow ●, green ■ on plates and door bars. Bars rise when shut and sink to a floor strip when open. |
| defaults | | A **Doors** tier after Hide (levels 26–30). Doors may start open or shut. Catcher tracks never cross a door, no plate sits beside its own door, and puppies follow the trail through a doorway even after it shuts. The planner carries door bits; the sweep proves each Doors level needs its plates; the new levels get stored hints. |
| changed in build | Colours | The middle colour was planned as **blue**, but blue plates and doors nearly vanished on the Sunshine and Ocean floors, so it became **yellow** (same ● symbol). Open doors were planned to sink out of sight; they stop at floor level instead, so you can see where they'll shut. |

### Follow-up: catchers and shut doors

| # | Question | Decision |
|---|---|---|
| F-1 | A door shuts across a lured or chasing catcher's way | **Re-route, or wait at the door if there's no other way** (trapped until it opens, then home and back on its route exactly). |
| defaults | | It re-checks at each doorway and sets off the instant a way opens; one mid-doorway finishes stepping through; it applies to every off-route walk (bark go/back, chase, homing); a trapped catcher still sees and catches; hint replays and proofs are unaffected (they never bark or chase). |

### Round 8 decisions (security cameras)

| # | Question | Decision |
|---|---|---|
| R8-1 | Seen by a camera | **Like a catcher's cone:** the same "?" meter, with the mode's usual result (Classic caught, Easy a puppy netted, Arcade the nearest catcher chases to the spot). |
| R8-2 | Plates | **The same toggle as doors, shared by colour:** a plate flips every door AND camera of its colour, on↔off. |
| R8-3 | Cone shape | **Longer and narrower** than a catcher's (5 cells, 40°), a steady sweep, a pale violet beam, gone while switched off. |
| defaults | | A **Cameras** tier after Doors (levels 31–35). A camera hangs on the wall behind its cell, may start on or off, wears its colour band + symbol (none = always on); no body; walls and shut doors block it; barks don't touch it. Arcade with no catcher: the meter just resets. Proven 3★ with stored hints, and every Cameras level with plates must need them. |

**Detail I chose myself (not asked):** the door opens once the **first**
puppy is freed. That way you can't skip a level with 0 puppies and still
unlock the next one, but you can still escape without every puppy, at the
cost of a star.

## Gameplay rules (as built)

- **World.** One unit is one maze cell. Walls are thin segments on cell
  edges, and maps are 5×7 to 7×11 cells. Row 0 is the top, where the exit
  door is.
- **Dog.** It moves at 2.5 cells/s (`DOG_SPEED`), chosen so one cell takes
  exactly 24 fixed steps (`CELL_FRAMES`). Letting go stops it at once.
  - **Collision:** the dog is a circle (r 0.26) sliding along wall
    capsules (half-thickness 0.07), so you never catch on a corner.
  - **Corner assist:** if the main axis is mostly blocked and you're
    within 0.45 of a cell-centre line, the dog slides onto it, Pac-Man
    style. That turns "push up just past a gap" into a clean turn.
- **Touch control: a fixed stick in a strip under the maze** (third
  version, after two rounds of play-testing).
  - **The stick never moves.** It's the shared `droneSim/VirtualJoystick`
    (it tracks its own finger, zero renders), sitting in a dark control
    strip (`puppy-stick-strip`) below the maze, so it never covers the
    board, the dog's start row included.
  - **Any direction, full speed past a small dead zone.** The stick's
    rescaled output is normalised to a unit vector once it passes
    `STICK_DEAD` (0.15, about 10 px on the 76 px stick), so speed doesn't
    ramp with how far you push. Lift to stop.
  - **Position:** Left / Centre / Right in the ⚙ menu (`stickSide`,
    default Centre).
  - **Only the stick steers.** A drag on the maze does nothing, so looking
    or a stray palm never moves the dog. The arrow keys and WASD don't
    change.
  - **History:**
    - v1 was a floating stick that appeared wherever you touched, with
      speed ramping across a 28–56 px throw. Holding it felt sluggish.
    - v2 kept it floating but gave full speed past 10 px, plus a ring
      leashed to a sliding thumb.
    - The play-tester then pinned the real problem on the floating ring
      itself: "the joystick keeps shifting". A control that moves under
      the thumb gives it no home, hence v3.
  - **Framing:** the strip eats the vertical slack a tilted 7×11 maze
    leaves in a tall card. `CameraRig` hugs the maze (wall tops plus the
    door marker only, 98.5% fit), so there are no empty bands above and
    below.
- **Cones.** 75° wide (`CONE_HALF` = 37.5°) and 3.5 cells long. Walls block
  them: the cone drawn on the floor is built from the same rays
  (`coneRays`) that the detection test (`seenAt`) uses, so what you see is
  what catches you.
- **The "?" meter.** It fills while anyone (the dog *or* any puppy in the
  line) is inside a cone.
  - Fill time is 0.4 s at the near edge and 0.8 s at the far edge.
  - It drains in 1 s once nobody is seen.
  - When it's full you're caught. The guard shows "?" while filling and
    "!" on the catch.
- **Touching a catcher** (within 0.6) is an instant catch, cone or not, so
  you can't hug a catcher's back.
- **Caught** shows the net swing, a "Caught!" banner that says whether the
  dog or a puppy was seen, then a fresh attempt 900 ms later.
- **Puppies.** You open a cage by getting within 0.6 of it. Each puppy
  follows the dog's path at a fixed 0.55-cell spacing (a breadcrumb trail),
  so it never cuts corners through walls. Puppies don't slow the dog, but
  they are seen, and a long tail is the main source of difficulty.
- **Escape** happens when the dog reaches the door cell (y < 0.55) with the
  door open.
- **Catchers.** Each one's pose is a pure function of time (`guardPose`):
  - **Static:** one point and a facing (any angle, including diagonals).
  - **Back-and-forth walkers:** waypoints, 0.6× the dog's speed, a pause
    with a 180° turn at each end, and 0.3 s turns at inner corners.
  - **Sentries (Round 2):** one point plus `sweep` (total arc, °) around
    `facing`. The cone turns smoothly at `sweepRate` (default
    `SWEEP_RATE` = 45°/s) from one edge of the arc to the other, holds
    `pause` (default 0.6 s), and turns back. Facing is still a pure
    function of time, so the planner treats sentries like walkers (time
    matters), with no special code.
  - **Loops:** supported (`loop: true`) but not used yet. They're Round 4.
- **Gold key, padlock and pen (Round 2).**
  - **Key:** a key in the maze (`K`) is picked up within `KEY_R` (0.5).
    It floats above the dog (and a key icon shows in the HUD) until it's
    used.
  - **Padlock:** an edge (`L`) that blocks movement **and** sight like a
    wall while shut.
  - **Opening:** carrying the key within `LOCK_R` (0.65) of the padlock's
    centre opens it. The padlock lifts away and the edge becomes open floor.
  - **The pen joins at once:** its `PEN_PER_CELL` (2) puppies per `P`
    cell join the end of the line together, huddled at `PEN_GAP`. That
    counts as one "freed" event (one yip), and opens the door if it's the
    first rescue.
  - **Stars:** the pen counts toward "every puppy"
    (`puppyCount = cages + pen`).
  - **Parse check:** a level must have all of key, padlock and pen, or none
    of them; anything else is rejected at parse time.
- **Bushes (Round 3).**
  - **Map:** a `B` cell is walkable floor with a leafy bush on it.
  - **Hidden:** the dog is hidden when it's in a bush cell and didn't move
    this frame (`RescueState.hidden`). Cones skip it entirely, and a
    hidden dog never turns a cone hot.
  - **Not covered:** puppies are always tested; a catcher's touch
    (`BUMP_R`) still nets the dog.
  - **Feedback:** settling in plays a rustle (`ev.hide`), the dog crouches
    into the leaves, and a green "hidden" badge shows in the HUD.
- **Bark (Round 4).** `bark(level, s)`, from the button, Space or B, makes
  a woof and starts the 6 s cooldown (`BARK_COOLDOWN`), whether or not
  anyone hears it.
  - **Who hears:** the nearest catcher within `BARK_R` (4 cells, straight
    line, through walls) that has a walkable cell path to the dog's cell
    (`ev.heard`).
  - **The lure** (`RescueState.lure[g]`), step by step:
    - **go:** walks the BFS cell path at patrol speed, facing where it
      walks, cone on.
    - **look:** a ±60° sweep about its arrival heading for `LURE_LOOK`
      (2 s).
    - **back:** walks the same path back to the exact spot it left.
    - **turn:** eases (0.4 s) to its route's heading, then rejoins the
      route.
  - **Each catcher has its own route clock** (`gclock[g]`). It ticks with
    the game clock while on the route and pauses while lured, so the
    catcher resumes exactly where it left. Without a bark it equals `t`
    bit for bit, which is why every existing proof still holds.
  - **Re-barking:** a bark while a catcher is already lured re-targets it
    and keeps its original departure point.
  - **Still dangerous:** a lured catcher still sees and still catches, so
    barking with nowhere to go gets you netted.
  - **The solver never barks.** Bark only ever makes a level easier or
    faster.
- **Modes (Round 5).** `RescueState.mode` (`initialState(level, mode)`,
  default `'classic'`) changes only what happens when the meter fills, plus
  touch in Arcade:
  - **Classic:** a full meter on anyone is a catch. Everything the planner
    proves is Classic.
  - **Easy:** a full meter on a **puppy** calls `netFrom(level, s, j)`:
    line slot `j` and everyone behind it go home and the meter resets
    (`ev.net`). A caged puppy is caged again (walk back to free it); a pen
    puppy sits back in the open pen (touch any pen spot and all of them
    rejoin). Netting the whole line shuts the door again, since the door is
    open while the line is non-empty. The dog seen is still a catch.
  - **Arcade:** a full meter makes that catcher **chase** (`ev.chase`, the
    meter resets for the others). The chase rides the Bark lure seam:
    `lure[g].mode` runs `chase → search → back → turn`, with the route
    clock paused throughout.
    - **chase:** at `CHASE_SPEED` (0.9 × `DOG_SPEED`). It sees the dog in
      **any** direction within `CHASE_SIGHT` (5 cells), but walls and a
      bush still block. In sight it runs straight at the dog; out of sight
      it takes the BFS cell path to the last-seen spot. It never crosses a
      wall: a straight run needs clear sight, and moving from inside one
      cell to the centre of an open neighbour stays inside the two.
    - **Losing sight makes one guess.** Lost round a corner or out of range,
      it heads **one cell further in the dog's last heading**, so it peeks
      round the corner it saw you take. Lost to a bush, it stops
      `CHASE_STOP` (0.8) short of the spot, outside touching range, so
      hiding works.
    - **search:** a ±90° look-around for `SEARCH_S` (3 s). A glimpse in its
      normal cone restarts the chase. Then **back** along the shortest path
      to where it left its route, and **turn** onto it.
    - A chasing or searching catcher (`isAlert`) doesn't fill the meter and
      ignores barks. Touching the dog is caught; touching a puppy nets the
      line from it (`netFrom`).
  - **Records:** `recordKey(mode, id)` gives the bare id for Classic (so
    old records are the Classic ones) and `"easy|sneak:0"` /
    `"arcade|sneak:0"` otherwise. The picker shows the current mode's
    stars; `unlocked(i)` accepts an escape of level i−1 in any mode.
  - **Feedback:** a "Netted! N puppies back in the cages" note and a
    swish-whimper sfx; in Arcade a red "!" over the chaser, its cone hot, a
    rising sting, and the HUD badge flashing **CHASE!**.
- **💡 Hint (Round 6).** Shown beside Restart while the level is ready.
  Tapping it swaps in a **ghost run**: a fresh Classic `RescueState`,
  started, stepped by the widget's own loop with `routeInput` over the
  level's stored route instead of the stick (`SimView.ghost`). It is the
  real simulation, so the catchers move exactly as in your run.
  - **Speed:** 1×, or 2× via the ⏩ toggle (the loop steps the sim twice as
    often; up to 16 steps a frame).
  - **Ending:** 0.9 s after the ghost escapes, or at once on a tap on the
    maze or Escape, `restart()` puts the level back at ready.
  - **Records nothing:** a ghost run never reaches the status handler that
    records stars, shows the result card or counts the escape jingle. Bark
    and the stick are ignored while it plays.
  - **Look:** the hero's materials go 45 % opaque (restored after), under a
    "💡 Hint — tap to skip" banner; the tip banner hides.
  - **The hint pack** (`rescueHints.ts`, GENERATED by
    `node scripts/gen-puppy-hints.mjs`): each level's quickest planner route,
    keyed by level id, encoded by `encodeRoute` (`x,y` = walk to that cell's
    centre, `w<t>` = wait until game time t) and read by `decodeRoute`. The
    `180-puppy-model` sweep replays every stored hint exactly as the widget
    does and fails a missing or stale one, so **re-run the generator after
    adding or tuning a level**.
- **Themes.** `puppyThemes.ts` (pure data, shared by the widget and the
  lazy 3D view) defines each theme's `floor`, `surround` (the canvas clear
  colour via `<ClearColor>`, and the stage background shown before the
  canvas loads), `strip` (the control strip, tip banner and hint banner)
  and `strip2` (the Bark button's inner disc), plus two derived tints:
  `pen` (the open pen's floor patch) and `rim` (the side light).

  | Theme | Floor | Surround | Strip |
  |---|---|---|---|
  | Sunshine (default) | `#4a6fe3` | `#ffe066` | `#22357f` |
  | Toybox | `#7b6cf2` | `#48d3f2` | `#2a2554` |
  | Ocean | `#2f6fd6` | `#9be7ff` | `#173a73` |
  | Night Watch | `#3b3a6b` | `#141a33` | `#0d1126` |
  | Sandbox | `#c9a36a` | `#87ceeb` | `#5c4322` |

  - **Fixed in every theme:** the cones, walls, door, bushes, key and
    characters. A floor qualifies only if all of those still read on it:
    mid-tone and cool or neutral, not green (bushes), pink or red (cones)
    or pale (walls).
- **Pick your dog.** `DOGS` in `puppyLook.ts` (`dogById`, `coerceDog`,
  default `ginger`) gives each dog a `Coat`. Beyond `body`/`ears`/`snout`,
  a coat may set optional markings, each a few extra matte boxes or
  spheres on the same low-poly `Dog`: `paws` (socks), `belly`, `mask`,
  `spots` (Dalmatian, half-sunk squashed spheres), `brows`, `eyes`,
  `saddle` (a back and head cap) and `tailTip`.
  - **Designed for the camera:** the fixed camera mostly sees the dog's
    back, and at the start it faces away. So face-only markings (a husky
    mask, tan eyebrows) were invisible in the first screenshots, and Husky
    became a white dog with a grey **saddle** and cap, and Black & Tan got
    a tan **tail tip** and socks on top of its tan muzzle.
  - The ⚙ chips paint each coat (spots as dots, a saddle as a split). The
    hero `Dog` is keyed by the dog id so a switch remounts it; the ghost
    look is re-applied if that happens during a hint replay.
- **Doors and plates (Round 7).** Map chars: a cell `r`/`y`/`g` is a
  pressure plate; an edge `R`/`Y`/`G` is a door of that colour shut at the
  start, `r`/`y`/`g` one open at the start.
  - **Toggle by colour.** `RescueState.sw` holds one bit per colour.
    Entering a plate's cell (`s.cell` changes to it) flips that colour's
    bit, so every door of the colour flips (`doorIsOpen(level, k, sw)` =
    its start state XOR the bit). Standing or shuffling on a plate never
    re-fires; stepping off and on again does (`ev.plate`).
  - **A shut door is a wall** for the dog (`resolve`), for `canStep`
    (grid edge value 3 + `hDoor`/`vDoor` index) and for sight
    (`lineOfSight`/`seenAt`/`rayLength`/`coneRays` take `sw`), so the cones
    are clipped by shut doors live.
  - **Catchers respect doors (follow-up to Round 7).** A catcher off its
    route (walking to a bark, back from it, chasing, or homing after a
    search) checks each doorway before it reaches it (`doorBlocks`). If the
    door is shut it re-plans around it (`replanWalk`, a BFS under the live
    door state); if there's no way round it is **trapped**: it waits
    beside the door, facing it and looking side to side with its cone on
    (`Lure.stuck`), route clock still paused, and sets off the moment a
    way opens. One already in the doorway (within 0.3 of the edge) steps
    through rather than sticking in the door. So luring a catcher into a
    room and shutting the door holds it there. Found in play: the first
    Round 7 build planned a lure walk once and walked it through shut
    doors.
  - **Load-time rules** (`parseLevel` throws): every door has a plate of
    its colour; no plate sits right beside a door of its own colour (it
    could slam on the dog); no catcher track crosses a door (tracks stay
    pure functions of time). Puppies never collide, so they follow the
    trail through a doorway even after it shuts.
  - **Look:** a coloured pad with a white ▲/●/■ (`Plate`, it dips while
    the dog stands on it); a coloured bar with the symbol on both faces
    (`DoorBar`), raised when shut and sunk to a floor strip when open; a
    click-clunk sfx on each press.
- **Security cameras (Round 8).** `LevelSpec.cameras`: `{ cell, facing,
  sweep?, rate?, pause?, phase?, colour?, off? }`. Parsed into `Level.cams`
  (a sentry `GuardTrack` on the cell, a colour index or -1, the start state,
  and a mount point `CAM_MOUNT` 0.38 back from the cell centre, against the
  wall behind it).
  - **Beam:** `CAM_RANGE` 5, `CAM_HALF` 20° (a catcher: 3.5, 37.5°),
    default sweep `CAM_RATE` 40°/s. `camPose(level, k, t)` is a pure
    function of the GAME clock (cameras are never lured), so the planner
    and the sim agree.
  - **Switching:** `camOn(level, k, sw)` = start state XOR its colour's
    plate bit (always the start state when uncoloured), the same bits as
    doors.
  - **Detection:** after the catchers, each live camera tests the dog (not
    when hidden in a bush) and every puppy with `seenAt(…, CAM_RANGE,
    CAM_HALF)`; walls and shut doors block. All sightings feed ONE meter,
    filled at the most urgent sighting's rate (`fillFor(d, range)`, near
    fills faster), which with catchers alone is exactly the old fill, so
    every earlier proof stands. `s.camSeeing` bits, `s.caughtCam` on a
    camera catch ("A camera spotted you."). Arcade: the alarm sends the
    nearest catcher that isn't already chasing; with none, the meter resets.
  - **Look:** a white camera head on a wall bracket (`SecurityCamera`),
    yawed to the beam, drooping when off, with its colour band and symbol;
    the beam a pale violet wedge (hot pink while it sees someone), clipped
    by the same rays as detection (`coneRays` takes a range and half-angle).
- **The clock** (and the catchers) start on the first move. A level always
  opens in the same state, and you get time to read the tip.
- **The tip** is a slim banner between the level picker and the maze, never
  over it, so the door and cages stay visible. It disappears on the first
  move. (Round 1's overlay covered the top rows once the camera hugged the
  maze.)

## Architecture

```
puppyRescue/
  rescueModel.ts     pure sim: parseLevel, step (fixed 1/60 s), guardPose,
                     seenAt / coneRays / lineOfSight, pointBack (puppy line),
                     starsFor, routeInput (route follower for replays)
  rescueLevels.ts    the append-only level pack (ASCII maps + catcher specs)
  rescuePlanner.ts   the level prover (BFS over cell × puppies × time)
  rescueSounds.ts    Web Audio SFX (yip, door, "huh?", caught, escape)
  PuppyRescueWidget  shell: rAF loop, input, HUD, picker, ⚙ menu, overlays
  PuppyRescue3D.tsx  lazy chunk: the scene, a pure view over the sim ref
  puppyModels.tsx    Dog / Catcher / Cage / GoalMarker / AlertMark / Blob
  puppyLook.ts       Anim + coat colours (model inputs)
```

- **The shell owns the simulation.** A `requestAnimationFrame` loop runs
  fixed steps from an accumulator capped at 8 per frame, reading input
  from refs. React re-renders only when something the HUD shows changes:
  the status, the puppy count, the spotted flag, the result.
  - The timer text is written straight into the DOM.
  - Telemetry goes to the root's `data-*` every 50 ms.
- **The 3D view is a pure view.** It gets the sim ref and reads it in
  `useFrame`, moving meshes directly. So the game works the same whether or
  not the chunk has loaded, and a caught/escape is decided only by the model.
- **Map format** (`LevelSpec.map`) is an ASCII grid of `(2·rows+1)` lines
  by `(2·cols+1)` chars:
  - Odd/odd chars are cells: `.` floor, `D` dog start, `C` a caged puppy.
  - Chars between cells are edges: `-`, `|` or `#` is a wall, a space is
    open.
  - `+` marks a post (ignored).
  - One `E` on the top border is the door.
  - The parser merges edge walls into runs for collision, sight and
    rendering.
- **Low-spec look.**
  - Matte `meshStandardMaterial` only: no transmission, no emissive, no
    real shadows (dark blob discs instead).
  - Cages are bars, not glass.
  - The cone is one dynamic fan geometry per catcher (33 rays).
  - "?" and "!" are built from primitives, so no font is loaded.
- **Dog walk** uses the shared leg-gait constants on four legs, swinging
  the diagonal pairs together (front-left with back-right). The catcher's
  two legs use the same rig.

## The level pack and the planner

Levels are **hand-authored** (Car Park's lesson #126: rare, interesting
puzzles ship as a pack). Every level is **proven** escapable with 3 stars:

- `planLevel` runs a breadth-first search over (cell, puppies-freed mask,
  time step). Each action is a one-cell move or a wait of exactly one
  cell-time (0.4 s), so the plan's timeline matches the real sim's
  frame for frame.
- Every check runs against an **inflated** catcher: cone +0.3 cells and
  +4°, bodies 0.2 bigger, bump +0.35, cages picked up 0.15 early. A route the
  planner calls safe stays safe in the continuous game.
- The route is replayed through the real `step` with `routeInput`, which
  steers straight at each waypoint and lands on it exactly. The replay must
  escape with 3 stars, never spotted.
- When every catcher is static, nothing depends on the clock, so the search
  is a plain BFS with a global visited set. That takes milliseconds,
  against about a second for patrol levels.
- **Round 8: cameras in the search.** `exposed` also tests every live
  camera (per the node's plate bits) with the same margins (+0.3 range,
  +4°, body points) against its beam at each sample time; a level with a
  sweeping camera is never `timeless`. A fixed +4° is proportionally much
  bigger on a 20° beam than on a 37.5° cone, so the first sweeping-camera
  drafts were unsolvable; a parameter grid (cell × facing × sweep × rate ×
  pause) found tight but provable settings for Searchlight.
- **Round 7: doors in the search.** The mask gains three plate bits
  (`SW`, one per colour). A move INTO a plate's cell flips its bit; the
  move's samples use the old door state before the edge crossing, the new
  one after it, and BOTH near it (f in 0.4–0.6), the safe direction.
  `canStep` and every exposure check take the node's door state.
  `planLevel(…, noPlates)` freezes the doors, and the sweep proves each
  Doors level **needs** its plates: all five are unsolvable without.
- **Round 3: bushes in the search.** A *wait* action in a bush cell hides
  the dog for that whole step; every move sample counts as visible. That
  matches the game, where the frame the dog arrives it's still moving.
  `planLevel(level, maxTime, noHide)` can ignore bushes, and the sweep
  uses it to prove each Hide level **needs** its bushes: unsolvable, or at
  least 3 s slower, without them. All five are unsolvable without.
- **Round 2: key and pen in the search.**
  - The state mask gains a "holding the key" bit and a "pen open" bit.
  - The padlock edge is passable only with pen-open (`canStep(…, penOpen)`),
    and it blocks sight until then (`seenAt(…, shut)`).
  - The goal mask is every cage plus the pen.
  - Each node also carries the **freeing order**. Caged and pen puppies
    sit at different gaps, so the order decides where each one stands in
    the line. The dedupe key still ignores it, the same accepted
    incompleteness as the trail history.

The e2e sweep (`180-puppy-model`) re-proves every level on every run. It
also checks that catchers' paths don't cross walls and that nobody can see
the start.

**What made a bush necessary (Round 3 authoring).**
- A single sentry sweeping an open hall never forced the bush: there's
  always a cell the cone isn't on.
- A sentry looking down a long corridor didn't either: most of it was
  beyond the cone's 3.5-cell reach.
- The pattern that works is a **walker in a one-cell corridor with the
  bush in a side alcove**. The dog can't pass the walker, so it waits in
  the alcove while the walker goes by, then follows behind it.
- Puppies are never hidden, so each Hide level puts the bush **before**
  the rescues, or keeps the tail out of the corridor (for example, the key
  at the bottom and the pen by the door).

**Authoring workflow used for Round 1** (scratch tooling, not committed):
1. Sketch the walls.
2. Run the planner with and without catchers. The "free" time against the
   guarded time shows whether a catcher actually matters.
3. Draw a coverage map (the share of time each cell is watched).
4. For static levels, a greedy placer tried every cell × 8 facings and kept
   the catcher that lengthened the 3-star route the most. It rejected cones
   shorter than 2.5 cells on average, because those "stare at a wall"
   placements are artifacts.

| Level | Id | Catchers | 3★ route | Unguarded |
|---|---|---|---|---|
| Sneak 1 · First Rescue | `sneak:0` | 1 static (teaches the cone) | 4.0 s | 4.0 s |
| Sneak 2 · Look Away | `sneak:1` | 1 static down the short corridor | 7.2 s | 6.4 s |
| Sneak 3 · Two Pups | `sneak:2` | 2 static | 14.4 s | 10.4 s |
| Sneak 4 · Crossfire | `sneak:3` | 2 static (one diagonal) | 18.4 s | 13.6 s |
| Sneak 5 · Back Door | `sneak:4` | 2 static, one in front of the door | 22.4 s | 12.8 s |
| Patrol 1 · On Patrol | `patrol:0` | 1 walker across the middle hall | 6.4 s | 5.6 s |
| Patrol 2 · Two Halls | `patrol:1` | 2 walkers, offset phases | 14.0 s | 12.0 s |
| Patrol 3 · Corner Watch | `patrol:2` | L-shaped walker + static | 14.8 s | 9.6 s |
| Patrol 4 · Busy Shelter | `patrol:3` | 2 side-corridor walkers + 1 static (layout after screenshot 1; side corridors have alcoves) | 29.2 s | 14.4 s |
| Patrol 5 · Great Escape | `patrol:4` | central-hall walker + side walker + static, 4 puppies | 30.8 s | 13.6 s |
| Sentry 1 · Searchlight | `sentry:0` | 1 sentry sweeping 100° across the middle hall | 12.0 s | 6.4 s |
| Sentry 2 · Two Lights | `sentry:1` | 2 sentries (90°) at opposite hall ends | 15.6 s | 12.0 s |
| Sentry 3 · Sweep & Walk | `sentry:2` | sentry (110°) + walker | 21.6 s | 11.2 s |
| Sentry 4 · Lighthouse | `sentry:3` | central sentry (120°, sneak behind it) + diagonal static, 3 pups | 10.0 s | 8.8 s |
| Sentry 5 · Night Shift | `sentry:4` | 2 sentries + walker, 3 pups | 16.4 s | 8.8 s |
| Key & Pen 1 · Golden Key | `key:0` | 1 static (teaches key → padlock → pen of 6) | 8.0 s | 8.0 s |
| Key & Pen 2 · Long Tail | `key:1` | hall walker vs a tail of 8 pen pups | 14.8 s | 13.6 s |
| Key & Pen 3 · Locked In | `key:2` | sentry (120°, 40°/s) watching the padlock; cage + pen of 6 | 12.4 s | 8.8 s |
| Key & Pen 4 · Key Run | `key:3` | walker + static; key far from the pen; cage + pen of 8 | 18.0 s | 14.4 s |
| Key & Pen 5 · Great Breakout | `key:4` | sentry + walker + static; 2 cages + pen of 6 | 18.8 s | 9.6 s |
| Hide 1 · In the Bushes | `hide:0` | corridor walker; alcove bush to let it pass | 17.2 s | 7.6 s |
| Hide 2 · Blind Spot | `hide:1` | the same, as a cross corridor | 12.4 s | 7.6 s |
| Hide 3 · Two Hedges | `hide:2` | two corridor walkers in a row, two bushes | 19.2 s | 8.4 s |
| Hide 4 · Garden Pen | `hide:3` | corridor walker + bush; key at the bottom, pen by the door | 16.4 s | 9.2 s |
| Hide 5 · Hide and Seek | `hide:4` | two walkers, two bushes, cage + key + pen of 4 | 30.4 s | 13.6 s |
| Doors 1 · First Switch | `doors:0` | red plate opens the red door to the cage; an idle catcher | 4.8 s | 4.8 s |
| Doors 2 · One Opens, One Shuts | `doors:1` | one yellow plate swaps two yellow doors (right cage first); corridor walker | 12.4 s | 11.2 s |
| Doors 3 · Close the Door | `doors:2` | a static catcher watches the only crossing; shut the open red door on its sight | 6.4 s | 6.4 s |
| Doors 4 · Red and Yellow | `doors:3` | red then yellow, two cages, a walker on the yellow door's row | 14.4 s | 13.2 s |
| Doors 5 · Master Switch | `doors:4` | cage, key behind an open green door, the green plate opens the way up and shuts the way back; walker + sentry | 9.2 s | 9.2 s |
| Cameras 1 · Searchlight | `cameras:0` | one always-on camera sweeping 120° at 30°/s over the room — pure timing | 10.4 s | 3.6 s (no camera) |
| Cameras 2 · Lights Out | `cameras:1` | a red camera watches the cage row; the red plate switches it off | 5.6 s | 5.6 s |
| Cameras 3 · Trade-off | `cameras:2` | red kills the camera AND shuts the red shortcut door — take the long way | 4.0 s | 4.0 s |
| Cameras 4 · Two Beams | `cameras:3` | red + yellow cameras sweep the crossing row; both plates first; a walker up top | 12.8 s | 10.8 s |
| Cameras 5 · Control Room | `cameras:4` | the red plate opens the exit but switches a sweeping camera ON — free the puppy first; a walker | 9.2 s | 9.2 s |

Times are the planner's optimum. A human takes longer.

## Persisted state

- **Widget `data`:** `{ level, sound, unlockAll, stickSide, barkTipSeen, mode, theme, dog }`. That's only where you
  are and the settings.
- **App-level records** (`records.puppyRescue`, survives removing the
  widget): `stars[key]` (best 1–3), `bestMs[key]` (fastest escape,
  0 = none) and `escapes` (lifetime tally). `key` is `recordKey(mode, id)`:
  the level id for Classic, `"<mode>|<id>"` for Easy/Arcade.
  - A level counts as escaped once it has a `stars` entry in any mode,
    which is also what unlocks the next one.
  - Stars and time are independent bests.
  - Reset records lives in the ⚙ menu (confirm-guarded) and uses the shared
    `resetGameRecords('puppyRescue')`.
- **Not persisted:** the run in progress. A run lasts under a minute, so a
  reload simply restarts the level.

## Test contract (`data-*`)

- **Root `puppy-root`:**
  - Rendered attributes: `data-level` (id), `data-level-index`,
    `data-unlocked` (count), `data-run`, `data-sound`, `data-stick`,
    `data-mode` (classic|easy|arcade), `data-theme`
    (sunshine|toybox|ocean|night|sandbox), `data-dog`
    (ginger|golden|dalmatian|husky|blacktan|chocolate).
  - Live telemetry every 50 ms: `data-status` (ready|play|caught|escaped),
    `data-x`/`data-y` (map cells), `data-t`, `data-pups`, `data-meter`,
    `data-spotted`, `data-seeing` (catcher bitmask), `data-guards`
    (x,y,h per catcher), `data-key` (carrying), `data-pen` (padlock open),
    `data-hidden` (still in a bush), `data-bark-cd` (cooldown seconds
    left), `data-lured` (bitmask of catchers drawn by a bark or chasing),
    `data-chasing` (bitmask of catchers chasing or searching), `data-nets`
    (times the line was netted), `data-hint` (1 while a hint replay runs),
    `data-doors` (one char per door in map order: 1 open, 0 shut),
    `data-plates` (plate presses this run), `data-trapped` (bitmask of
    catchers waiting at a shut door), `data-cams` (one char per camera: 1
    on, 0 off), `data-cam-seeing` (bitmask of cameras seeing someone).
  - SFX counters: `data-sfx-freed`/`-alert`/`-caught`/`-escape`/`-key`/`-unlock`/`-hide`/`-bark`/`-heard`/`-net`/`-chase`/`-plate`.
- **Hooks:**
  - Controls and readouts: `puppy-level` (NativeSelect; the `<select>` is
    inside), `puppy-count` (`data-pups`/`data-total`), `puppy-settings`,
    `puppy-stage` (the maze area, not a control), `puppy-stick` (the
    joystick) inside `puppy-stick-strip` (`data-side`), `puppy-3d`, `puppy-timer`,
    `puppy-unseen` (`data-spotted`), `puppy-restart`, `puppy-key` (HUD key
    icon, present while carrying), `puppy-hidden` (HUD hidden badge),
    `puppy-bark` (the Bark button in the strip; `data-ready` 1/0),
    `puppy-bark-tip` (the first-use line in the tip banner),
    `puppy-tip` (the banner, while ready), `puppy-mode` (NativeSelect),
    `puppy-mode-tip` (the mode's line in the banner, Easy/Arcade only),
    `puppy-mode-badge` (HUD, Easy/Arcade only; `data-mode`,
    `data-chasing`), `puppy-hint` (the Hint button, while ready),
    `puppy-hint-overlay` (over the maze during a replay; a tap skips) and
    its `puppy-hint-speed` toggle (`data-speed` 1/2).
  - ⚙ theme row: `puppy-theme` holding the `puppy-theme-<id>` chips
    (`aria-pressed` on the current one), and `puppy-dog` holding the
    `puppy-dog-<id>` chips (same).
  - Overlays: `puppy-netted` (`data-count`), `puppy-caught`, `puppy-escaped`
    (`data-stars`), `puppy-next`, `puppy-again`.
  - ⚙ menu items: `puppy-sound`, `puppy-unlock-all`,
    `puppy-stick-left`/`-center`/`-right`, `puppy-reset-records`.

## Verifying

```bash
npm run build && npm run lint
npm run e2e puppy        # 180-puppy-model (pure + the level sweep), 181-puppy (live),
                         # 182-puppy-modes (pure Easy/Arcade), 183-puppy-modes-ui (live picker),
                         # 184-puppy-hint (live hint replay), 185-puppy-themes, 186-puppy-dogs,
                         # 187-puppy-doors, 188-puppy-cameras
node scripts/gen-puppy-hints.mjs   # after adding/tuning a level: rewrite rescueHints.ts
```

## Future work (enhancement backlog)

Each item names the seam it builds on.

**Next rounds (agreed order)**
- ~~**Round 2: rotating sentries.**~~ Shipped; see *Catchers* and the
  Sentry tier.
- ~~**Round 2: gold key → padlocked pen.**~~ Shipped; see *Gold key,
  padlock and pen* and the Key & Pen tier.
- **Snap-turn sentries** (from the Round 2 discussion, not chosen): a
  catcher that holds a direction, then turns 90° quickly. This would be a
  turn leg with a short `dur` between long holds in `buildTrack`.
- **Several keys and pens per level**, or a coloured key per padlock. This
  generalises the single `lock`/`key` to arrays plus one mask bit per key.
- **Pen pack behaviour:** the crowd bunches into a blob instead of single
  file (Round 2 option C). The detection would test a cluster of points.
- ~~**Round 3: hiding spots.**~~ Shipped as bushes; see *Bushes* and the
  Hide tier.
- **Boxes and hay bales:** other hiding-spot looks, or a box you can push
  into position (a movable `bush` cell; the planner would need it in the
  state).
- **Puppies that hide too:** a "huddle" command that tucks the line into
  a bush with the dog. This would change the rule that puppies are always
  tested.
- ~~**Round 3/4: Bark lure.**~~ Shipped in Round 4 as an optional tool;
  see *Bark*. Its lure state (paused route clock, BFS walk, look, walk
  back) is the base for the Arcade chase below.
- **Bark levels:** a tier designed around luring (doorway guards). The
  solver can't prove a bark is *needed* unless it learns to bark. That
  would mean a "bark here" action in the search, with the lured catcher's
  state in the node.
- **Treat throw:** throw a treat to a spot instead of barking from where
  you stand (lure at a distance), on the same `lure` seam.
- ~~**Doors and switches.**~~ Shipped in Round 7 as toggle plates; see
  *Doors and plates*. (`loop: true` patrols still work, unused.)
- **Timed doors:** a plate opens its doors for N seconds (Round 7 option
  B). The planner has time in its state already; the open question is a
  door shutting halfway through the puppy line.
- **Hold plates and pushable crates:** a door open only while something
  sits on its plate (option C) — a movable object in the sim and in the
  planner's state.
- **Catchers that use doors:** a walker whose route passes a door would
  wait at it while shut. That breaks "a pose is a pure function of time",
  so it needs the per-catcher clock trick from the Bark lure.

**Modes and settings**
- ~~**Easy mode.**~~ Shipped in Round 5; see *Modes*.
- ~~**Arcade mode.**~~ Shipped in Round 5 at 0.9× (not 1.05×); see *Modes*.
- **Arcade alarm:** a chaser shouts, and every catcher within earshot heads
  for the last-seen spot too (`startChase` on more than one catcher, keyed
  off the Bark hearing range).
- **Arcade-tuned levels:** a small tier built around chases (long loops
  to outrun round, bushes at the corners). The Classic proofs don't cover
  Arcade, so these would need a chase-aware check, or play-testing only.
- **Per-mode star totals in the picker header** across all modes, and a
  "★ in all three modes" badge per level.
- **Par-time challenges:** a fourth, optional "speedy" badge from the
  planner's optimum × a slack factor.
- **Seeded endless levels or a daily level:** generate walls, then place
  catchers with the greedy placer, keeping only levels the planner proves.
- **2D top-down view** for small cards (an SVG view over the same sim
  ref, like Car Park's toggle).
- **Bigger mazes with a follow camera:** `CameraRig` fits a window around
  the dog instead of the whole maze. Off-screen catchers need edge
  indicators.

**Enemies and obstacles**
- ~~**Security cameras.**~~ Shipped in Round 8 (cone-like, plate-switched);
  see *Security cameras*.
- **Camera alarm mode** (Round 8 option B): a full camera meter makes every
  catcher turn to the spot for a few seconds instead of a catch — needs the
  per-catcher clock trick, so those levels would be play-tested only.
- **Cameras on rails:** a camera sliding along a wall (a walking track for
  the mount point) — still a pure function of time, so still provable.
- **Laser tripwires:** a thin always-on beam across a corridor, switched by
  plates like cameras.
- **Guard dog:** hears you within a radius, through walls, while you move.
- **Searchlights:** a moving circle instead of a cone.
- **Animal-control van:** scenery by the entrance, maybe a timed sweep
  across the exit.
- **Terrain:** mud (slows the dog, so it can't outrun a cone), conveyor
  floors, one-way gates, puppies that wander off if left too long.

**Controls and feel**
- **Optional tap-to-move:** pathfind with `canStep` BFS, then drive with
  `routeInput`, which already exists.
- **Sneak button:** slower and quieter (once hearing exists).
- **Haptics** on "?" and on a catch (`droneSim/haptics`).
- **Puppies hopping out** through the door on escape (a short
  path-following animation instead of the happy bounce).
- ~~**A "show me how" hint.**~~ Shipped in Round 6; see *💡 Hint*.
- **Step-through hint:** pause the ghost at each wait and turn, with a
  one-line caption ("wait for the walker", "free the left pup first"),
  from the route's `until` steps and cage order.
- **Hint from here:** replan from the dog's current cell mid-run. It needs
  the planner fast enough for a phone (a Web Worker, or a time-bounded
  search) — the stored routes only start from the start.
- **Arcade/Easy-aware hints:** today the hint is the Classic route in every
  mode.

**Themes**
- **More sets:** Slate (`#5b6b7c` on `#dfe7ee`) and Lavender Dream
  (`#9d8cf0` on `#f3eaff`) were proposed and not taken yet; Honey (a
  mustard floor) needs the key outlined and a darker dog ring first.
- ~~**Theme the ring and stick.**~~ Shipped with Pick your dog.
- **Theme the walls and door:** a per-theme tint (a `walls` field, the
  same seam).
- **Themed scenery outside the maze:** grass tufts, waves, stars, sand
  ripples drawn on the surround.

**Meta**
- **A shelter screen** that fills with every puppy you've rescued, with
  coins for rooms and outfits (the store game's loop).
- ~~**Pick your dog.**~~ Shipped; see *Pick your dog*.
- **Accessories:** a collar or bandana colour, or a hat (proposed in the
  dog round, not taken) — one more optional `Coat` field each.
- **Unlockable dogs:** earn a coat by starring a tier (records already
  hold every star).
- **Two Devices co-op:** each player controls a dog with separate puppy
  lines (netplay `pos` messages, like the maze race).
- **A level editor:** the ASCII map plus catcher specs, validated live by
  the planner.
