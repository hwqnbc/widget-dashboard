/**
 * Puppy Rescue — the Easy and Arcade modes (Round 5), pure model, no browser.
 *
 * Classic stays the default and untouched (180's sweep proves the levels
 * under it). Easy: a full meter on a PUPPY nets it and everyone behind it
 * back to their cages; the dog seen is still a catch. Arcade: a full meter
 * makes that catcher chase at 0.9× the dog — straight at it while in sight,
 * through the maze to the last-seen spot when not, then a search, then home
 * — and only a touch catches (a touch on a puppy nets the line from it).
 */
import {
  BUMP_R,
  CHASE_SPEED,
  CHASE_SIGHT,
  DOG_SPEED,
  SEARCH_S,
  STEP,
  bark,
  doorOpen,
  facingToRad,
  initialState,
  lineOfSight,
  parseLevel,
  step,
} from './.bundle/rescueModel.js'
import { reporter } from './helpers.mjs'

const { check, finish } = reporter('puppy-modes')

const run = (level, s, ix, iy, frames) => {
  for (let i = 0; i < frames; i++) step(level, s, ix, iy)
}
const until = (level, s, pred, max = 1200, ix = 0, iy = 0) => {
  let n = 0
  while (!pred() && s.status === 'play' && n++ < max) step(level, s, ix, iy)
  return pred()
}

/** The 180 "tail" map with three cages: the catcher looks along row 2; the
 * dog is above the wall, its third puppy below it. */
