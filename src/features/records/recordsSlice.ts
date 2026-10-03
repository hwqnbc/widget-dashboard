/**
 * App-level game records — bests, stars, solve tallies — persisted as their
 * OWN whitelisted slice so they outlive any widget instance: records in a
 * widget's per-instance `data` die with `removeWidget`, which is exactly
 * what a "my best score" must not do.
 *
 * State is namespaced per game. The record POLICY lives in the reducers,
 * pure: the widget reports what happened, the slice decides what it's
 * worth (minima for times, maxima for scores/waves, adds for tallies).
 *
 * autoMergeLevel1 caveat: being a NEW top-level slice only dodged the
 * missing-key trap for the FIRST stored shape. Once `records` exists in
 * storage (it shipped as `{carPark}`), a namespace added LATER rehydrates
 * as undefined — the stored slice replaces `initialState` wholesale. So
 * every reducer goes through `ensure()` and every read goes through the
 * fallback selectors below; neither trusts a namespace to exist.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type MazeBestSize = 'small' | 'medium' | 'large'

export interface CarParkRecords {
  /** Fewest moves per level, keyed `"tier:index"` — only CLEAN (hint-free)
   * solves set it; a solve at or under par is what the UI stars. */
  best: Record<string, number>
  /** Lifetime solve tally, repeats included. */
  solved: number
  /** Levels first solved WITH hints — ✓ but never ★ until a clean solve
   * lands a best. Never cleared by a later clean solve; the progress math
   * treats best-or-assisted as solved. */
  assisted: Record<string, true>
}

/** Best time in ms per maze size — 0 means none yet, lower is better. */
export interface MazeRecords {
  best: Record<MazeBestSize, number>
}
/** Lifetime Arrow Escape clears. */
export interface ArrowsRecords {
  solved: number
}
/** Drone Sim's lifetime landing-challenge best (the per-course lap best and
 * ghost stay in widget data: they are working state, wiped by design on
 * every course change, and the unbounded ghost path has no business being
 * re-serialized with every record write). */
export interface DroneSimRecords {
  landingBest: number
}
export interface DroneStrikeRecords {
  bestWave: number
  bestScore: number
}
/** `bestScore` is shared by both battle modes (a roam clear raises it too);
 * `bestRoamMs` is min-nonzero, `bestWave` waves-mode only. */
export interface TankBattleRecords {
  bestWave: number
  bestScore: number
  bestRoamMs: number
}

export interface RecordsState {
  carPark: CarParkRecords
  maze: MazeRecords
  arrows: ArrowsRecords
  droneSim: DroneSimRecords
  droneStrike: DroneStrikeRecords
  tankBattle: TankBattleRecords
}

const emptyCarPark = (): CarParkRecords => ({ best: {}, solved: 0, assisted: {} })
const emptyMaze = (): MazeRecords => ({ best: { small: 0, medium: 0, large: 0 } })
const emptyArrows = (): ArrowsRecords => ({ solved: 0 })
const emptyDroneSim = (): DroneSimRecords => ({ landingBest: 0 })
const emptyDroneStrike = (): DroneStrikeRecords => ({ bestWave: 0, bestScore: 0 })
const emptyTankBattle = (): TankBattleRecords => ({ bestWave: 0, bestScore: 0, bestRoamMs: 0 })

const EMPTIES = {
  carPark: emptyCarPark,
  maze: emptyMaze,
  arrows: emptyArrows,
  droneSim: emptyDroneSim,
  droneStrike: emptyDroneStrike,
  tankBattle: emptyTankBattle,
}
export type GameKey = keyof typeof EMPTIES

/** Rehydration may hand us a `records` stored before a namespace existed —
 * fill it in before any reducer touches it (see the header comment). */
function ensure<K extends GameKey>(state: RecordsState, game: K): RecordsState[K] {
  if (!state[game]) state[game] = EMPTIES[game]() as RecordsState[K]
  return state[game]
}

const initialState: RecordsState = {
  carPark: emptyCarPark(),
  maze: emptyMaze(),
  arrows: emptyArrows(),
  droneSim: emptyDroneSim(),
  droneStrike: emptyDroneStrike(),
  tankBattle: emptyTankBattle(),
}

