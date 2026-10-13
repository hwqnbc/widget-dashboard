/**
 * Puppy Rescue sound effects — synthesized on the shared Web Audio engine
 * (no asset files). Each call is fire-and-forget and silent until
 * `unlockAudio` has run from a gesture.
 */
import { noise, tone } from '../droneSim/webAudio'

/** A puppy freed: a happy two-note yip. */
export function playFreed(): void {
  tone({ freq: 880, dur: 0.09, type: 'triangle', gain: 0.25, sweepTo: 1200 })
  tone({ freq: 1100, dur: 0.12, type: 'triangle', gain: 0.25, sweepTo: 1500, delay: 0.1 })
}

/** The door unlocks (first puppy): a soft click-clunk. */
export function playDoor(): void {
  noise({ dur: 0.06, gain: 0.25, cutoff: 2500, delay: 0.22 })
  tone({ freq: 330, dur: 0.12, type: 'square', gain: 0.12, delay: 0.24 })
}

/** A catcher starts noticing: rising "huh?". */
export function playAlert(): void {
  tone({ freq: 420, dur: 0.18, type: 'sine', gain: 0.22, sweepTo: 700 })
}

/** Caught: a falling "wah-wah" and a net swish. */
export function playCaught(): void {
  noise({ dur: 0.18, gain: 0.3, cutoff: 1800 })
  tone({ freq: 520, dur: 0.22, type: 'sawtooth', gain: 0.16, sweepTo: 300, delay: 0.08 })
  tone({ freq: 380, dur: 0.32, type: 'sawtooth', gain: 0.16, sweepTo: 180, delay: 0.3 })
}

/** Escaped: a bright little arpeggio. */
export function playEscape(): void {
  ;[523, 659, 784, 1047].forEach((f, i) =>
    tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.22, delay: i * 0.09 }),
  )
}

/** The gold key picked up: a bright jingle. */
export function playKey(): void {
  tone({ freq: 1320, dur: 0.07, type: 'triangle', gain: 0.2 })
  tone({ freq: 1760, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.07 })
  tone({ freq: 2093, dur: 0.14, type: 'triangle', gain: 0.18, delay: 0.14 })
}

/** The padlock opens: a heavy clunk, then a happy crowd yip. */
export function playUnlock(): void {
  noise({ dur: 0.09, gain: 0.35, cutoff: 1400 })
  tone({ freq: 220, dur: 0.16, type: 'square', gain: 0.14, delay: 0.02 })
  ;[880, 990, 1175].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'triangle', gain: 0.18, delay: 0.2 + i * 0.07 }))
}

/** Settling into a bush: a soft leafy rustle. */
export function playRustle(): void {
  noise({ dur: 0.14, gain: 0.16, cutoff: 3200 })
  noise({ dur: 0.1, gain: 0.1, cutoff: 2400, delay: 0.09 })
}

/** A bark: a short gruff "woof" — a falling square tone over a noise puff. */
export function playBark(): void {
  noise({ dur: 0.08, gain: 0.25, cutoff: 900 })
  tone({ freq: 420, dur: 0.14, type: 'square', gain: 0.2, sweepTo: 180 })
  tone({ freq: 380, dur: 0.12, type: 'square', gain: 0.16, sweepTo: 170, delay: 0.17 })
}

/** Netted (Easy/Arcade): a net swish, then a sad little two-note whimper. */
export function playNet(): void {
  noise({ dur: 0.16, gain: 0.25, cutoff: 2200 })
  tone({ freq: 700, dur: 0.14, type: 'triangle', gain: 0.18, sweepTo: 520, delay: 0.12 })
  tone({ freq: 560, dur: 0.2, type: 'triangle', gain: 0.16, sweepTo: 400, delay: 0.27 })
}

/** Arcade: a chase begins — a sharp rising "!" sting. */
export function playChase(): void {
  tone({ freq: 520, dur: 0.08, type: 'square', gain: 0.16, sweepTo: 880 })
  tone({ freq: 880, dur: 0.16, type: 'square', gain: 0.16, sweepTo: 1320, delay: 0.09 })
}
