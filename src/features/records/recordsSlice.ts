/**
 * App-level game records — bests, stars, solve tallies — persisted as their
 * OWN whitelisted slice so they outlive any widget instance: records in a
 * widget's per-instance `data` die with `removeWidget`, which is exactly
 * what a "my best score" must not do. A top-level slice (rather than new
 * fields on an existing one) also sidesteps redux-persist's autoMergeLevel1
 * trap: a slice key missing from storage falls back to `initialState`
 * wholesale, while a new FIELD inside a stored slice would come back
 * undefined.
 *
 * State is namespaced per game so other widgets' bests (maze, drone, tank)
 * can migrate here later without reshaping what's stored. The solve POLICY
 * lives in the reducers, pure: the widget reports what happened, the slice
 * decides what it's worth.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

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

export interface RecordsState {
  carPark: CarParkRecords
}

const emptyCarPark = (): CarParkRecords => ({ best: {}, solved: 0, assisted: {} })

const initialState: RecordsState = { carPark: emptyCarPark() }

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
      const cp = state.carPark
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
      const cp = state.carPark
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
  },
})

export const { recordCarParkSolve, absorbCarParkRecords, resetCarParkRecords } =
  recordsSlice.actions
export default recordsSlice.reducer