/** A finite number or the fallback — rehydrated namespaces and absorb
 * payloads are outside our control. */
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
/** Lower-is-better merge where 0 means "none yet". */
const minNonzero = (a: number, b: number): number =>
  a === 0 ? b : b === 0 ? a : Math.min(a, b)

const recordsSlice = createSlice({
  name: 'records',
  initialState,
  reducers: {
    /**
     * A finished Car Park level. One action carries the whole outcome, so
     * the win is recorded atomically however many widgets are mounted; the
     * reload-safety that used to ride "win + move log in one dispatch"
     * now rests on redux-persist snapshotting the root AFTER the widget's
     * same-handler `moves` dispatch — both land in one debounced write.
     */
    recordCarParkSolve(
      state,
      action: PayloadAction<{ key: string; moves: number; hinted: boolean }>,
    ) {
      const { key, moves, hinted } = action.payload
      const cp = ensure(state, 'carPark')
      cp.solved += 1
      const existing = cp.best[key]
      if (hinted) {
        if (existing === undefined) cp.assisted[key] = true
      } else if (existing === undefined || moves < existing) {
        cp.best[key] = moves
      }
    },
    /**
     * One-time migration: absorb records a widget instance still carries in
     * its persisted `data` (the pre-slice home). Merging is monotone — min
     * per best, union of assisted, tallies added — so several old instances
     * each absorbing once compose correctly, and an accidental double
     * absorb of bests/assisted is harmless (the widget zeroes its copy
     * right after, which is what keeps `solved` from double-counting).
     */
    absorbCarParkRecords(
      state,
      action: PayloadAction<{
        best: Record<string, number>
        solved: number
        assisted: Record<string, true>
      }>,
    ) {
      const { best, solved, assisted } = action.payload
      const cp = ensure(state, 'carPark')
      for (const [key, moves] of Object.entries(best)) {
        if (typeof moves !== 'number' || !Number.isFinite(moves)) continue
        const existing = cp.best[key]
        if (existing === undefined || moves < existing) cp.best[key] = moves
      }
      for (const key of Object.keys(assisted)) cp.assisted[key] = true
      if (Number.isFinite(solved) && solved > 0) cp.solved += Math.floor(solved)
    },
    /** The reset-records button: every best, star and tally, gone. */
    resetCarParkRecords(state) {
      state.carPark = emptyCarPark()
    },

    /** A finished maze: best time per size, lower wins, 0 means none. */
    recordMazeBest(state, action: PayloadAction<{ size: MazeBestSize; ms: number }>) {
      const { size, ms } = action.payload
      if (!Number.isFinite(ms) || ms <= 0) return
      const m = ensure(state, 'maze')
      m.best[size] = minNonzero(m.best[size] ?? 0, Math.round(ms))
    },
    /** An Arrow Escape board fully cleared. */
    recordArrowsClear(state) {
      ensure(state, 'arrows').solved += 1
    },
    /** A scored drone landing — lifetime max. */
    recordLanding(state, action: PayloadAction<{ score: number }>) {
      const d = ensure(state, 'droneSim')
      d.landingBest = Math.max(d.landingBest, num(action.payload.score))
    },
    /** A Drone Strike wave cleared — two independent maxima. */
    recordStrikeWave(state, action: PayloadAction<{ wave: number; score: number }>) {
      const d = ensure(state, 'droneStrike')
      d.bestWave = Math.max(d.bestWave, num(action.payload.wave))
      d.bestScore = Math.max(d.bestScore, num(action.payload.score))
    },
    /** A Tank Battle clear: score always competes; wave only from waves
     * mode, roam time only from a roam clear. */
    recordTankClear(
      state,
      action: PayloadAction<{ score: number; wave?: number; roamMs?: number }>,
    ) {
      const t = ensure(state, 'tankBattle')
      t.bestScore = Math.max(t.bestScore, num(action.payload.score))
      if (action.payload.wave !== undefined) t.bestWave = Math.max(t.bestWave, num(action.payload.wave))
      if (action.payload.roamMs !== undefined && num(action.payload.roamMs) > 0)
        t.bestRoamMs = minNonzero(t.bestRoamMs, Math.round(num(action.payload.roamMs)))
    },

    /* One-time migrations from pre-slice widget data — same contract as
     * absorbCarParkRecords: monotone merges so several old instances
     * compose; only the arrows TALLY is additive, which is why the widget
     * zeroes its copy right after (and latches against StrictMode). */
    absorbMazeRecords(
      state,
      action: PayloadAction<{ small: number; medium: number; large: number }>,
    ) {
      const m = ensure(state, 'maze')
      for (const size of ['small', 'medium', 'large'] as const) {
        const ms = num(action.payload[size])
        if (ms > 0) m.best[size] = minNonzero(m.best[size] ?? 0, Math.round(ms))
      }
    },
    absorbArrowsRecords(state, action: PayloadAction<{ solved: number }>) {
      const s = num(action.payload.solved)
      if (s > 0) ensure(state, 'arrows').solved += Math.floor(s)
    },
    absorbDroneSimRecords(state, action: PayloadAction<{ landingBest: number }>) {
      const d = ensure(state, 'droneSim')
      d.landingBest = Math.max(d.landingBest, num(action.payload.landingBest))
    },
    absorbDroneStrikeRecords(
      state,
      action: PayloadAction<{ bestWave: number; bestScore: number }>,
    ) {
      const d = ensure(state, 'droneStrike')
      d.bestWave = Math.max(d.bestWave, num(action.payload.bestWave))
      d.bestScore = Math.max(d.bestScore, num(action.payload.bestScore))
    },
    absorbTankBattleRecords(
      state,
      action: PayloadAction<{ bestWave: number; bestScore: number; bestRoamMs: number }>,
    ) {
      const t = ensure(state, 'tankBattle')
      t.bestWave = Math.max(t.bestWave, num(action.payload.bestWave))
      t.bestScore = Math.max(t.bestScore, num(action.payload.bestScore))
      const roam = num(action.payload.bestRoamMs)
      if (roam > 0) t.bestRoamMs = minNonzero(t.bestRoamMs, Math.round(roam))
    },

    /** The per-game reset-records control. (Car Park keeps its original
     * dedicated action; this covers the rest and would cover it too.) */
    resetGameRecords(state, action: PayloadAction<GameKey>) {
      const game = action.payload
      ;(state[game] as RecordsState[GameKey]) = EMPTIES[game]()
    },
  },
})

