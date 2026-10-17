/**
 * Puppy Rescue — the pure model and the level pack, no browser.
 *
 * Rules, against hand-built maps: walls stop the dog and block sight; the
 * cone's reach and width; the "?" meter fills faster up close and drains
 * when hidden; touching a catcher is an instant catch; the door stays shut
 * until the first puppy is freed; a puppy in the line is seen like the dog;
 * stars; a catcher's pose is periodic; the route follower is frame-exact.
 *
 * And the load-bearing sweep: EVERY shipped level parses, has a unique id,
 * its catchers' paths stay off the walls, nobody can see the start — and the
 * planner finds a 3-star run (every puppy, never spotted) that, replayed
 * through the real `step`, escapes with 3 stars. That is what lets levels be
 * appended or tuned safely.
 */
import {
  BARK_COOLDOWN,
  BARK_R,
  bark,
  BUMP_R,
  FOLLOW_GAP,
  PEN_GAP,
  canStep,
  decodeRoute,
  doorIsOpen,
  encodeRoute,
  puppyCount,
  CELL_FRAMES,
  CONE_HALF,
  CONE_RANGE,
  DOG_R,
  FILL_FAR,
  FILL_NEAR,
  STEP,
  facingToRad,
  guardPose,
  initialState,
  lineOfSight,
  parseLevel,
  routeInput,
  seenAt,
  start,
  starsFor,
  step,
} from './.bundle/rescueModel.js'
import { LEVELS, TIERS } from './.bundle/rescueLevels.js'
import { planLevel } from './.bundle/rescuePlanner.js'
import { HINTS } from './.bundle/rescueHints.js'
import { reporter } from './helpers.mjs'

const { check, finish } = reporter('puppy-model')

/** An open 5×7 room: dog at the bottom middle, cage top-left, exit top middle. */
const room = (guards = [], extra = {}) =>
  parseLevel({
    id: 'test',
    tier: 'sneak',
    name: 'test',
    map: [
      '+-+-+E+-+-+',
      '|C . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + +-+ + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . D . .|',
      '+-+-+-+-+-+',
    ],
    guards,
    ...extra,
  })
const run = (level, s, ix, iy, frames) => {
  for (let i = 0; i < frames; i++) step(level, s, ix, iy)
}

// ------------------------------------------------------------- 1. parsing
{
  const L = room()
  check('map parses to 5×7 cells', L.cols === 5 && L.rows === 7)
  check('dog start, cage and exit read off the map', L.start.x === 2.5 && L.start.y === 6.5 && L.cages.length === 1 && L.exitCol === 2)
  let threw = false
  try {
    parseLevel({ id: 'bad', tier: 'sneak', name: '', map: ['+-+', '|.|', '+-+'], guards: [] })
  } catch {
    threw = true
  }
  check('a map without dog or exit is rejected', threw)
}

// ------------------------------------------------------- 2. moving + walls
{
  const L = room()
  const s = initialState(L)
  check('starts ready, clock still', s.status === 'ready' && s.t === 0)
  run(L, s, 0, 0, 30)
  check('no input → still ready (catchers wait for the first move)', s.status === 'ready' && s.t === 0)
  run(L, s, 0, -1, CELL_FRAMES)
  check('first move starts play; one cell takes exactly CELL_FRAMES steps', s.status === 'play' && Math.abs(s.y - 5.5) < 1e-9, s.y.toFixed(4))
  run(L, s, 0, -1, CELL_FRAMES * 4)
  // The wall stub under (2,2) (line 3, col 2) stops the dog below it.
  check('a wall stops the dog', Math.abs(s.y - (3 + DOG_R + 0.07)) < 1e-6, s.y.toFixed(4))
  const yStop = s.y
  run(L, s, 0, 0, 1)
  check('releasing stops instantly (no inertia)', s.y === yStop && s.v === 0)
  // Corner assist: off-centre by 0.3, pushing up past a wall end slides on.
  const s2 = initialState(L)
  s2.x = 1.8
  s2.y = 3.6
  run(L, s2, 0, -1, CELL_FRAMES)
  check('corner assist slides round a wall end', s2.y < 3.2, `x ${s2.x.toFixed(2)} y ${s2.y.toFixed(2)}`)
}

