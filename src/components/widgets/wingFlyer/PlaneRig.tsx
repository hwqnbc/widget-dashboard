import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import type { Group, PerspectiveCamera } from 'three'
import type { AirframeId } from './airframes'
import { AIRFRAMES } from './airframes'
import type { AssistLevel } from './assists'
import { setAssistMode, stepAssist, triggerPanic } from './assists'
import type { PlaneState } from './planeModel'
import { advanceFixed, attitudeOf, forwardOf, resetPlane, stallSpeed, stepPlane } from './planeModel'
import type { WingSim } from './wingSim'
import type { IslandSpec } from './islandLayout'
import { STRIP, STRIP_Y, WORLD_HALF, islandHeight } from './islandLayout'
import type { WingInput } from './wingInput'
import { mergeInput } from './wingInput'
import PlaneMesh from './PlaneMesh'
import { createPlaneParts } from './planeParts'

/** Seconds of crash tumble before the respawn. */
export const CRASH_TIME = 0.9
/** Airborne spawn (step 4 — the hand launch arrives in step 5): over the
 * runway's west end, heading east along it. */
export const SPAWN_AGL = 40
/** Chase camera: boom length/height (m) per airframe, and damping. */
const CHASE_BACK: Record<AirframeId, number> = { trainer: 4.2, wing: 3.4 }
const CHASE_UP = 1.3
const CHASE_LAMBDA = 6
/** Fraction of the plane's bank the chase camera follows (comfort). */
const CHASE_ROLL_FOLLOW = 0.25

export interface RigRefs {
  sim: WingSim
  input: WingInput
  airframe: MutableRefObject<AirframeId>
  level: MutableRefObject<AssistLevel>
  invertPitch: MutableRefObject<boolean>
  hud: MutableRefObject<HTMLElement | null>
  hudText: MutableRefObject<HTMLElement | null>
}

const _fwd = new Vector3()
const _camTarget = new Vector3()
const _look = new Vector3()
const _up = new Vector3()
const _q = new Quaternion()
const _att = { heading: 0, pitch: 0, bank: 0 }
const _f = { x: 0, y: 0, z: 0 }

function respawn(sim: WingSim, airframe: AirframeId, input: WingInput) {
  const spec = AIRFRAMES[airframe]
  resetPlane(
    sim.s,
    { x: STRIP.x - STRIP.length / 2, y: STRIP_Y + SPAWN_AGL, z: STRIP.z },
    STRIP.heading,
    spec.vAuthority,
    0,
    0.45,
  )
  setAssistMode(sim.a, 'fly')
  sim.acc = 0
  sim.crash = 0
  // Throttle stick to roughly cruise power (Normal/Acro).
  input.throttle.current = -0.1
}

/** Ground or building contact under the plane (point + small radius). */
function hitsSomething(island: IslandSpec, s: PlaneState): boolean {
  const { x, y, z } = s.pos
  if (y < islandHeight(island, x, z) + 0.25) return true
  for (const b of island.buildings) {
    if (Math.abs(x - b.x) < b.hw + 0.4 && Math.abs(z - b.z) < b.hd + 0.4 && y < b.y + b.h + 0.3) return true
  }
  return false
}

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

  useFrame((state, frameDt) => {
    const { sim, input } = refs
    const af = refs.airframe.current
    const spec = AIRFRAMES[af]
    const dt = Math.min(frameDt, 0.1)
    const s = sim.s

    if (sim.resetRequested) {
      sim.resetRequested = false
      respawn(sim, af, input)
      camInit.current = false
    }

    if (sim.crash > 0) {
      // Cartoon tumble, then respawn.
      sim.crash -= dt
      s.vel.y -= 9.81 * dt
      s.vel.x *= 0.96
      s.vel.z *= 0.96
      s.pos.x += s.vel.x * dt
      s.pos.z += s.vel.z * dt
      s.pos.y = Math.max(islandHeight(island, s.pos.x, s.pos.z) + 0.2, s.pos.y + s.vel.y * dt)
      if (sim.crash <= 0) respawn(sim, af, input)
    } else {
      mergeInput(input, readPad(), dt, refs.invertPitch.current, sim.sticks)
      if (input.panic) {
        input.panic = false
        triggerPanic(sim.a)
      }
      sim.acc = advanceFixed(sim.acc, dt, (h) => {
        const agl = s.pos.y - islandHeight(island, s.pos.x, s.pos.z)
        stepAssist(sim.a, refs.level.current, s, spec, sim.sticks, agl, h, sim.cmd, sim.opts)
        stepPlaneSafe(s, spec, sim, h)
      })
      if (hitsSomething(island, s)) {
        sim.crash = CRASH_TIME
        sim.crashes++
      }
    }

    // --- model transform + surfaces ---
    const g = groupRef.current
    if (g) {
      g.position.set(s.pos.x, s.pos.y, s.pos.z)
      if (sim.crash > 0) {
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

    // --- chase camera: behind along the heading, partial roll follow ---
    const cam = state.camera as PerspectiveCamera
    attitudeOf(s.q, _att)
    forwardOf(s.q, _f)
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
    if (!camInit.current) {
      cam.position.copy(_camTarget)
      camInit.current = true
    } else {
      cam.position.lerp(_camTarget, 1 - Math.exp(-CHASE_LAMBDA * dt))
    }
    // Look a little below the flight path so the plane sits just under the
    // screen centre — clear of the PANIC button and the thumbs.
    _look.set(s.pos.x + _f.x * 6, s.pos.y + _f.y * 6 - 0.4, s.pos.z + _f.z * 6)
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
      writeHud(refs, sim, island, spec.id)
    }
  })

  return (
    <group ref={groupRef}>
      <PlaneMesh airframe={airframe} color={color} parts={parts} />
    </group>
  )
}