export const {
  recordCarParkSolve,
  absorbCarParkRecords,
  resetCarParkRecords,
  recordMazeBest,
  recordArrowsClear,
  recordLanding,
  recordStrikeWave,
  recordTankClear,
  absorbMazeRecords,
  absorbArrowsRecords,
  absorbDroneSimRecords,
  absorbDroneStrikeRecords,
  absorbTankBattleRecords,
  resetGameRecords,
} = recordsSlice.actions
export default recordsSlice.reducer

/* Fallback selectors — the ONLY way reads should reach this slice: a
 * namespace added after the slice first hit a device's storage rehydrates
 * as undefined (see the header comment), so every selector falls back to
 * the empty shape. The empties are module constants, not fresh objects, so
 * useSelector identity stays stable. */
const FALLBACK_MAZE = emptyMaze()
const FALLBACK_ARROWS = emptyArrows()
const FALLBACK_DRONESIM = emptyDroneSim()
const FALLBACK_DRONESTRIKE = emptyDroneStrike()
const FALLBACK_TANK = emptyTankBattle()
const FALLBACK_CARPARK = emptyCarPark()

interface WithRecords {
  records: RecordsState
}
export const selectCarParkRecords = (s: WithRecords): CarParkRecords =>
  s.records.carPark ?? FALLBACK_CARPARK
export const selectMazeRecords = (s: WithRecords): MazeRecords => s.records.maze ?? FALLBACK_MAZE
export const selectArrowsRecords = (s: WithRecords): ArrowsRecords =>
  s.records.arrows ?? FALLBACK_ARROWS
export const selectDroneSimRecords = (s: WithRecords): DroneSimRecords =>
  s.records.droneSim ?? FALLBACK_DRONESIM
export const selectDroneStrikeRecords = (s: WithRecords): DroneStrikeRecords =>
  s.records.droneStrike ?? FALLBACK_DRONESTRIKE
export const selectTankBattleRecords = (s: WithRecords): TankBattleRecords =>
  s.records.tankBattle ?? FALLBACK_TANK
