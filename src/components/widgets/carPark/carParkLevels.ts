/**
 * The Car Park level pack — FIXED, numbered, and APPEND-ONLY.
 *
 * A level's identity is `tier:index`, and players' bests key on it, so never
 * reorder or delete — add new levels to the END of a tier's list. Generate
 * candidates with `node scripts/gen-carpark-levels.mjs`; every entry's `par`
 * (optimal move count, one slide of any length = one move) is re-derived by
 * BFS in the e2e sweep, which also checks it sits inside its tier's band.
 */

export const TIERS = ['beginner', 'intermediate', 'advanced', 'expert'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABEL: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

/** Inclusive par band per tier — what makes a tier honest. */
export const TIER_BANDS: Record<Tier, readonly [number, number]> = {
  beginner: [3, 8],
  intermediate: [10, 17],
  advanced: [19, 27],
  expert: [30, 60],
}

export interface Level {
  /** 36-char row-major board (see `carParkModel`). */
  board: string
  /** Optimal move count. */
  par: number
}

export const LEVELS: Record<Tier, readonly Level[]> = {
  beginner: [],
  intermediate: [],
  advanced: [],
  expert: [],
}
