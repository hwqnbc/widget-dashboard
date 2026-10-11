/** Puppy Rescue's model inputs — animation state and coat colours (kept
 * out of the component file so fast refresh stays happy). */

/** Per-frame animation input, owned and written by the scene. */
export interface Anim {
  /** Ground speed (cells/s). */
  v: number
  /** Happy bounce (escaped) — 0 off. */
  hop: number
  /** Catcher only: 0..1 progress of the net swing (caught). */
  swing: number
}
export const newAnim = (): Anim => ({ v: 0, hop: 0, swing: 0 })

export interface Coat {
  body: string
  ears: string
  snout: string
}

export const HERO_COAT: Coat = { body: '#f2a541', ears: '#c8742a', snout: '#ffe2b8' }
/** Rescued puppies' coats, by cage index (cycled). */
export const PUP_COATS: Coat[] = [
  { body: '#f6f1ea', ears: '#2b2b33', snout: '#ffffff' },
  { body: '#e8b06a', ears: '#b9783a', snout: '#fbe3c2' },
  { body: '#f2b7c6', ears: '#d987a0', snout: '#fde2ea' },
  { body: '#3a3740', ears: '#1f1d24', snout: '#f2efe9' },
]

