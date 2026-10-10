import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import type { AirframeId } from './airframes'
import { AIRFRAMES } from './airframes'
import type { AssistLevel } from './assists'
import { triggerPanic } from './assists'
import { advanceFixed, attitudeOf, forwardOf, quatFromEuler, stallSpeed } from './planeModel'
import type { Phase, StartKind, WingSim } from './wingSim'
import { HAND, holdInHand, launchSim, resetSim, stepCrash, stepSim } from './wingSim'
import type { IslandSpec } from './islandLayout'
import { STRIP, WORLD_HALF, islandHeight } from './islandLayout'
import type { WingInput } from './wingInput'
import { mergeInput } from './wingInput'
import PlaneMesh from './PlaneMesh'
import type { WingView } from './views'
import type { ObjectiveState } from './objective'
import { FLY_OUT_DIST, landingHint } from './objective'
import type { LandingHint } from './objective'

/** What the chip renders — a plain copy, so React state stays immutable. */
export type ObjectiveSnapshot = Pick<ObjectiveState, 'takeoff' | 'flyout' | 'back' | 'land' | 'runway' | 'sink' | 'completed'>
import type { WingSound } from './wingSound'
import { CRASH_PULSE, vibrate } from '../droneSim/haptics'
import { createPlaneParts } from './planeParts'

/** Chase camera: boom length/height (m) per airframe, and damping. */
const CHASE_BACK: Record<AirframeId, number> = { trainer: 4.2, wing: 3.4 }
const CHASE_UP = 1.3
const CHASE_LAMBDA = 6
/** Fraction of the plane's bank the chase camera follows (comfort). */
const CHASE_ROLL_FOLLOW = 0.25
/** FPV camera: nose offset (m), up-tilt (rad, matches a cruising wing's
 * nose-up attitude) and field of view (≤ 75° — comfort). */
const FPV_NOSE = 0.32
const FPV_UPTILT = (10 * Math.PI) / 180
const FPV_FOV = 72


export interface RigRefs {
  sim: WingSim
  input: WingInput
  airframe: MutableRefObject<AirframeId>
  level: MutableRefObject<AssistLevel>
  invertPitch: MutableRefObject<boolean>
  hud: MutableRefObject<HTMLElement | null>
  hudText: MutableRefObject<HTMLElement | null>
  /** Home arrow (rotated toward the runway) + its distance label. */
  homeArrow: MutableRefObject<HTMLElement | null>
  homeText: MutableRefObject<HTMLElement | null>
  view: MutableRefObject<WingView>
  sound: WingSound
  /** FPV ignores the plane's roll (the comfort default); the bank symbol shows it. */
  fpvLevel: MutableRefObject<boolean>
  /** FPV bank symbol (rotated by the bank) and the TURN BACK warning. */
  bankSymbol: MutableRefObject<HTMLElement | null>
  edgeWarn: MutableRefObject<HTMLElement | null>
  /** Called when the objective checklist changes (rare): re-renders the chip. */
  onObjective: MutableRefObject<(o: ObjectiveSnapshot) => void>
  /** The chip's live "fly out" distance (direct DOM write). */
  objectiveDist: MutableRefObject<HTMLElement | null>
  /** Landing hint line: text per hint (null = hide); written directly. */
  hintEl: MutableRefObject<HTMLElement | null>
  hintText: MutableRefObject<(h: LandingHint) => string>
  hintsOn: MutableRefObject<boolean>
  /** Called (rarely) when the phase or start kind changes — drives the
   * DOM buttons/banner; everything else is direct DOM writes. */
  onPhase: MutableRefObject<(phase: Phase, start: StartKind) => void>
}

const _fwd = new Vector3()
const _camTarget = new Vector3()
const _look = new Vector3()
const _up = new Vector3()
const _q = new Quaternion()
const _att = { heading: 0, pitch: 0, bank: 0 }
const _qp = { x: 0, y: 0, z: 0, w: 1 }
const _f = { x: 0, y: 0, z: 0 }

