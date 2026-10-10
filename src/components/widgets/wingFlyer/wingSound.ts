/**
 * Synthesized Web Audio for Wing Flyer — no asset files (the drone `sound.ts`
 * pattern). Three continuous layers and a few one-shots:
 *  - motor: two detuned sawtooths through a lowpass, pitched by throttle and
 *    airspeed — silent when the throttle is off, so a GLIDE sounds different
 *    (just the wind), a nice cue on its own,
 *  - wind: looped noise through a bandpass, louder and brighter with speed,
 *  - stall horn: a pulsing square while the stall warning is on,
 *  - one-shots: launch whoosh, touchdown chirp, bounce, crash thud, panic.
 * Kept low in the mix (audio fatigue is a known flight-game pitfall). No-ops
 * without an AudioContext; created lazily, resumed on the first gesture.
 * Every one-shot bumps a counter mirrored as `data-sfx-*` (lessons #55/#56:
 * untestable subsystems get a counter contract).
 */

export type WingSfx = 'launch' | 'touchdown' | 'bounce' | 'crash' | 'panic'

export interface WingSound {
  setEnabled(on: boolean): void
  /** Per-frame: throttle 0..1, airspeed m/s, stall warning, motor alive. */
  update(throttle: number, airspeed: number, stallWarn: boolean, alive: boolean): void
  play(sfx: WingSfx): void
  /** One-shot counters (always counted, even muted — the test contract). */
  counts: Record<WingSfx, number>
  readonly enabled: boolean
}

const MASTER_GAIN = 0.1
const MOTOR_GAIN = 0.35
const MOTOR_IDLE_HZ = 90
const MOTOR_RANGE_HZ = 260
const WIND_GAIN = 0.5
const HORN_HZ = 520

export function createWingSound(): WingSound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let motorGain: GainNode | null = null
  let motorOscs: OscillatorNode[] = []
  let windGain: GainNode | null = null
  let windFilter: BiquadFilterNode | null = null
  let hornGain: GainNode | null = null
  let enabled = false
  let unlockArmed = false
  const counts: Record<WingSfx, number> = { launch: 0, touchdown: 0, bounce: 0, crash: 0, panic: 0 }

  const unlock = () => {
    if (ctx && enabled && ctx.state === 'suspended') void ctx.resume().catch(() => {})
  }
  const armUnlock = () => {
    if (unlockArmed || typeof window === 'undefined') return
    unlockArmed = true
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  const ensure = () => {
    if (ctx || typeof window === 'undefined') return
    const AC = window.AudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    lp.connect(master)
    motorGain = ctx.createGain()
    motorGain.gain.value = 0
    motorGain.connect(lp)
    motorOscs = [-9, 9].map((detune) => {
      const o = ctx!.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = MOTOR_IDLE_HZ
      o.detune.value = detune
      o.connect(motorGain!)
      o.start()
      return o
    })

    // Wind: one second of looped white noise through a bandpass.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    windFilter = ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 500
    windFilter.Q.value = 0.7
    windGain = ctx.createGain()
    windGain.gain.value = 0
    src.connect(windFilter)
    windFilter.connect(windGain)
    windGain.connect(master)
    src.start()

    const horn = ctx.createOscillator()
    horn.type = 'square'
    horn.frequency.value = HORN_HZ
    hornGain = ctx.createGain()
    hornGain.gain.value = 0
    horn.connect(hornGain)
    hornGain.connect(master)
    horn.start()
    armUnlock()
  }

  const blip = (type: OscillatorType, from: number, to: number, dur: number, peak: number, offset = 0) => {
    if (!ctx || !master || !enabled) return
    const t = ctx.currentTime + offset
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(from, t)
    o.frequency.linearRampToValueAtTime(to, t + dur * 0.7)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.015)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  let hornPhase = 0
  let lastT = 0

  return {
    counts,
    get enabled() {
      return enabled
    },
    setEnabled(on) {
      enabled = on
      if (on) {
        ensure()
        if (ctx) void ctx.resume().catch(() => {})
        armUnlock()
      } else if (ctx) {
        void ctx.suspend().catch(() => {})
      }
    },
    update(throttle, airspeed, stallWarn, alive) {
      if (!ctx || !enabled || !motorGain || !windGain || !windFilter || !hornGain) return
      const now = ctx.currentTime
      const thr = alive ? Math.min(1, Math.max(0, throttle)) : 0
      const hz = MOTOR_IDLE_HZ + MOTOR_RANGE_HZ * thr * (0.75 + Math.min(1, airspeed / 30) * 0.25)
      for (const o of motorOscs) o.frequency.setTargetAtTime(hz, now, 0.1)
      motorGain.gain.setTargetAtTime(thr > 0.02 ? MOTOR_GAIN * (0.35 + 0.65 * thr) : 0, now, 0.12)
      const w = alive ? Math.min(1, airspeed / 28) : 0
      windGain.gain.setTargetAtTime(WIND_GAIN * w * w, now, 0.2)
      windFilter.frequency.setTargetAtTime(350 + 900 * w, now, 0.2)
      // Horn pulses 4× a second while warning.
      hornPhase += Math.max(0, now - lastT)
      lastT = now
      const on = alive && stallWarn && Math.sin(hornPhase * Math.PI * 8) > 0
      hornGain.gain.setTargetAtTime(on ? 0.12 : 0, now, 0.01)
    },
    play(sfx) {
      counts[sfx]++
      switch (sfx) {
        case 'launch':
          blip('sawtooth', 200, 480, 0.35, 0.25)
          break
        case 'touchdown':
          blip('sine', 300, 220, 0.12, 0.35)
          blip('sine', 440, 660, 0.18, 0.3, 0.12)
          break
        case 'bounce':
          blip('triangle', 260, 180, 0.15, 0.45)
          break
        case 'crash':
          blip('sine', 130, 40, 0.4, 0.9)
          blip('square', 80, 45, 0.15, 0.4)
          break
        case 'panic':
          blip('square', 660, 880, 0.1, 0.25)
          blip('square', 660, 880, 0.1, 0.25, 0.13)
          break
      }
    },
  }
}
