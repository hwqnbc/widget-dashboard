/**
 * Minimal Web Audio engine — synthesized effects, no asset files. Mirrors
 * `haptics.ts`: a thin wrapper that degrades to a silent no-op when the API
 * is missing (or the context can't start), so callers never check support.
 *
 * One shared AudioContext is created lazily and resumed from the first user
 * gesture (`unlockAudio`) — browsers block audio that starts without one.
 * Every voice routes through a master gain, so a future volume slider is a
 * one-liner. All voices are short + percussive; nothing is kept alive.
 */

type Ctor = new () => AudioContext

const AudioCtx: Ctor | undefined =
  typeof window !== 'undefined'
    ? ((window.AudioContext ??
        (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) as
        | Ctor
        | undefined)
    : undefined

export const audioSupported = !!AudioCtx

let ctx: AudioContext | null = null
let master: GainNode | null = null

function ensure(): AudioContext | null {
  if (!AudioCtx) return null
  if (!ctx) {
    try {
      ctx = new AudioCtx()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      ctx = null
      master = null
    }
  }
  return ctx
}

/** Create/resume the context — call from a user gesture (autoplay policy).
 * Idempotent: safe to call on every interaction until the context runs. */
export function unlockAudio(): void {
  const c = ensure()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

export interface ToneOpts {
  freq: number
  /** Seconds. */
  dur: number
  type?: OscillatorType
  /** Peak gain (0..1), before the master gain. */
  gain?: number
  /** Sweep the frequency to this value over the duration (a chirp). */
  sweepTo?: number
  /** Start delay in seconds — for arpeggios / layered stings. */
  delay?: number
}

/** One enveloped oscillator voice. No-op unless the context is running. */
export function tone(o: ToneOpts): void {
  const c = ensure()
  if (!c || !master || c.state !== 'running') return
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'square'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.sweepTo), t0 + o.dur)
  }
  const peak = o.gain ?? 0.3
  // Fast attack, exponential decay — a percussive blip.
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

export interface NoiseOpts {
  /** Seconds. */
  dur: number
  gain?: number
  /** Low-pass cutoff (Hz) — lower = duller thud, higher = crisper burst. */
  cutoff?: number
  delay?: number
}

/** A short filtered white-noise burst — pops, thuds. No-op unless running. */
export function noise(o: NoiseOpts): void {
  const c = ensure()
  if (!c || !master || c.state !== 'running') return
  const t0 = c.currentTime + (o.delay ?? 0)
  const frames = Math.max(1, Math.floor(c.sampleRate * o.dur))
  const buf = c.createBuffer(1, frames, c.sampleRate)
  const data = buf.getChannelData(0)
  // Decaying white noise (front-loaded) — no determinism needed here.
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  const peak = o.gain ?? 0.3
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(g)
  if (o.cutoff) {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = o.cutoff
    g.connect(lp).connect(master)
  } else {
    g.connect(master)
  }
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}
