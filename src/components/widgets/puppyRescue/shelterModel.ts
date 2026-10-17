/**
 * Puppy Rescue — the shelter's bookkeeping (pure; no React, no three.js).
 * One shelter per mode: a level's puppies are ADOPTED into a mode's shelter
 * the first time each gets out of the door in that mode. The records slice
 * keeps a bitmask per record key (`pups`, bit = puppy index: cage i is bit
 * i, pen puppy j is bit cages + j); saves from before the shelter count a
 * ≥2★ escape (every puppy out) as the whole level adopted.
 */
import type { PuppyRescueRecords } from '../../../features/records/recordsSlice'
import { LEVELS, TIERS, recordKey } from './rescueLevels'
import { parseLevel, puppyCount, type Mode, type RescueState, type Tier } from './rescueModel'

let counts: number[] | null = null
/** Puppies per level (cages + pen), by level index. */
export const levelPuppyCounts = (): number[] => (counts ??= LEVELS.map((l) => puppyCount(parseLevel(l))))

export const fullMask = (n: number) => (n >= 31 ? 0x7fffffff : (1 << n) - 1)
export const popcount = (m: number) => {
  let c = 0
  for (let v = m; v; v &= v - 1) c++
  return c
}

/** The puppies an escape brought out (its line at the door). */
export const escapedMask = (s: RescueState) => s.order.reduce((m, i) => m | (1 << i), 0)

/** Level i's adopted puppies in `mode`'s shelter. */
export function adoptedMask(rec: PuppyRescueRecords, mode: Mode, i: number): number {
  const key = recordKey(mode, LEVELS[i].id)
  const full = fullMask(levelPuppyCounts()[i])
  if ((rec.stars[key] ?? 0) >= 2) return full
  return (rec.pups?.[key] ?? 0) & full
}

export interface ShelterLevel {
  /** Puppies in the level, adopted ones, and adopted-but-not-yet-seen. */
  n: number
  mask: number
  fresh: number
}
export interface ShelterSummary {
  mode: Mode
  total: number
  adopted: number
  fresh: number
  levels: ShelterLevel[]
  tiers: { tier: Tier; adopted: number; total: number }[]
}

export function shelterSummary(rec: PuppyRescueRecords, mode: Mode): ShelterSummary {
  const n = levelPuppyCounts()
  const levels = LEVELS.map((l, i) => {
    const mask = adoptedMask(rec, mode, i)
    const seen = rec.pupsSeen?.[recordKey(mode, l.id)] ?? 0
    return { n: n[i], mask, fresh: mask & ~seen }
  })
  const tiers = TIERS.map((tier) => {
    let adopted = 0
    let total = 0
    LEVELS.forEach((l, i) => {
      if (l.tier !== tier) return
      adopted += popcount(levels[i].mask)
      total += levels[i].n
    })
    return { tier, adopted, total }
  })
  return {
    mode,
    total: n.reduce((a, b) => a + b, 0),
    adopted: levels.reduce((a, l) => a + popcount(l.mask), 0),
    fresh: levels.reduce((a, l) => a + popcount(l.fresh), 0),
    levels,
    tiers,
  }
}

/** How many of an escape's puppies are NEW to the shelter. */
export function newlyAdopted(rec: PuppyRescueRecords, mode: Mode, i: number, escaped: number): number {
  return popcount(escaped & fullMask(levelPuppyCounts()[i]) & ~adoptedMask(rec, mode, i))
}