const tail = () =>
  parseLevel({
    id: 'tail',
    tier: 'sneak',
    name: 'tail',
    map: [
      '+-+-+E+-+-+',
      '|C C C . .|',
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
const withLine = (L, mode) => {
  const s = initialState(L, mode)
  s.status = 'play'
  s.freed = [true, true, true]
  s.order = [0, 1, 2]
  s.x = 2.5
  s.y = 1.5
  s.trail = [3.5, 2.5, 3.5, 1.5, 2.5, 1.5]
  return s
}

/** A wide open 12×3 field, catcher on the left looking right. */
const field = (extra = {}) =>
  parseLevel({
    id: 'field',
    tier: 'sneak',
    name: 'field',
    map: [
      '+E+-+-+-+-+-+-+-+-+-+-+-+',
      '|C C . . . . . . . . . .|',
      '+ + + + + + + + + + + + +',
      `|. . ${extra.bush ? 'B' : '.'} . . . . . . . . .|`,
      '+ + + + + + + + + + + + +',
      '|D . . . . . . . . . . .|',
      '+-+-+-+-+-+-+-+-+-+-+-+-+',
    ],
    guards: [{ path: [[extra.gx ?? 0, 1]], facing: 90 }],
  })

// ------------------------------------------------------------- 0. default
{
  const L = tail()
  check('initialState defaults to Classic', initialState(L).mode === 'classic')
  const s = withLine(L, 'classic')
  until(L, s, () => s.status !== 'play', 200)
  check('Classic: a puppy seen is still a full catch', s.status === 'caught' && s.caughtWho === 2)
}

// ---------------------------------------------------------------- 1. Easy
{
  const L = tail()
  const s = withLine(L, 'easy')
  const netted = until(L, s, () => s.ev.net > 0, 200)
  check('Easy: a full meter on the 3rd puppy nets it — no catch', netted && s.status === 'play', s.status)
  check('…it alone goes home (the two ahead of it stay in the line)', s.order.join() === '0,1' && s.freed.join() === 'true,true,false' && s.px.length === 2)
  check('…and the meter resets', s.meter === 0 && s.spotted)
  run(L, s, 0, 0, 120)
  check('the rest of the line, behind the wall, stays safe', s.status === 'play' && s.ev.net === 1)
  // Back to the cage → that puppy rejoins.
  run(L, s, 0, -1, 15)
  check('walking back to its cage frees it again', s.freed[2] && s.order.length === 3, s.order.join())

  // The net cuts the line: the line runs straight down column 3 past the
  // catcher's row — the nearest seen (the 2nd) goes home with the 3rd.
  const line = (order) => {
    const t = initialState(L, 'easy')
    t.status = 'play'
    t.freed = [true, true, true]
    t.order = order
    t.x = 3.5
    t.y = 1.6
    t.trail = [3.5, 4.5, 3.5, 1.6]
    return t
  }
  const s3 = line([0, 1, 2])
  until(L, s3, () => s3.ev.net > 0, 200)
  check('the net cuts the line: the 2nd puppy seen → it and the 3rd go home, the 1st stays', s3.order.join() === '0' && s3.freed.join() === 'true,false,false' && s3.status === 'play', s3.order.join())
  const s5 = line([0])
  s5.freed = [true, false, false]
  check('(one puppy in the line, the door open)', doorOpen(s5))
  until(L, s5, () => s5.ev.net > 0, 200)
  check('…netting the whole line shuts the door again', s5.order.length === 0 && !doorOpen(s5) && s5.status === 'play')

  // The dog itself seen is still a catch in Easy.
  const s4 = initialState(L, 'easy')
  s4.status = 'play'
  s4.x = 3.5
  s4.y = 2.5
  s4.trail = [3.5, 2.5]
  until(L, s4, () => s4.status !== 'play', 200)
  check('Easy: the dog seen is still caught', s4.status === 'caught' && s4.caughtWho === -1)
}

// -------------------------------------------------------------- 2. Arcade
{
  // The meter filling starts a chase, not a catch.
  const L = field()
  const s = initialState(L, 'arcade')
  s.status = 'play'
  s.x = 2.5
  s.y = 1.5
  s.trail = [2.5, 1.5]
  until(L, s, () => s.ev.chase > 0, 200)
  check('Arcade: a full meter starts a chase — no catch', s.status === 'play' && s.lure[0]?.mode === 'chase' && s.ev.chase === 1)
  check('…the meter is reset for the others', s.meter === 0)
  const x0 = s.guards[0].x
  run(L, s, 0, 0, 10)
  check('the chaser runs at 0.9× the dog', Math.abs(s.guards[0].x - x0 - 10 * CHASE_SPEED * STEP) < 1e-9 && Math.abs(CHASE_SPEED / DOG_SPEED - 0.9) < 1e-12)
  // Run: the dog always pulls away in the open.
  const gap0 = s.x - s.guards[0].x
  run(L, s, 1, 0, 120)
  const gap1 = s.x - s.guards[0].x
  check('running away, the dog pulls away (~0.1 × 2.5 cells/s)', s.status === 'play' && gap1 - gap0 > 0.45 && gap1 - gap0 < 0.55, `${gap0.toFixed(2)} → ${gap1.toFixed(2)}`)
  check('a chaser is past "?" — it never fills the meter', s.meter === 0 && s.seeing === 0)
  // Stand still: it catches up — contact is the catch.
  until(L, s, () => s.status !== 'play', 600)
  check('standing still, the chaser catches up: caught on contact', s.status === 'caught' && s.caughtBy === 0 && s.caughtWho === -1 && Math.hypot(s.x - s.guards[0].x, s.y - s.guards[0].y) < BUMP_R)
}
{
  // Lose it (out of CHASE_SIGHT): its guess → search → home → resume.
  const L = field()
  const s = initialState(L, 'arcade')
  s.status = 'play'
  s.x = 2.5
  s.y = 1.5
  s.trail = [2.5, 1.5]
  until(L, s, () => s.ev.chase > 0, 200)
  s.x = 11.5
  s.y = 2.5
  s.trail = [11.5, 2.5]
  check('teleported beyond CHASE_SIGHT', Math.hypot(s.x - s.guards[0].x, s.y - s.guards[0].y) > CHASE_SIGHT)
  const modes = []
  let searchAt = null
  let searchT = 0
  let n = 0
  while (s.lure[0] && s.status === 'play' && n++ < 2400) {
    step(L, s, 0, 0)
    const m = s.lure[0]?.mode
    if (m && modes[modes.length - 1] !== m) modes.push(m)
    if (m === 'search') {
      if (!searchAt) searchAt = { x: s.guards[0].x, y: s.guards[0].y }
      searchT += STEP
    }
  }
  check('chase → search → back → turn', modes.join('>') === 'chase>search>back>turn', modes.join('>'))
  // Lost out of range (not to a bush): it guesses one cell on in the dog's
  // last heading (up, the start facing) and searches right there.
  check('it searched one cell past the last-seen spot, in the dog\'s heading', searchAt && Math.hypot(searchAt.x - 2.5, searchAt.y - 0.5) < 1e-9, searchAt && `${searchAt.x.toFixed(2)},${searchAt.y.toFixed(2)}`)
  check('…for SEARCH_S', Math.abs(searchT - SEARCH_S) < 2 * STEP, searchT.toFixed(3))
  const p = s.guards[0]
  check('…then back exactly on its post, facing its way', s.status === 'play' && Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 1.5) < 1e-9 && Math.abs(p.h - facingToRad(90)) < 1e-9)
  check('its route clock paused while it was away', s.gclock[0] < s.t - 3)
}
{
  // A bush: a chaser that loses the hidden dog searches beside it, safe.
  const L = field({ bush: true })
  const s = initialState(L, 'arcade')
  s.status = 'play'
  s.x = 2.5
  s.y = 1.5
  s.trail = [2.5, 1.5]
  let k = 0
  // Fidget in the bush (moving = visible) until the chase starts…
  while (s.ev.chase === 0 && s.status === 'play' && k++ < 200) step(L, s, k % 2 ? 1 : -1, 0)
  // …then freeze: hidden.
  let minD = Infinity
  let searched = false
  let n = 0
  while (s.lure[0] && s.status === 'play' && n++ < 1200) {
    step(L, s, 0, 0)
    minD = Math.min(minD, Math.hypot(s.x - s.guards[0].x, s.y - s.guards[0].y))
    if (s.lure[0]?.mode === 'search') searched = true
  }
  check('Arcade + bush: standing still hides the dog from a chaser', s.ev.chase === 1 && s.hidden && searched && s.status === 'play')
  check('…which searches beside it but never touches it', minD > BUMP_R + 0.1, minD.toFixed(3))
}
{
  // A touch on a puppy nets the line from that puppy back; the dog runs on.
  const L = field({ gx: 1 })
  const s = initialState(L, 'arcade')
  s.status = 'play'
  s.freed = [true, true]
  s.order = [0, 1]
  s.x = 5.5
  s.y = 1.5
  s.trail = [3.5, 1.5, 5.5, 1.5]
  run(L, s, 0, 0, 1)
  until(L, s, () => s.ev.chase > 0, 200)
  check('Arcade: the tail puppy fills the meter → chase', s.ev.chase === 1 && s.status === 'play')
  until(L, s, () => s.ev.net > 0, 400)
  check('a chaser touching the tail puppy nets it — no catch', s.ev.net === 1 && s.order.join() === '0' && !s.freed[1] && s.status === 'play')
  until(L, s, () => s.ev.net > 1, 400)
  check('…then the next one it reaches', s.ev.net === 2 && s.order.length === 0 && s.status === 'play')
  // A chaser isn't fooled by a bark.
  s.barkCd = 0
  check('a bark does not draw a catcher that is already chasing', bark(L, s) === -1 && s.ev.heard === 0 && s.lure[0]?.mode === 'chase')
}
{
  // Through the maze: the chaser follows round a wall, never through one.
  const L = parseLevel({
    id: 'bend',
    tier: 'sneak',
    name: 'bend',
    map: [
      '+E+-+-+', //
      '|. . .|',
      '+-+-+ +',
      '|. . D|',
      '+-+-+-+',
    ],
    guards: [{ path: [[0, 1]], facing: 90 }],
  })
  const s = initialState(L, 'arcade')
  s.status = 'play'
  until(L, s, () => s.ev.chase > 0, 200)
  let clean = true
  let upTop = false
  let lostSight = false
  let n = 0
  let px = s.guards[0].x
  let py = s.guards[0].y
  const route = [
    [0, -1, 24], // up through the gap
    [-1, 0, 48], // along the top row, out of sight
  ]
  for (const [ix, iy, f] of route)
    for (let i = 0; i < f && s.status === 'play'; i++) {
      step(L, s, ix, iy)
      const g = s.guards[0]
      if (!lineOfSight(L, px, py, g.x, g.y)) clean = false
      if (!lineOfSight(L, g.x, g.y, s.x, s.y)) lostSight = true
      px = g.x
      py = g.y
    }
  while (s.status === 'play' && n++ < 600) {
    step(L, s, 0, 0)
    const g = s.guards[0]
    if (!lineOfSight(L, px, py, g.x, g.y)) clean = false
    if (g.y < 1) upTop = true
    px = g.x
    py = g.y
  }
  check('out of sight round a wall, the chaser follows through the gap', lostSight && upTop)
  check('…never stepping through a wall', clean)
  check('…and catches the dog that stopped in a dead end', s.status === 'caught' && s.caughtWho === -1)
}

await finish()