// ------------------------------------------------------------ 3. sight
{
  const L = room()
  const g = { x: 2.5, y: 0.5, h: Math.PI / 2, v: 0 } // at the top, looking down
  // 20° off the axis, clear of the wall stub under (2,2).
  const at = (d) => [2.5 + Math.sin(0.35) * d, 0.5 + Math.cos(0.35) * d]
  check('inside the range is seen', seenAt(L, g, ...at(CONE_RANGE - 0.1)) > 0)
  check('beyond the range is not', seenAt(L, g, ...at(CONE_RANGE + 0.1)) < 0)
  const a = CONE_HALF + 0.05
  check('outside the cone angle is not', seenAt(L, g, 2.5 + Math.sin(a) * 2, 0.5 + Math.cos(a) * 2) < 0)
  check('just inside the angle is', seenAt(L, g, 2.5 + Math.sin(CONE_HALF - 0.05) * 2, 0.5 + Math.cos(CONE_HALF - 0.05) * 2) > 0)
  check('a wall blocks sight', !lineOfSight(L, 2.5, 2.5, 2.5, 3.5) && seenAt(L, { x: 2.5, y: 2.2, h: Math.PI / 2, v: 0 }, 2.5, 3.6) < 0)
}

// ------------------------------------------------------- 4. the "?" meter
{
  const fillFrames = (x, y) => {
    const L = room([{ path: [[2, 0]], facing: 180 }])
    const s = initialState(L)
    s.status = 'play'
    s.x = x
    s.y = y
    let n = 0
    while (s.status === 'play' && n < 200) {
      step(L, s, 0, 0)
      n++
    }
    return { n, s, d: Math.hypot(x - 2.5, y - 0.5) }
  }
  const near = fillFrames(2.5, 1.5)
  const far = fillFrames(1.5, 3.8)
  const exp = (d) => Math.ceil((FILL_NEAR + (FILL_FAR - FILL_NEAR) * (d / CONE_RANGE)) / STEP)
  check('seen up close: caught after the near fill time', near.s.status === 'caught' && Math.abs(near.n - exp(near.d)) <= 1, `${near.n} vs ${exp(near.d)}`)
  check('seen far away: slower', far.s.status === 'caught' && far.n > near.n && Math.abs(far.n - exp(far.d)) <= 1, `${far.n} vs ${exp(far.d)}`)
  check('the catch names the catcher and the dog', near.s.caughtBy === 0 && near.s.caughtWho === -1)
  // Drain: in the cone briefly, then out — the meter empties, no catch.
  const L = room([{ path: [[2, 0]], facing: 180 }])
  const s = initialState(L)
  s.status = 'play'
  s.x = 3.9
  s.y = 2.0
  run(L, s, -1, 0, 12) // into the cone edge
  const mid = s.meter
  run(L, s, 1, 0, 30) // back out
  run(L, s, 0, 0, 60)
  check('a glimpse fills, hiding drains', mid > 0 && s.meter === 0 && s.status === 'play' && s.spotted, `mid ${mid.toFixed(2)}`)
  check('the first glimpse counts an alert', s.ev.alert === 1)
}