export default function PlaneRig({
  refs,
  island,
  color,
  airframe,
}: {
  refs: RigRefs
  island: IslandSpec
  color: string
  /** Rendered airframe (a prop so the mesh swaps); physics reads the ref. */
  airframe: AirframeId
}) {
  const groupRef = useRef<Group>(null)
  const parts = useRef(createPlaneParts()).current
  const hudTick = useRef(0)
  const camInit = useRef(false)
  const lastPhase = useRef<string>('')
  const lastSeq = useRef(0)
  const lastObjSeq = useRef(-1)

  useFrame((state, frameDt) => {
    const { sim, input } = refs
    const af = refs.airframe.current
    const spec = AIRFRAMES[af]
    const level = refs.level.current
    const dt = Math.min(frameDt, 0.1)
    const s = sim.s

    if (sim.resetRequested) {
      resetSim(sim, af, island, sim.resetRequested)
      sim.resetRequested = null
      // Fresh start: throttle stick back to idle (Normal/Acro pilots push it).
      input.throttle.current = -1
      camInit.current = false
    }

    // Input is sampled even in preflight, so the throttle stick is live.
    mergeInput(input, readPad(), dt, refs.invertPitch.current, sim.sticks)

    if (sim.phase === 'preflight') {
      holdInHand(sim)
      input.panic = false
      if (sim.launchRequested) {
        sim.launchRequested = false
        launchSim(sim, af)
        refs.sound.play('launch')
      }
    } else if (sim.paused) {
      // Auto-paused: hold everything (the scene keeps rendering).
      input.panic = false
    } else if (sim.phase === 'crashed') {
      stepCrash(sim, af, island, dt)
    } else {
      if (input.panic) {
        input.panic = false
        if (!sim.g.onGround) {
          triggerPanic(sim.a)
          refs.sound.play('panic')
        }
      }
      sim.acc = advanceFixed(sim.acc, dt, (h) => {
        stepSim(sim, level, af, island, h)
      })
    }

    // --- sound + haptics from ground events / phase changes ---
    if (sim.eventSeq !== lastSeq.current) {
      lastSeq.current = sim.eventSeq
      const ev = sim.lastEvent
      if (ev?.kind === 'touchdown' && ev.result === 'landed') {
        refs.sound.play('touchdown')
        vibrate(20)
      } else if (ev?.kind === 'touchdown' && ev.result === 'bounce') {
        refs.sound.play('bounce')
        vibrate(40)
      }
    }
    const flyingLive = sim.phase === 'flying' && !sim.paused
    const vsWarn = stallSpeed(spec) * 1.2
    refs.sound.update(
      flyingLive ? s.throttle : 0,
      flyingLive ? s.airspeed : 0,
      flyingLive && !sim.g.onGround && (s.stalled || s.airspeed < vsWarn),
      flyingLive,
    )

    if (sim.objectiveSeq !== lastObjSeq.current) {
      lastObjSeq.current = sim.objectiveSeq
      const o = sim.objective
      refs.onObjective.current({
        takeoff: o.takeoff,
        flyout: o.flyout,
        back: o.back,
        land: o.land,
        runway: o.runway,
        sink: o.sink,
        completed: o.completed,
      })
    }

    const phaseKey = sim.phase + ':' + sim.start
    if (phaseKey !== lastPhase.current) {
      if (sim.phase === 'crashed') {
        refs.sound.play('crash')
        vibrate(CRASH_PULSE)
      }
      lastPhase.current = phaseKey
      refs.onPhase.current(sim.phase, sim.start)
    }

    // --- model transform + surfaces ---
    const fpv = refs.view.current === 'fpv' && sim.phase !== 'preflight'
    const g = groupRef.current
    if (g) {
      g.visible = !fpv || sim.phase === 'crashed'
      g.position.set(s.pos.x, s.pos.y, s.pos.z)
      if (sim.phase === 'crashed') {
        g.rotation.x += dt * 9
        g.rotation.z += dt * 6
      } else {
        g.quaternion.set(s.q.x, s.q.y, s.q.z, s.q.w)
      }
    }
    const roll = sim.cmd.roll / spec.maxRoll
    const pitch = sim.cmd.pitch / spec.maxPitch
    const MAXD = 0.45
    if (af === 'wing') {
      // Elevons: pitch up raises both trailing edges; roll right raises the right.
      if (parts.surfL) parts.surfL.rotation.x = (-pitch + roll) * MAXD
      if (parts.surfR) parts.surfR.rotation.x = (-pitch - roll) * MAXD
    } else {
      if (parts.surfL) parts.surfL.rotation.x = roll * MAXD
      if (parts.surfR) parts.surfR.rotation.x = -roll * MAXD
      if (parts.elevator) parts.elevator.rotation.x = -pitch * MAXD
      if (parts.rudder) parts.rudder.rotation.y = (sim.cmd.yaw / spec.maxYaw) * MAXD
    }
    if (parts.prop) parts.prop.rotation.z += dt * (8 + s.throttle * 90)

    const cam = state.camera as PerspectiveCamera
    attitudeOf(s.q, _att)
    forwardOf(s.q, _f)

    if (fpv && sim.phase !== 'crashed') {
      // --- FPV: the nose camera ---
      cam.position.set(s.pos.x + _f.x * FPV_NOSE, s.pos.y + _f.y * FPV_NOSE + 0.05, s.pos.z + _f.z * FPV_NOSE)
      if (refs.fpvLevel.current) {
        quatFromEuler(_att.heading, _att.pitch, 0, _qp)
        cam.quaternion.set(_qp.x, _qp.y, _qp.z, _qp.w)
      } else {
        cam.quaternion.set(s.q.x, s.q.y, s.q.z, s.q.w)
      }
      cam.rotateX(FPV_UPTILT)
      cam.up.set(0, 1, 0)
      if (Math.abs(cam.fov - FPV_FOV) > 0.05) {
        cam.fov = FPV_FOV
        cam.updateProjectionMatrix()
      }
      camInit.current = false
      hudTick.current += dt
      if (hudTick.current >= 0.15) {
        hudTick.current = 0
        writeHud(refs, sim, island, spec.id, state.gl.info.render)
      }
      return
    }

    // --- chase camera: behind along the heading, partial roll follow ---
    _fwd.set(Math.sin(_att.heading), 0, -Math.cos(_att.heading))
    _camTarget.set(s.pos.x, s.pos.y, s.pos.z).addScaledVector(_fwd, -CHASE_BACK[af])
    // Lead by velocity/λ so the damped follow's steady lag (v/λ) cancels —
    // the boom stays the same length at any airspeed.
    _camTarget.x += s.vel.x / CHASE_LAMBDA
    _camTarget.y += s.vel.y / CHASE_LAMBDA
    _camTarget.z += s.vel.z / CHASE_LAMBDA
    _camTarget.y += CHASE_UP + _f.y * -1.5
    const ground = islandHeight(island, _camTarget.x, _camTarget.z) + 1.2
    if (_camTarget.y < ground) _camTarget.y = ground
    if (sim.phase === 'preflight') {
      // Three-quarter view of the pilot holding the plane, looking down the
      // runway — the chase boom would sit right behind the pilot's head.
      _camTarget.set(HAND.x - 3.2, HAND.y + 0.9, HAND.z + 5.2)
    }
    if (!camInit.current) {
      cam.position.copy(_camTarget)
      camInit.current = true
    } else {
      cam.position.lerp(_camTarget, 1 - Math.exp(-CHASE_LAMBDA * dt))
    }
    // Look a little below the flight path so the plane sits just under the
    // screen centre — clear of the PANIC button and the thumbs.
    _look.set(s.pos.x + _f.x * 6, s.pos.y + _f.y * 6 - 0.4, s.pos.z + _f.z * 6)
    if (sim.phase === 'preflight') _look.set(HAND.x + 6, HAND.y - 0.6, HAND.z - 1)
    // Partial roll: tilt the camera's up vector toward the plane's bank.
    const bank = Math.abs(_att.bank) < Math.PI / 2 ? _att.bank : 0
    _up.set(0, 1, 0).applyQuaternion(_q.setFromAxisAngle(_fwd, bank * CHASE_ROLL_FOLLOW))
    cam.up.copy(_up)
    cam.lookAt(_look)
    const targetFov = 60 + Math.min(12, Math.max(0, (s.airspeed - spec.vAuthority) * 0.8))
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-3 * dt))
      cam.updateProjectionMatrix()
    }

    // --- HUD / telemetry (direct DOM writes, ~7 Hz) ---
    hudTick.current += dt
    if (hudTick.current >= 0.15) {
      hudTick.current = 0
      writeHud(refs, sim, island, spec.id, state.gl.info.render)
    }
  })

  return (
    <group ref={groupRef}>
      <PlaneMesh airframe={airframe} color={color} parts={parts} />
    </group>
  )
}

