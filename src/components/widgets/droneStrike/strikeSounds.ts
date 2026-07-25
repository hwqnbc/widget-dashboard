/**
 * Drone Strike's synthesized effect palette (Web Audio, no asset files).
 * Each call is a no-op when audio is unavailable or the context is
 * suspended (see `../droneSim/webAudio`). Everything is short + percussive
 * so rapid auto-fire doesn't muddy into a drone.
 */
import { noise, tone } from '../droneSim/webAudio'
import type { TargetKind } from './waveLayout'

/** The distinct effects, mirrored by the widget's `data-sfx-*` counters. */
export type SfxKind = 'fire' | 'pop' | 'hit' | 'alert' | 'clear' | 'crash'

/** Bolt zap — a fast downward chirp. Pitched by the weapon cooldown: a
 * snappier weapon (short cooldown) chirps higher, a heavy one lower. */
export function playFire(cooldownS: number): void {
  const base = 900 - Math.min(520, cooldownS * 1700)
  tone({ freq: base, sweepTo: base * 0.45, dur: 0.12, type: 'square', gain: 0.16 })
}

/** Target destroyed — balloons burst airy, metal targets clank. */
export function playPop(kind: TargetKind): void {
  const metallic = kind === 'enemy' || kind === 'turret' || kind === 'ground'
  noise({ dur: 0.14, gain: 0.28, cutoff: metallic ? 2600 : 1400 })
  if (metallic) tone({ freq: 320, sweepTo: 140, dur: 0.14, type: 'triangle', gain: 0.14 })
}

/** Non-lethal hit on a multi-HP target — a tiny high tick. */
export function playHit(): void {
  tone({ freq: 1500, dur: 0.045, type: 'square', gain: 0.08 })
}

/** Incoming fire — a two-tone alert the frame an enemy/turret shoots. */
export function playAlert(): void {
  tone({ freq: 680, dur: 0.09, type: 'sawtooth', gain: 0.12 })
  tone({ freq: 520, dur: 0.12, type: 'sawtooth', gain: 0.12, delay: 0.1 })
}

/** Wave-clear sting — a short ascending arpeggio (C5-E5-G5-C6). */
export function playClear(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  for (let i = 0; i < notes.length; i++) {
    tone({ freq: notes[i], dur: 0.18, type: 'triangle', gain: 0.16, delay: i * 0.08 })
  }
}

/** Heavy damage — a wall crash or an enemy bolt connecting: a low thud. */
export function playCrash(): void {
  noise({ dur: 0.32, gain: 0.4, cutoff: 380 })
  tone({ freq: 120, sweepTo: 46, dur: 0.3, type: 'sine', gain: 0.2 })
}