// --------------------------------------------- 5. bump, door, puppy line
{
  const L = room([{ path: [[2, 3]], facing: 0 }]) // facing up, dog comes from behind
  const s = initialState(L)
  s.status = 'play'
  s.x = 2.5
  s.y = 3.5 + BUMP_R + 0.2
  run(L, s, 0, -1, 10)
  check('walking into a catcher is an instant catch', s.status === 'caught' && s.caughtBy === 0)

  const L2 = room()
  const s2 = initialState(L2)
  s2.status = 'play'
  s2.x = 2.5
  s2.y = 0.7
  run(L2, s2, 0, -1, 10)
  check('the door stays shut with no puppy', s2.status === 'play')
  s2.x = 0.5
  s2.y = 1.5
  run(L2, s2, 0, -1, 30)
  check('reaching the cage frees the puppy and unlocks the door', s2.order.length === 1 && s2.ev.freed === 1 && s2.ev.door === 1)
  run(L2, s2, 0, 1, CELL_FRAMES * 3)
  check('the puppy trails a fixed gap behind', s2.px.length === 1 && Math.abs(Math.hypot(s2.px[0] - s2.x, s2.py[0] - s2.y) - 0.55) < 0.02)
  s2.x = 2.5
  s2.y = 1.5
  s2.trail = [2.5, 2.5, 2.5, 1.5]
  run(L2, s2, 0, -1, 30)
  check('through the open door: escaped', s2.status === 'escaped')
  check('stars: escape + every puppy + unseen = 3', starsFor(L2, s2) === 3)
  s2.spotted = true
  check('spotted costs the third star', starsFor(L2, s2) === 2)

  // A puppy in a cone is seen even when the dog isn't: the catcher looks
  // along row 2; the dog is above the wall, its third puppy below it.
  const L3 = parseLevel({
    id: 'tail',
    tier: 'sneak',
    name: 'tail',
    map: [
      '+-+-+E+-+-+',
      '|C . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+-+-+-+ + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . D . .|',
      '+-+-+-+-+-+',
    ],
    guards: [{ path: [[0, 2]], facing: 90 }],
  })
  const s3 = initialState(L3)
  s3.status = 'play'
  s3.order = [0, 0, 0]
  s3.x = 2.5
  s3.y = 1.5
  s3.trail = [3.5, 2.5, 3.5, 1.5, 2.5, 1.5]
  step(L3, s3, 0, 0)
  const pupSeen = s3.seeing === 1 && seenAt(L3, s3.guards[0], s3.x, s3.y) < 0
  let n = 0
  while (s3.status === 'play' && n++ < 120) step(L3, s3, 0, 0)
  check('a puppy in the cone gets the line caught (dog unseen)', pupSeen && s3.status === 'caught' && s3.caughtWho === 2, `who ${s3.caughtWho}`)
}

// ---------------------------------------------------- 6. patrols + routes
{
  const L = room([{ path: [[0, 3], [4, 3]], pause: 1 }])
  const tr = L.guards[0]
  const a = guardPose(tr, 0.7, {})
  const b = guardPose(tr, 0.7 + tr.period, {})
  check('a patrol is periodic', Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.h - b.h) < 1e-9)
  const mid = guardPose(tr, 4 / 1.5 / 2, {})
  check('walking right, facing right', Math.abs(mid.h) < 1e-9 && mid.v > 0)
  const s = initialState(room())
  const Lr = room()
  const c = { i: 0 }
  const route = [{ x: 2.5, y: 4.5 }, { x: 3.5, y: 4.5 }]
  let f = 0
  while (c.i < route.length && f < 500) {
    const [ix, iy] = routeInput(s, route, c)
    if (c.i >= route.length) break
    step(Lr, s, ix, iy)
    f++
  }
  check('the route follower lands frame-exact (3 cells = 3×CELL_FRAMES)', f === 3 * CELL_FRAMES && Math.abs(s.x - 3.5) < 1e-9, `${f}`)
}

// ------------------------------------------- 6b. sentries (Round 2)
{
  const L = room([{ path: [[2, 3]], facing: 180, sweep: 120 }])
  const tr = L.guards[0]
  const hs = []
  for (let t = 0; t < tr.period; t += 0.05) hs.push(guardPose(tr, t, {}).h)
  const down = Math.PI / 2
  const minH = Math.min(...hs)
  const maxH = Math.max(...hs)
  check('a sentry sweeps its arc (±60° about its facing) and back', Math.abs(minH - (down - Math.PI / 3)) < 0.02 && Math.abs(maxH - (down + Math.PI / 3)) < 0.02,
    `${((minH * 180) / Math.PI).toFixed(0)}°…${((maxH * 180) / Math.PI).toFixed(0)}°`)
  const p0 = guardPose(tr, 0.3, {})
  check('…without moving off its spot', p0.x === 2.5 && p0.y === 3.5 && p0.v === 0)
  // 120° at 45°/s + 2 × 0.6 s pauses
  check('…on a period of 2·arc/rate + 2·pause', Math.abs(tr.period - (2 * 120 / 45 + 1.2)) < 1e-9, tr.period.toFixed(3))
}

