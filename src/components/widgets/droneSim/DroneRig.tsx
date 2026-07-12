import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { ControlInput, FlightState } from './flightModel'
import { SPAWN, stepFlight } from './flightModel'
import { COLLIDERS, GATES, crossedGate } from './worldLayout'
import DroneModel from './DroneModel'
import type { GateFlash } from './GateRings'

/** Seconds between HUD DOM writes (~7 Hz — cheap, and no React renders). */
const HUD_INTERVAL = 0.15

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
  activeGate,
  onGatePass,
  flashRef,
}: {
  controls: ControlInput
  flight: FlightState
  hudRef: RefObject<HTMLDivElement | null>
  activeGate: number
  onGatePass: () => void
  flashRef: { current: GateFlash }
}) {
  const outerRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const hudClock = useRef(0)
  const prevPos = useRef({ ...flight.pos })

  useFrame(({ clock }, dt) => {
    stepFlight(flight, controls, dt, COLLIDERS)

    // Gate pass: did this frame's movement cross the active ring's plane
    // inside the ring? A long segment means a teleport (reset) — skip it so
    // the jump back to the pad can't score a gate.
    const prev = prevPos.current
    const jump =
      Math.hypot(
        flight.pos.x - prev.x,
        flight.pos.y - prev.y,
        flight.pos.z - prev.z,
      ) > 2
    if (!jump && crossedGate(prev, flight.pos, GATES[activeGate])) {
      flashRef.current = { gate: activeGate, until: clock.elapsedTime + 0.6 }
      onGatePass()
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
      tilt.rotation.x = flight.tiltPitch
      tilt.rotation.z = flight.tiltRoll
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
        hud.textContent = `ALT ${alt.toFixed(1)}m · SPD ${speed.toFixed(1)}`
        hud.dataset.alt = alt.toFixed(1)
        hud.dataset.speed = speed.toFixed(1)
        // Extra telemetry for tests/debugging; costs nothing beyond the write.
        hud.dataset.x = flight.pos.x.toFixed(2)
        hud.dataset.z = flight.pos.z.toFixed(2)
        hud.dataset.yaw = flight.yaw.toFixed(3)
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
