import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type {
  Collider,
  ControlInput,
  DroneView,
  FlightMode,
  FlightState,
  Tuning,
  Weather,
} from './flightModel'
import type { BatteryEvent, BatteryState } from './flightModel'
import {
  CRASH_DURATION,
  CRASH_SPEED,
  DEAD_INPUT,
  DRONE_RADIUS,
  SPAWN,
  sampleWind,
  stepBattery,
  stepCrash,
  stepFlight,
} from './flightModel'
import type { OperatorState, WalkerEvent } from './operatorWalk'
import { CARRY_HEIGHT, CARRY_REACH, GROUND_EPS, stepOperator } from './operatorWalk'
import type { ExternalState } from './externalInput'
import { pollGamepad } from './externalInput'
import type { Gate, LandingPadSpec } from './worldLayout'
import { crossedGate, scoreLanding } from './worldLayout'
import type { LapState } from './lapTimer'
import { PAD_CENTER, PAD_START_RADIUS, fmtLap, updateLap } from './lapTimer'
import {
  CONTACT_COOLDOWN_MS,
  CONTACT_MIN_IMPACT,
  CRASH_PULSE,
  contactPulse,
  vibrate,
} from './haptics'
import DroneModel from './DroneModel'
import type { GateFlash } from './GateRings'

/** Seconds between HUD DOM writes (~7 Hz — cheap, and no React renders). */
const HUD_INTERVAL = 0.15

/** Transient crash-tumble state, owned by the body, mutated by the rig. */
export interface CrashState {
  active: boolean
  /** Canvas clock time (s) when the tumble ends and the drone respawns. */
  until: number
  spinX: number
  spinZ: number
}

/**
 * The sim loop. Every frame: advance the flight model, pose the drone (outer
 * group = position + yaw, inner group = visual tilt), track the ground blob
 * shadow, and periodically write telemetry into the HUD element (textContent
 * + data-alt/data-speed, which verification scripts read).
 */