// --------------------------------------- 6c. key, padlock, pen (Round 2)
{
  // A pen of 2 cells (4 pups) behind a padlock on the line under row 1.
  const L = parseLevel({
    id: 'pen',
    tier: 'key',
    name: 'pen',
    map: [
      '+-+-+E+-+-+',
      '|P P|. . .|',
      '+-+L+ + + +',
      '|. . . . K|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . D . .|',
      '+-+-+-+-+-+',
    ],
    guards: [],
  })
  check('pen cells hold two puppies each; the key and padlock parse', L.pen.length === 4 && L.key && L.lock && L.lock.horiz && puppyCount(L) === 4)
  check('the padlock edge blocks a step until the pen is open', !canStep(L, 1, 1, 0, -1) && canStep(L, 1, 1, 0, -1, true))
  check('the padlock blocks sight while shut', !lineOfSight(L, 1.5, 1.6, 1.5, 0.4) && lineOfSight(L, 1.5, 1.6, 1.5, 0.4, false))
  let threw = false
  try {
    parseLevel({ id: 'nokey', tier: 'key', name: '', map: ['+-+E+', '|P D|', '+-+-+'], guards: [] })
  } catch {
    threw = true
  }
  check('a pen without key + padlock is rejected', threw)

  const s = initialState(L)
  s.status = 'play'
  s.x = 1.5
  s.y = 1.5
  run(L, s, 0, -1, 30)
  check('without the key the padlock stays shut (the dog stops at it)', !s.penOpen && s.y > 1.3, s.y.toFixed(2))
  s.x = 4.5
  s.y = 2.5
  run(L, s, 0, -1, 24)
  check('walking over the key picks it up', s.hasKey && s.ev.key === 1)
  s.x = 1.5
  s.y = 2.5
  s.trail = [3.5, 2.5, 1.5, 2.5]
  run(L, s, 0, -1, 30)
  check('carrying the key to the padlock opens it: the whole pen joins', s.penOpen && !s.hasKey && s.ev.unlock === 1 && s.order.length === 4, `pups ${s.order.length}`)
  check('the door opens with them (first puppies freed)', s.ev.door === 1)
  run(L, s, 0, 1, 48)
  const d01 = Math.hypot(s.px[1] - s.px[0], s.py[1] - s.py[0])
  const d0 = Math.hypot(s.px[0] - s.x, s.py[0] - s.y)
  check('pen puppies huddle at PEN_GAP (0.3), not FOLLOW_GAP', Math.abs(d01 - PEN_GAP) < 0.02 && Math.abs(d0 - PEN_GAP) < 0.02 && PEN_GAP < FOLLOW_GAP,
    `${d0.toFixed(2)} / ${d01.toFixed(2)}`)
  s.x = 1.5
  s.y = 1.5
  run(L, s, 0, -1, 40)
  check('once open, the padlock edge lets the dog through', s.y < 0.9, s.y.toFixed(2))
}

// --------------------------------------------- 6d. bushes (Round 3)
{
  // A catcher at the top looks straight down the middle column; a bush sits
  // in its cone at (2,3).
  const L = parseLevel({
    id: 'bush',
    tier: 'hide',
    name: 'bush',
    map: [
      '+-+-+E+-+-+',
      '|C . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . B . .|',
      '+ + + + + +',
      '|. . . . .|',
      '+ + + + + +',
      '|. . D . .|',
      '+-+-+-+-+-+',
    ],
    guards: [{ path: [[2, 0]], facing: 180 }],
  })
  check('bush cells parse', L.bushes.length === 1 && L.bush[3 * 5 + 2] === 1)
  const s = initialState(L)
  s.status = 'play'
  s.x = 2.5
  s.y = 3.5
  step(L, s, 0, 0)
  check('standing still in a bush: hidden, unseen', s.hidden && s.seeing === 0 && s.meter === 0 && s.ev.hide === 1)
  run(L, s, 0, 0, 90)
  check('…for as long as the dog stays still', s.status === 'play' && s.meter === 0 && !s.spotted)
  step(L, s, 1, 0)
  check('moving — even inside the bush — reveals the dog', !s.hidden && s.seeing === 1, `x ${s.x.toFixed(2)}`)
  // A puppy beside the hidden dog is still seen.
  const s2 = initialState(L)
  s2.status = 'play'
  s2.order = [0]
  s2.freed = [true]
  s2.x = 2.5
  s2.y = 3.5
  s2.trail = [2.5, 2.5, 2.5, 3.5] // came down from above: the puppy trails in the cone
  step(L, s2, 0, 0)
  check('puppies are never hidden: the line still gets seen', s2.hidden && s2.seeing === 1)
  // Touching still catches: a walker through the bush cell.
  const Lw = parseLevel({ ...L.spec, guards: [{ path: [[2, 1], [2, 5]], pause: 0.5 }] })
  const s3 = initialState(Lw)
  s3.status = 'play'
  s3.x = 2.5
  s3.y = 3.5
  let n = 0
  while (s3.status === 'play' && n++ < 300) step(Lw, s3, 0, 0)
  check('a catcher walking into the bush still nets the hidden dog', s3.status === 'caught' && s3.caughtWho === -1 && s3.hidden)
}

