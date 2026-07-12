import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { ControlInput, FlightState } from './flightModel'
import { SPAWN, stepFlight } from './flightModel'
import DroneModel from './DroneModel'

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
}: {
  controls: ControlInput
  flight: FlightState
  hudRef: RefObject<HTMLDivElement | null>
}) {
  const outerRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const shadowRef = useRef<Mesh>(null)
  const hudClock = useRef(0)

  useFrame((_, dt) => {
    stepFlight(flight, controls, dt)

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