function readPad(): readonly number[] | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null
  if (!pads) return null
  for (const p of pads) if (p && p.connected) return p.axes
  return null
}

const DEG = 180 / Math.PI

function writeHud(
  refs: RigRefs,
  sim: WingSim,
  island: IslandSpec,
  airframe: AirframeId,
  render: { calls: number; triangles: number },
) {
  const s = sim.s
  const el = refs.hud.current
  const text = refs.hudText.current
  if (!el) return
  attitudeOf(s.q, _att)
  const agl = s.pos.y - islandHeight(island, s.pos.x, s.pos.z)
  const spec = AIRFRAMES[airframe]
  const vs = stallSpeed(spec)
  // Stall state only means something in the air (parked, the airflow
  // angle is noise and would paint the HUD red).
  const airborne = !sim.g.onGround && sim.phase === 'flying'
  const stalled = airborne && s.stalled
  const stallWarn = airborne && (s.airspeed < vs * 1.2 || s.stalled)
  el.dataset.airspeed = s.airspeed.toFixed(2)
  el.dataset.alt = s.pos.y.toFixed(2)
  el.dataset.agl = agl.toFixed(2)
  el.dataset.throttle = s.throttle.toFixed(2)
  el.dataset.bank = (_att.bank * DEG).toFixed(1)
  el.dataset.pitch = (_att.pitch * DEG).toFixed(1)
  el.dataset.heading = (((_att.heading * DEG) % 360 + 360) % 360).toFixed(1)
  el.dataset.aoa = (s.aoa * DEG).toFixed(1)
  el.dataset.stall = stalled ? 'stalled' : stallWarn ? 'warn' : 'ok'
  el.dataset.vs = s.vel.y.toFixed(2)
  el.dataset.x = s.pos.x.toFixed(1)
  el.dataset.z = s.pos.z.toFixed(1)
  el.dataset.assistMode = sim.a.mode
  el.dataset.phase = sim.phase
  el.dataset.start = sim.start
  el.dataset.ground = sim.g.onGround ? 'ground' : 'air'
  el.dataset.crashed = sim.phase === 'crashed' ? 'true' : 'false'
  el.dataset.crashes = String(sim.crashes)
  el.dataset.landings = String(sim.landings)
  const o = sim.objective
  el.dataset.objective = !o.takeoff ? 'takeoff' : !o.flyout ? 'flyout' : !o.land ? 'land' : 'done'
  el.dataset.objectiveBack = o.back ? 'true' : 'false'
  el.dataset.objectiveRunway = o.runway ? 'true' : 'false'
  el.dataset.objectiveDone = String(o.completed)
  el.dataset.maxDist = o.maxDist.toFixed(0)

  el.dataset.touchdown = sim.g.lastResult ?? 'none'
  el.dataset.touchSink = sim.g.lastSink.toFixed(2)
  el.dataset.inputSource = refs.input.source
  // Home: bearing to the runway centre relative to the nose.
  const dx = STRIP.x - s.pos.x
  const dz = STRIP.z - s.pos.z
  const dist = Math.hypot(dx, dz)
  const bearing = Math.atan2(dx, -dz)
  const rel = Math.atan2(Math.sin(bearing - _att.heading), Math.cos(bearing - _att.heading))
  el.dataset.homeDist = dist.toFixed(1)
  const od = refs.objectiveDist.current
  if (od) od.textContent = `${Math.round(Math.min(dist, FLY_OUT_DIST))} / ${FLY_OUT_DIST} m`
  el.dataset.homeBearing = (rel * DEG).toFixed(1)
  // Landing hint (pure decision in objective.ts; words from the body).
  const hint: LandingHint = refs.hintsOn.current
    ? landingHint({
        landStep: !!(o.takeoff && o.flyout && !o.land),
        airborne: !sim.g.onGround && sim.phase === 'flying',
        homeDist: dist,
        homeRel: rel,
        offCentreline: Math.abs(s.pos.z - STRIP.z),
        agl,
      })
    : null
  el.dataset.hint = hint ?? 'none'
  const he = refs.hintEl.current
  if (he) {
    const txt = hint ? refs.hintText.current(hint) : ''
    if (he.textContent !== txt) he.textContent = txt
    he.style.display = hint ? 'block' : 'none'
  }
  const arrow = refs.homeArrow.current
  if (arrow) arrow.style.transform = `rotate(${(rel * DEG).toFixed(1)}deg)`
  const ht = refs.homeText.current
  if (ht) ht.textContent = `${Math.round(dist)} m`
  el.dataset.drawCalls = String(render.calls)
  el.dataset.triangles = String(render.triangles)
  el.dataset.view = refs.view.current
  const c = refs.sound.counts
  el.dataset.sfxLaunch = String(c.launch)
  el.dataset.sfxTouchdown = String(c.touchdown)
  el.dataset.sfxBounce = String(c.bounce)
  el.dataset.sfxCrash = String(c.crash)
  el.dataset.sfxPanic = String(c.panic)
  el.dataset.sound = refs.sound.enabled ? 'on' : 'off'
  el.dataset.paused = sim.paused ? 'true' : 'false'
  const outside = Math.hypot(s.pos.x, s.pos.z) > WORLD_HALF
  el.dataset.outside = outside ? 'true' : 'false'
  const warn = refs.edgeWarn.current
  if (warn) warn.style.display = outside && sim.phase === 'flying' ? 'block' : 'none'
  const sym = refs.bankSymbol.current
  if (sym) sym.style.transform = `translate(-50%, -50%) rotate(${(_att.bank * DEG).toFixed(1)}deg)`
  if (text) {
    text.textContent = `SPD ${s.airspeed.toFixed(0)} · ALT ${Math.max(0, agl).toFixed(0)} · THR ${Math.round(s.throttle * 100)}%`
    text.style.color = stalled ? '#ff5252' : stallWarn ? '#ffb300' : '#ffffff'
  }
}