// ------------------------------------------- 6e. the bark lure (Round 4)
{
  const open = (guards) =>
    parseLevel({
      id: 'bark',
      tier: 'sneak',
      name: 'bark',
      map: [
        '+-+-+E+-+-+',
        '|C . . . .|',
        '+ + + + + +',
        '|. . . . .|',
        '+ + + + + +',
        '|. . . . .|',
        '+ + + + + +',
        '|. . . . .|',
        '+ + + + + +',
        '|. . . . .|',
        '+ + + + + +',
        '|. . . . .|',
        '+ + + + + +',
        '|. . D . .|',
        '+-+-+-+-+-+',
      ],
      guards,
    })
  // No barks: every catcher's route clock IS the game clock — bit for bit.
  {
    const L = open([{ path: [[0, 2], [4, 2]] }, { path: [[4, 4]], facing: 0, sweep: 90 }])
    const s = initialState(L)
    s.status = 'play'
    for (let i = 0; i < 600; i++) step(L, s, 0, 0)
    check('without a bark, each route clock equals the game clock exactly', s.gclock.every((c) => c === s.t) && s.lure.every((l) => l === null))
  }
  // Range + cooldown.
  {
    const L = open([{ path: [[2, 0]], facing: 0 }]) // far up, looking at the wall
    const s = initialState(L)
    s.status = 'play'
    step(L, s, 0, 0)
    check('a catcher beyond BARK_R does not hear', bark(L, s) === -1 && s.ev.bark === 1 && s.ev.heard === 0 && s.lure[0] === null)
    check('…but the bark still used up the cooldown', Math.abs(s.barkCd - BARK_COOLDOWN) < 1e-9)
    check('a second bark inside the cooldown does nothing', bark(L, s) === -1 && s.ev.bark === 1)
    for (let i = 0; i < BARK_COOLDOWN * 60 + 2; i++) step(L, s, 0, 0)
    check('the cooldown runs out', s.barkCd === 0)
  }
  // Nearest in range answers; walk there, look, walk back, resume.
  {
    const L = open([
      { path: [[2, 3]], facing: 0 }, // 3 cells up from the dog, looking away
      { path: [[0, 0]], facing: 90 },
    ])
    const s = initialState(L)
    s.status = 'play'
    step(L, s, 0, 0)
    const g = bark(L, s)
    check('the nearest catcher in range is drawn', g === 0 && s.lure[0]?.mode === 'go' && s.ev.heard === 1 && Math.hypot(s.guards[0].x - s.x, s.guards[0].y - s.y) <= BARK_R)
    // Slip out of the way, up and to the side, behind its back.
    s.x = 4.5
    s.y = 0.5
    s.trail = [4.5, 0.5]
    const modes = new Set()
    let arrived = false
    let n = 0
    while (s.lure[0] && s.status === 'play' && n++ < 1200) {
      step(L, s, 0, 0)
      if (s.lure[0]) modes.add(s.lure[0].mode)
      if (s.lure[0]?.mode === 'look' && Math.hypot(s.guards[0].x - 2.5, s.guards[0].y - 6.5) < 1e-6) arrived = true
    }
    check('it walks to the bark spot, looks around, walks back, turns onto its route', arrived && ['go', 'look', 'back', 'turn'].every((m) => modes.has(m)), [...modes].join('>'))
    const p = s.guards[0]
    check('…and resumes exactly where it left (position + facing)', s.status === 'play' && Math.abs(p.x - 2.5) < 1e-9 && Math.abs(p.y - 3.5) < 1e-9 && Math.abs(p.h - facingToRad(0)) < 1e-9)
    check('its route clock paused while it was away', s.gclock[0] < s.t - 2 && s.gclock[1] === s.t, `${s.gclock[0].toFixed(2)} vs ${s.t.toFixed(2)}`)
  }
  // A lured catcher still sees — barking from in front of it is a bad idea.
  {
    const L = open([{ path: [[2, 3]], facing: 0 }])
    const s = initialState(L)
    s.status = 'play'
    step(L, s, 0, 0)
    bark(L, s)
    let n = 0
    while (s.status === 'play' && n++ < 600) step(L, s, 0, 0)
    check('a lured catcher walking onto the dog still catches it', s.status === 'caught' && s.caughtBy === 0)
  }
}

