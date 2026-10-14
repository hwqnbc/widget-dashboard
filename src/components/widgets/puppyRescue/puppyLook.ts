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
  /** Ears and tail. */
  ears: string
  snout: string
  /** Optional markings (each drawn only when set): lower-leg socks, a belly
   * stripe, a face mask, spots, eyebrow dots, an eye colour — and, for the
   * fixed top-down camera, a back saddle + head cap and a tail tip. */
  saddle?: string
  tailTip?: string
  paws?: string
  belly?: string
  mask?: string
  spots?: string
  brows?: string
  eyes?: string
}

export const HERO_COAT: Coat = { body: '#f2a541', ears: '#c8742a', snout: '#ffe2b8' }

/** The hero dogs you can pick (⚙ → Dog). Ginger is the original. */
export type DogId = 'ginger' | 'golden' | 'dalmatian' | 'husky' | 'blacktan' | 'chocolate'
export interface DogLook {
  id: DogId
  name: string
  coat: Coat
}
export const DOGS: readonly DogLook[] = [
  { id: 'ginger', name: 'Ginger', coat: HERO_COAT },
  { id: 'golden', name: 'Golden', coat: { body: '#f0c46a', ears: '#d79a3c', snout: '#fbe6b4' } },
  { id: 'dalmatian', name: 'Dalmatian', coat: { body: '#f7f5f0', ears: '#222026', snout: '#ffffff', spots: '#222026' } },
  {
    id: 'husky',
    name: 'Husky',
    coat: { body: '#eef0f3', saddle: '#7c8592', ears: '#5e6672', snout: '#ffffff', tailTip: '#ffffff', eyes: '#3d9bff' },
  },
  {
    id: 'blacktan',
    name: 'Black & Tan',
    coat: { body: '#2a2730', ears: '#1a181e', snout: '#c98a4b', paws: '#c98a4b', brows: '#c98a4b', tailTip: '#c98a4b' },
  },
  { id: 'chocolate', name: 'Chocolate', coat: { body: '#6b3f26', ears: '#4e2c1a', snout: '#8a5638' } },
]
export const DEFAULT_DOG: DogId = 'ginger'
export const dogById = Object.fromEntries(DOGS.map((d) => [d.id, d])) as Record<DogId, DogLook>
export const coerceDog = (v: unknown): DogId | undefined =>
  typeof v === 'string' && v in dogById ? (v as DogId) : undefined
/** Rescued puppies' coats, by cage index (cycled). */
export const PUP_COATS: Coat[] = [
  { body: '#f6f1ea', ears: '#2b2b33', snout: '#ffffff' },
  { body: '#e8b06a', ears: '#b9783a', snout: '#fbe3c2' },
  { body: '#f2b7c6', ears: '#d987a0', snout: '#fde2ea' },
  { body: '#3a3740', ears: '#1f1d24', snout: '#f2efe9' },
]

