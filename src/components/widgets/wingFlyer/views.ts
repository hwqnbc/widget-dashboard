import type { AirframeId } from './airframes'

/** Wing Flyer camera views: the horizon-stabilised chase cam, or the nose
 * (FPV) camera. (The pilot's line-of-sight view is backlog.) */
export type WingView = 'chase' | 'fpv'

export const coerceView = (v: unknown): WingView | undefined => (v === 'chase' || v === 'fpv' ? v : undefined)

/** Each plane's natural camera (docs/wing-flyer.md §3). */
export const DEFAULT_VIEW: Record<AirframeId, WingView> = { trainer: 'chase', wing: 'fpv' }