// --------------------------------------------- 6g. doors and plates
{
  // A red door (shut) across the middle; a red plate below it; a yellow door
  // open at the start on the right, and a yellow plate. Doors are indexed
  // horizontal edges first, so red is door 0 and yellow door 1.
  const L = parseLevel({
    id: 'doors',
    tier: 'doors',
    name: 'doors',
    map: [
      '+-+-+E+-+-+',
      '|C . . . .|',
      '+ + + + + +',
      '|. . . .y.|',
      '+-+-+R+-+-+',
      '|. . . . .|',
      '+ + + + + +',
      '|r . . . y|',
      '+ + + + + +',
      '|. . D . .|',
      '+-+-+-+-+-+',
    ],
    guards: [],
  })
  check('doors and plates parse (colour, start state, cells)',
    L.doors.length === 2 && L.doors[0].c === 0 && !L.doors[0].open0 && L.doors[1].c === 1 && L.doors[1].open0 &&
      L.plates.length === 2 && L.plate[3 * 5 + 0] === 0 && L.plate[3 * 5 + 4] === 1)
  check('a shut door blocks a step; the open one does not', !canStep(L, 2, 2, 0, -1, false, 0) && canStep(L, 3, 1, 1, 0, false, 0))
  check('pressing (sw bit) flips both ways: red opens, and the yellow door shuts',
    canStep(L, 2, 2, 0, -1, false, 1) && doorIsOpen(L, 0, 1) && doorIsOpen(L, 1, 1) && !canStep(L, 3, 1, 1, 0, false, 2))
  check('a shut door blocks sight, an open one does not', !lineOfSight(L, 2.5, 2.9, 2.5, 1.1, true, 0) && lineOfSight(L, 2.5, 2.9, 2.5, 1.1, true, 1))
  const s = initialState(L)
  s.status = 'play'
  run(L, s, 0, -1, CELL_FRAMES * 3)
  check('walking into the shut door stops the dog', Math.abs(s.y - (2 + DOG_R + 0.07)) < 1e-6 && s.ev.plate === 0, s.y.toFixed(3))
  s.x = 1.5
  s.y = 3.5
  s.cell = 3 * 5 + 1
  s.trail = [1.5, 3.5]
  run(L, s, -1, 0, CELL_FRAMES)
  check('stepping onto the red plate flips its door: open', s.ev.plate === 1 && s.sw === 1 && doorIsOpen(L, 0, s.sw))
  run(L, s, 0, 0, 60)
  run(L, s, 0, 1, 6)
  run(L, s, 0, -1, 6)
  check('standing (or shuffling) on it does not flip it again', s.ev.plate === 1 && s.sw === 1)
  run(L, s, 1, 0, CELL_FRAMES)
  run(L, s, -1, 0, CELL_FRAMES)
  check('stepping off and back on flips it again: shut', s.ev.plate === 2 && s.sw === 0 && !doorIsOpen(L, 0, s.sw))
  const bad = (map, guards = []) => {
    try {
      parseLevel({ id: 'bad', tier: 'doors', name: '', map, guards })
      return false
    } catch {
      return true
    }
  }
  const base = ['+-+-+E+-+', '|. . . .|', '+ + + + +', '|. . . .|', '+-+R+-+-+', '|. . . .|', '+ + + + +', '|. D . .|', '+-+-+-+-+']
  check('a door without a plate of its colour is rejected', bad(base))
  check('a plate right beside its own door is rejected', bad(base.map((r, i) => (i === 5 ? '|. r . .|' : r))))
  check('a catcher track crossing a door is rejected',
    bad(base.map((r, i) => (i === 7 ? '|r D . .|' : r)), [{ path: [[1, 0], [1, 2]] }]))
}

