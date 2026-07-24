/**
 * Synthesized Web Audio for the drone sim — no asset files. A pair of
 * detuned sawtooth oscillators through a lowpass is the rotor hum, pitched
 * by throttle/speed with `setTargetAtTime` glides; gates chime, crashes
 * thud, laps play a tiny jingle. Everything is capability-gated and
 * no-ops without an AudioContext (node, old browsers), and the context is
 * created lazily + resumed on the first user gesture (autoplay policy).
 */

export interface SoundEngine {
  setEnabled(on: boolean): void
  /** Per-tick rotor update: effort 0..1 pitches the hum; a dead/crashed
   * drone's rotors fall silent. */
  updateRotor(effort: number, alive: boolean): void
  gateChime(): void
  crashThud(): void
  lapJingle(): void
}

const ROTOR_BASE_HZ = 85
const ROTOR_RANGE = 1.0 // full effort doubles the pitch
const MASTER_GAIN = 0.12
const ROTOR_GAIN = 0.5

export function createSoundEngine(): SoundEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let rotorGain: GainNode | null = null
  let rotorOscs: OscillatorNode[] = []
  let enabled = false
  let unlockArmed = false

  const unlock = () => {
    if (ctx && enabled && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  }

  const armUnlock = () => {
    if (unlockArmed || typeof window === 'undefined') return
    unlockArmed = true
    // Browsers only allow audio after a gesture; any tap/key unlocks.
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
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.connect(master)
    rotorGain = ctx.createGain()
    rotorGain.gain.value = 0
    rotorGain.connect(filter)
    rotorOscs = [-7, 7].map((detune) => {
      const osc = ctx!.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = ROTOR_BASE_HZ
      osc.detune.value = detune
      osc.connect(rotorGain!)
      osc.start()
      return osc
    })
    armUnlock()
  }

  /** One enveloped tone — the building block for chimes/thuds/jingles. */
  const blip = (
    type: OscillatorType,
    freqFrom: number,
    freqTo: number,
    duration: number,
    peak: number,
    startOffset = 0,
  ) => {
    if (!ctx || !master || !enabled) return
    const t = ctx.currentTime + startOffset
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freqFrom, t)
    osc.frequency.linearRampToValueAtTime(freqTo, t + duration * 0.6)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.02)
    gain.gain.linearRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  return {
    setEnabled(on: boolean) {
      enabled = on
      if (on) {
        ensure()
        if (ctx) void ctx.resume().catch(() => {})
        armUnlock()
      } else if (ctx) {
        void ctx.suspend().catch(() => {})
      }
    },
    updateRotor(effort: number, alive: boolean) {
      if (!ctx || !enabled || !rotorGain) return
      const clamped = Math.min(1, Math.max(0, effort))
      const freq = ROTOR_BASE_HZ * (1 + ROTOR_RANGE * clamped)
      for (const osc of rotorOscs) {
        osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.12)
      }
      rotorGain.gain.setTargetAtTime(alive ? ROTOR_GAIN : 0, ctx.currentTime, 0.08)
    },
    gateChime() {
      blip('sine', 880, 1318, 0.22, 0.5)
    },
    crashThud() {
      blip('sine', 130, 42, 0.32, 0.9)
      blip('square', 70, 50, 0.12, 0.4)
    },
    lapJingle() {
      blip('sine', 660, 660, 0.14, 0.4, 0)
      blip('sine', 880, 880, 0.14, 0.4, 0.13)
      blip('sine', 1108, 1108, 0.22, 0.45, 0.26)
    },
  }
}
