import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { Collider, ControlInput, FlightState, Weather } from './flightModel'
import {
  CRASH_DURATION,
  CRASH_SPEED,
  SPAWN,
  sampleWind,
  stepCrash,
  stepFlight,
} from './flightModel'
import type { Gate } from './worldLayout'
import { crossedGate } from './worldLayout'
import type { LapState } from './lapTimer'
import { fmtLap, updateLap } from './lapTimer'
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
  hudRef,
  timerRef,
  colliders,
  gates,
  weather,
  windRef,
  crashMode,
  crashRef,
  onCrash,
  onCrashEnd,
  activeGate,
  onGatePass,
  flashRef,
  lap,
  bestLapMs,
  onLapComplete,
}: {
  controls: ControlInput
  flight: FlightState
  hudRef: RefObject<HTMLDivElement | null>
  timerRef: RefObject<HTMLDivElement | null>
  colliders: readonly Collider[]
  gates: readonly Gate[]
  weather: Weather
  /** Shared with RainField so the drops drift with the same gusts. */
  windRef: { current: { x: number; y: number } }
  crashMode: boolean
  crashRef: { current: CrashState }
  onCrash: () => void
  onCrashEnd: () => void
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

  useFrame(({ clock }, dt) => {
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
      const impact = stepFlight(
        flight,
        controls,
        dt,
        colliders,
        weather === 'storm' ? wind : undefined,
      )
      if (crashMode && impact >= CRASH_SPEED) {
        crash.active = true
        crash.until = clock.elapsedTime + CRASH_DURATION
        crash.spinX = 0
        crash.spinZ = 0
        onCrash()
      } else {
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