// ---------------------------------------------------- 6f. the hint codec
{
  const r = [{ x: 3.5, y: 8.5 }, { until: 10.4 }, { x: 0.5, y: 0.5 }]
  const code = encodeRoute(r)
  check('hint codec: encode → decode round-trips', code === '3,8 w10.4 0,0' && JSON.stringify(decodeRoute(code)) === JSON.stringify(r), code)
  check('every shipped level has a stored hint and no stray ones', LEVELS.every((l) => typeof HINTS[l.id] === 'string') && Object.keys(HINTS).length === LEVELS.length)
}

// ---------------------------------------------- 7. THE SWEEP: every level
{
  const ids = new Set()
  check('pack is non-empty and tiers are known', LEVELS.length >= 10 && LEVELS.every((l) => TIERS.includes(l.tier)))
  for (const spec of LEVELS) {
    let L
    try {
      L = parseLevel(spec)
    } catch (e) {
      check(`${spec.id} parses`, false, e.message)
      continue
    }
    check(`${spec.id} id is unique`, !ids.has(spec.id))
    ids.add(spec.id)
    const offWalls = spec.guards.every((g) =>
      g.path.every((p, i) => i === 0 || lineOfSight(L, g.path[i - 1][0] + 0.5, g.path[i - 1][1] + 0.5, p[0] + 0.5, p[1] + 0.5)),
    )
    const startHidden = L.guards.every((tr) => seenAt(L, guardPose(tr, 0, {}), L.start.x, L.start.y) < 0)
    check(`${spec.id} catchers walk clear of walls; the start is unseen`, offWalls && startHidden)
    const plan = planLevel(L)
    if (!plan) {
      check(`${spec.id} has a 3-star run`, false, 'planner found none')
      continue
    }
    const s = initialState(L)
    const c = { i: 0 }
    for (let k = 0; k < 60 * 120 && (s.status === 'ready' || s.status === 'play'); k++) {
      const [ix, iy] = routeInput(s, plan.route, c)
      step(L, s, ix, iy)
    }
    if (spec.tier === 'doors') {
      const noPlates = planLevel(L, 90, false, true)
      check(`${spec.id} genuinely needs its plates`, !noPlates || noPlates.time >= plan.time + 3,
        noPlates ? `${noPlates.time.toFixed(1)}s with the doors frozen` : 'unsolvable with the doors frozen')
    }
    if (spec.tier === 'hide') {
      const noBush = planLevel(L, 90, true)
      check(`${spec.id} genuinely needs its bushes`, !noBush || noBush.time >= plan.time + 3,
        noBush ? `${noBush.time.toFixed(1)}s without` : 'unsolvable without')
    }
    check(
      `${spec.id} "${spec.name}": proven 3★ in ${plan.time.toFixed(1)}s`,
      s.status === 'escaped' && starsFor(L, s) === 3 && !s.spotted,
      `${s.status} stars ${starsFor(L, s)} pups ${s.order.length}/${L.cages.length}`,
    )
    // The stored 💡 Hint (rescueHints.ts) replays to 3★ exactly as the widget
    // plays it: start, then routeInput every step. A missing or stale entry
    // fails here — regenerate with `node scripts/gen-puppy-hints.mjs`.
    const code = HINTS[spec.id]
    const h = initialState(L)
    if (code) {
      const route = decodeRoute(code)
      const hc = { i: 0 }
      start(h)
      for (let k = 0; k < 60 * 120 && h.status === 'play'; k++) {
        const [ix, iy] = routeInput(h, route, hc)
        step(L, h, ix, iy)
      }
    }
    check(`${spec.id} stored hint replays to 3★`, !!code && h.status === 'escaped' && starsFor(L, h) === 3, code ? `${h.status} ${starsFor(L, h)}★` : 'no hint stored')
  }
}

await finish()
