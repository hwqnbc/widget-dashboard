/**
 * Pure state machine for drag-to-move waypoints — no ArcGIS imports, so the
 * e2e harness bundles it (e2e/run.mjs) and unit-tests the event-ordering
 * edge cases offline.
 *
 * Why it exists: the view's `pointer-up` can outrace the synthesized drag
 * `end` event. The first shipped version cleared the armed index on
 * pointer-up unconditionally, so when pointer-up won the race the commit
 * never ran — the marker moved visually but the route never re-fetched
 * (lessons.md #71). The rules encoded here:
 *  - pointer-down disarms synchronously (a stale index from a lost gesture
 *    must never leak into the next one); the async hitTest re-arms.
 *  - drag steps mark the gesture active and remember the last good map
 *    position (toMap can return null over the sky in 3D).
 *  - the END step owns the commit — at the release position, falling back
 *    to the last known position.
 *  - pointer-up only disarms an INACTIVE gesture (a plain click); an active
 *    drag's state is left for the end step, whichever order events arrive.
 */
import type { LonLat } from './routeGeometry'

export interface DragState {
  /** Waypoint index grabbed by the current gesture, null when disarmed. */
  index: number | null
  /** True once drag steps have been seen for the armed index. */
  active: boolean
  /** Last valid map position seen during the drag. */
  pos: LonLat | null
}

export function createDragState(): DragState {
  return { index: null, active: false, pos: null }
}

/** A new gesture begins: disarm whatever a lost gesture left behind. */
export function dragPointerDown(s: DragState): void {
  s.index = null
  s.active = false
  s.pos = null
}

/** The pointer-down hitTest resolved: arm (or explicitly disarm). */
export function armDrag(s: DragState, index: number | null): void {
  s.index = index
}

/**
 * One drag event. Returns the move to commit when the gesture releases,
 * else null. Callers stopPropagation + live-move the marker whenever the
 * state is armed.
 */
export function dragStep(
  s: DragState,
  action: 'start' | 'update' | 'end',
  p: LonLat | null,
): { index: number; pos: LonLat } | null {
  if (s.index == null) return null
  if (action === 'end') {
    const index = s.index
    const pos = p ?? s.pos
    s.index = null
    s.active = false
    s.pos = null
    return pos ? { index, pos } : null
  }
  s.active = true
  if (p) s.pos = p
  return null
}

/** Release seen by pointer-up: only a click (never-active gesture) disarms
 * here — an active drag's commit belongs to dragStep('end'), which may
 * arrive after pointer-up. */
export function dragPointerUp(s: DragState): void {
  if (!s.active) {
    s.index = null
    s.pos = null
  }
}