export default function DroneRig({
  controls,
  flight,
  view,
  operator,
  operatorHold,
  followDist,
  external,
  pilotChipRef,
  minimapOperatorRef,
  onWalkerEvent,
  hudRef,
  timerRef,
  minimapDroneRef,
  colliders,
  gates,
  weather,
  flightMode,
  tuning,
  windRef,
  crashMode,
  crashRef,
  onCrash,
  onCrashEnd,
  landingMode,
  landingPads,
  onLanding,
  batteryMode,
  batteryRef,
  batteryBarRef,
  onBatteryEvent,
  activeGate,
  onGatePass,
  flashRef,
  lap,
  bestLapMs,
  onLapComplete,
}: {
  controls: ControlInput
  flight: FlightState
  view: DroneView
  /** The walking operator (shared with CameraRig/OperatorFigure/Minimap). */
  operator: { current: OperatorState }
  /** Freezes the follow autopilot — stand at the current spot. */
  operatorHold: boolean
  /** Preferred follow distance (the walker's stop radius). */
  followDist: number
  /** External-input ownership (gamepad polled here, keyboard in the body). */
  external: { current: ExternalState }
  /** Pilot chip (los/walk views) — text + data-pilot written on the tick,
   * because the rescue/manual state lives in refs and never re-renders. */
  pilotChipRef: RefObject<HTMLDivElement | null>
  minimapOperatorRef: RefObject<SVGGElement | null>
  onWalkerEvent: (event: WalkerEvent) => void
  hudRef: RefObject<HTMLDivElement | null>
  timerRef: RefObject<HTMLDivElement | null>
  /** Minimap drone marker — transform is written here, never via React. */
  minimapDroneRef: RefObject<SVGGElement | null>
  colliders: readonly Collider[]
  gates: readonly Gate[]
  weather: Weather
  flightMode: FlightMode
  tuning: Tuning
  /** Shared with RainField so the drops drift with the same gusts. */
  windRef: { current: { x: number; y: number } }
  crashMode: boolean
  crashRef: { current: CrashState }
  onCrash: () => void
  onCrashEnd: () => void
  landingMode: boolean
  landingPads: readonly LandingPadSpec[]
  onLanding: (points: number) => void
  batteryMode: boolean
  batteryRef: { current: BatteryState }
  /** Battery bar fill element — width/colour written on the telemetry tick. */
  batteryBarRef: RefObject<HTMLDivElement | null>
  onBatteryEvent: (event: BatteryEvent) => void
  activeGate: number
  onGatePass: () => void
  flashRef: { current: GateFlash }
  lap: LapState
  bestLapMs: number
  onLapComplete: (lapMs: number, path: number[]) => void
}) {
  const outerRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const hudClock = useRef(0)
  const prevPos = useRef({ ...flight.pos })
  /** Sampled positions of the lap in progress (flat x,y,z triples). */
  const pathRef = useRef<number[]>([])
  /** Wall-clock ms of the last contact buzz (haptics cooldown). */
  const lastBuzzMs = useRef(0)
  /** True once the drone has left its last scored pad — arms the next one. */
  const airborneRef = useRef(true)

  useFrame(({ clock }, dt) => {
    // Gamepad first: it can only be polled, and the ownership rule keeps an
    // idle pad from stomping touch/keyboard input.
    pollGamepad(external.current, controls)

    const wind = windRef.current
    if (weather === 'storm') {
      sampleWind(clock.elapsedTime, wind)
    } else {
      wind.x = 0
      wind.y = 0
    }

    const crash = crashRef.current
    const prev = prevPos.current
    const now = performance.now()

    if (crash.active) {
      // Tumble: controls dead, gravity wins, gates/laps suspended.
      stepCrash(flight, dt, colliders)
      crash.spinX += 6 * dt
      crash.spinZ += 4.5 * dt
      if (clock.elapsedTime >= crash.until) {
        crash.active = false
        crash.spinX = 0
        crash.spinZ = 0
        onCrashEnd()
      }
    } else {
      // Walking operator: steps in walk view; once retrieving or carrying it
      // sees the rescue through in any view. 'place' sets the drone down on
      // the pad — the ordinary on-pad recharge then revives it.
      const op = operator.current
      const battery = batteryRef.current
      if (view === 'walk' || op.mode === 'retrieve' || op.mode === 'carry') {
        const walkerEvent = stepOperator(
          op,
          dt,
          {
            x: flight.pos.x,
            z: flight.pos.z,
            dead: batteryMode && battery.dead,
            grounded: flight.pos.y <= DRONE_RADIUS + GROUND_EPS,
          },
          controls,
          colliders,
          operatorHold,
          followDist,
        )
        if (walkerEvent === 'place') {
          flight.pos.x = PAD_CENTER.x
          flight.pos.y = DRONE_RADIUS
          flight.pos.z = PAD_CENTER.z
          flight.vel.x = 0
          flight.vel.y = 0
          flight.vel.z = 0
        }
        if (walkerEvent) onWalkerEvent(walkerEvent)
      }
      const carried = op.mode === 'carry'

      // Battery bookkeeping first — a dead battery kills the sticks and the
      // drone descends where it is until rescued (pad recharge, the walking
      // operator's carry, or reset).
      let effectiveControls = controls
      if (batteryMode) {
        const activity = Math.max(
          Math.abs(controls.left.x),
          Math.abs(controls.left.y),
          Math.abs(controls.right.x),
          Math.abs(controls.right.y),
        )
        // No recharging in the operator's hands — only set down on a pad.
        const onSpawnPad =
          !carried &&
          flight.pos.y < 1.2 &&
          Math.hypot(flight.pos.x - PAD_CENTER.x, flight.pos.z - PAD_CENTER.z) <=
            PAD_START_RADIUS
        const onRooftopPad =
          landingMode &&
          landingPads.some(
            (pad) =>
              Math.abs(flight.pos.y - pad.top) < 0.1 &&
              Math.hypot(flight.pos.x - pad.x, flight.pos.z - pad.z) <= pad.r,
          )
        const event = stepBattery(
          battery,
          activity,
          onSpawnPad || onRooftopPad,
          Math.min(dt, 0.05),
        )
        if (event) onBatteryEvent(event)
        if (battery.dead) effectiveControls = DEAD_INPUT
      }

      if (carried) {
        // The drone rides in the operator's hands: physics paused, pose set
        // directly. impact stays 0 so crash/landing/haptics stay silent, and
        // zeroed velocity keeps the lap logic from seeing self-propulsion.
        flight.pos.x = op.x - Math.sin(op.heading) * CARRY_REACH
        flight.pos.z = op.z - Math.cos(op.heading) * CARRY_REACH
        flight.pos.y = CARRY_HEIGHT
        flight.vel.x = 0
        flight.vel.y = 0
        flight.vel.z = 0
        flight.tiltPitch = 0
        flight.tiltRoll = 0
      }
      const impact = carried
        ? 0
        : stepFlight(
            flight,
            effectiveControls,
            dt,
            colliders,
            weather === 'storm' ? wind : undefined,
            flightMode,
            tuning,
          )
      if (crashMode && impact >= CRASH_SPEED) {
        crash.active = true
        crash.until = clock.elapsedTime + CRASH_DURATION
        crash.spinX = 0
        crash.spinZ = 0
        vibrate(CRASH_PULSE)
        onCrash()
      } else {
        if (
          impact >= CONTACT_MIN_IMPACT &&
          now - lastBuzzMs.current >= CONTACT_COOLDOWN_MS
        ) {
          lastBuzzMs.current = now
          vibrate(contactPulse(impact))
        }

        // Landing challenge: an airborne drone settling onto a pad's roof
        // (impact = the vertical speed the roof absorbed) scores by
        // precision + softness; leaving the pad re-arms the next attempt.
        if (landingMode) {
          if (airborneRef.current && impact > 0) {
            for (const pad of landingPads) {
              if (Math.abs(flight.pos.y - pad.top) < 0.05) {
                const dist = Math.hypot(
                  flight.pos.x - pad.x,
                  flight.pos.z - pad.z,
                )
                if (dist <= pad.r) {
                  airborneRef.current = false
                  onLanding(scoreLanding(dist, pad.r, impact))
                  break
                }
              }
            }
          } else if (!airborneRef.current) {
            const clearOfPads = landingPads.every(
              (pad) =>
                flight.pos.y > pad.top + 1 ||
                Math.hypot(flight.pos.x - pad.x, flight.pos.z - pad.z) >
                  pad.r + 0.5,
            )
            if (clearOfPads) airborneRef.current = true
          }
        }
        // Gate pass (only while a lap is running): did this frame's movement
        // cross the active ring's plane inside the ring? A long segment means
        // a teleport (reset/respawn) — skip it so the jump can't score.
        const jump =
          Math.hypot(
            flight.pos.x - prev.x,
            flight.pos.y - prev.y,
            flight.pos.z - prev.z,
          ) > 2
        if (
          lap.status === 'running' &&
          activeGate < gates.length &&
          !jump &&
          crossedGate(prev, flight.pos, gates[activeGate])
        ) {
          flashRef.current = { gate: activeGate, until: clock.elapsedTime + 0.6 }
          onGatePass()
        }

        // Lap start/finish against the pad zone.
        const selfPropelled =
          Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z) > 0.5
        const lapEvent = jump
          ? null
          : updateLap(lap, flight.pos, activeGate, gates.length, now, selfPropelled)
        if (lapEvent === 'started') {
          pathRef.current = [
            Math.round(flight.pos.x * 10) / 10,
            Math.round(flight.pos.y * 10) / 10,
            Math.round(flight.pos.z * 10) / 10,
          ]
        } else if (lapEvent === 'finished') {
          onLapComplete(now - lap.startMs, pathRef.current)
          pathRef.current = []
        }
      }
    }
    prev.x = flight.pos.x
    prev.y = flight.pos.y
    prev.z = flight.pos.z

    const outer = outerRef.current
    if (outer) {
      outer.position.set(flight.pos.x, flight.pos.y, flight.pos.z)
      outer.rotation.y = flight.yaw
    }
    const tilt = tiltRef.current
    if (tilt) {
      // Crash overrides the aerodynamic tilt with an accelerating tumble.
      tilt.rotation.x = crash.active ? crash.spinX : flight.tiltPitch
      tilt.rotation.z = crash.active ? crash.spinZ : flight.tiltRoll
    }
    const shadow = shadowRef.current
    if (shadow) {
      shadow.position.set(flight.pos.x, 0.02, flight.pos.z)
      const grow = 1 + flight.pos.y * 0.04
      shadow.scale.set(grow, grow, 1)
      const mat = shadow.material as MeshBasicMaterial
      mat.opacity = Math.min(0.35, Math.max(0.06, 0.35 - flight.pos.y * 0.008))
    }

    hudClock.current += dt
    if (hudClock.current >= HUD_INTERVAL) {
      hudClock.current = 0
      const hud = hudRef.current
      if (hud) {
        const alt = flight.pos.y
        const speed = Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z)
        const windSpeed = Math.hypot(windRef.current.x, windRef.current.y)
        hud.textContent =
          `ALT ${alt.toFixed(1)}m · SPD ${speed.toFixed(1)}` +
          (weather === 'storm' ? ` · WIND ${windSpeed.toFixed(1)}` : '')
        hud.dataset.alt = alt.toFixed(1)
        hud.dataset.speed = speed.toFixed(1)
        hud.dataset.wind = weather === 'storm' ? windSpeed.toFixed(1) : '0'
        hud.dataset.crashState = crash.active ? 'tumbling' : 'none'
        // Extra telemetry for tests/debugging; costs nothing beyond the write.
        hud.dataset.x = flight.pos.x.toFixed(2)
        hud.dataset.z = flight.pos.z.toFixed(2)
        hud.dataset.yaw = flight.yaw.toFixed(3)
        const op = operator.current
        hud.dataset.opX = op.x.toFixed(2)
        hud.dataset.opZ = op.z.toFixed(2)
        hud.dataset.opMode = op.mode
        hud.dataset.opHeading = op.heading.toFixed(2)
        hud.dataset.inputSource = external.current.owner ?? 'touch'
      }
      const chip = pilotChipRef.current
      if (chip) {
        const op = operator.current
        const rescuing = op.mode === 'retrieve' || op.mode === 'carry'
        const pilot =
          view === 'los'
            ? 'standing'
            : rescuing
              ? operatorHold
                ? 'manual-walk'
                : 'auto-rescue'
              : operatorHold
                ? 'holding'
                : 'walking'
        if (chip.dataset.pilot !== pilot) {
          chip.dataset.pilot = pilot
          chip.textContent =
            pilot === 'standing'
              ? 'PILOT · STANDING'
              : pilot === 'manual-walk'
                ? 'PILOT · MANUAL WALK (STICKS = MOVE/LOOK)'
                : pilot === 'auto-rescue'
                  ? 'PILOT · AUTO RESCUE'
                  : pilot === 'holding'
                    ? 'PILOT · HOLDING POSITION'
                    : 'PILOT · WALKING (FOLLOWS DRONE)'
          chip.style.color =
            pilot === 'holding' || pilot === 'manual-walk' ? '#ffab40' : '#b0bec5'
        }
      }
      const opMarker = minimapOperatorRef.current
      if (opMarker) {
        const op = operator.current
        opMarker.setAttribute(
          'transform',
          `translate(${op.x.toFixed(2)} ${op.z.toFixed(2)})`,
        )
      }
      const bar = batteryBarRef.current
      if (bar) {
        const level = batteryRef.current.level
        bar.style.width = `${level}%`
        bar.style.backgroundColor =
          level > 40 ? '#66bb6a' : level > 15 ? '#ffb300' : '#ef5350'
        bar.dataset.level = level.toFixed(0)
      }
      const marker = minimapDroneRef.current
      if (marker) {
        marker.setAttribute(
          'transform',
          `translate(${flight.pos.x.toFixed(2)} ${flight.pos.z.toFixed(2)}) rotate(${(
            (-flight.yaw * 180) /
            Math.PI
          ).toFixed(1)})`,
        )
      }
      const timer = timerRef.current
      if (timer) {
        if (lap.status === 'running') {
          const ms = now - lap.startMs
          timer.textContent = `LAP ${fmtLap(ms)}`
          timer.dataset.lapStatus = 'running'
          timer.dataset.lapMs = String(Math.round(ms))
        } else {
          timer.textContent = bestLapMs > 0 ? `BEST ${fmtLap(bestLapMs)}` : 'BEST —'
          timer.dataset.lapStatus = 'ready'
          timer.dataset.lapMs = '0'
        }
        timer.dataset.bestMs = String(bestLapMs)
      }
      // Sample the ghost path while racing (~7 Hz keeps a 60 s lap ~10 KB).
      if (lap.status === 'running') {
        pathRef.current.push(
          Math.round(flight.pos.x * 10) / 10,
          Math.round(flight.pos.y * 10) / 10,
          Math.round(flight.pos.z * 10) / 10,
        )
      }
    }
  })

  return (
    <>
      <group ref={outerRef} position={[SPAWN.x, SPAWN.y, SPAWN.z]}>
        <group ref={tiltRef}>
          <DroneModel controls={controls} />
        </group>
      </group>
      <mesh
        ref={shadowRef}
        rotation-x={-Math.PI / 2}
        position={[SPAWN.x, 0.02, SPAWN.z]}
      >
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </>
  )
}