function stepPlaneSafe(s: PlaneState, spec: (typeof AIRFRAMES)[AirframeId], sim: WingSim, h: number) {
  stepPlane(s, spec, sim.cmd, h, sim.opts)
  // Soft boundary: past the edge of the world, Trainer/Normal-style nudge is
  // step 6; for now keep the plane from leaving the rendered terrain.
  const lim = WORLD_HALF + 120
  if (Math.abs(s.pos.x) > lim) s.vel.x -= Math.sign(s.pos.x) * 4 * h
  if (Math.abs(s.pos.z) > lim) s.vel.z -= Math.sign(s.pos.z) * 4 * h
}

function readPad(): readonly number[] | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null
  if (!pads) return null
  for (const p of pads) if (p && p.connected) return p.axes
  return null
}

const DEG = 180 / Math.PI

function writeHud(refs: RigRefs, sim: WingSim, island: IslandSpec, airframe: AirframeId) {
  const s = sim.s
  const el = refs.hud.current
  const text = refs.hudText.current
  if (!el) return
  attitudeOf(s.q, _att)
  const agl = s.pos.y - islandHeight(island, s.pos.x, s.pos.z)
  const spec = AIRFRAMES[airframe]
  const vs = stallSpeed(spec)
  const stallWarn = s.airspeed < vs * 1.2 || s.stalled
  el.dataset.airspeed = s.airspeed.toFixed(2)
  el.dataset.alt = s.pos.y.toFixed(2)
  el.dataset.agl = agl.toFixed(2)
  el.dataset.throttle = s.throttle.toFixed(2)
  el.dataset.bank = (_att.bank * DEG).toFixed(1)
  el.dataset.pitch = (_att.pitch * DEG).toFixed(1)
  el.dataset.heading = (((_att.heading * DEG) % 360 + 360) % 360).toFixed(1)
  el.dataset.aoa = (s.aoa * DEG).toFixed(1)
  el.dataset.stall = s.stalled ? 'stalled' : stallWarn ? 'warn' : 'ok'
  el.dataset.vs = s.vel.y.toFixed(2)
  el.dataset.x = s.pos.x.toFixed(1)
  el.dataset.z = s.pos.z.toFixed(1)
  el.dataset.assistMode = sim.a.mode
  el.dataset.crashed = sim.crash > 0 ? 'true' : 'false'
  el.dataset.crashes = String(sim.crashes)
  el.dataset.inputSource = refs.input.source
  if (text) {
    text.textContent = `SPD ${s.airspeed.toFixed(0)} · ALT ${Math.max(0, agl).toFixed(0)} · THR ${Math.round(s.throttle * 100)}%`
    text.style.color = s.stalled ? '#ff5252' : stallWarn ? '#ffb300' : '#ffffff'
  }
}
