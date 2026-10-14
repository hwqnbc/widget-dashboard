/**
 * Puppy Rescue colour themes — the floor, the space around the maze and the
 * control strip / tip banner (plus two derived tints: the pen's floor patch
 * and the soft side light). Picked so everything that matters still reads
 * on every floor: the pink/red cones, white walls, green bushes and door,
 * the orange dog and the dark catchers (docs/puppy-rescue.md *Themes*).
 * Pure data — shared by the widget and the lazy 3D view.
 */
export type ThemeId = 'sunshine' | 'toybox' | 'ocean' | 'night' | 'sandbox'

export interface PuppyTheme {
  id: ThemeId
  name: string
  /** Maze floor. */
  floor: string
  /** The space around the maze (canvas clear colour + stage background). */
  surround: string
  /** Control strip + tip banner (a deep shade of the floor), and the Bark
   * button's inner disc a step lighter. */
  strip: string
  strip2: string
  /** The open pen's floor patch (a lighter floor). */
  pen: string
  /** The soft side light's tint. */
  rim: string
  /** The movement stick's knob (a bright accent that reads on the strip). */
  knob: string
}

export const THEMES: readonly PuppyTheme[] = [
  { id: 'sunshine', name: 'Sunshine', floor: '#4a6fe3', surround: '#ffe066', strip: '#22357f', strip2: '#2f45a0', pen: '#8fa6f0', rim: '#fff1b8', knob: '#ffd54a' },
  { id: 'toybox', name: 'Toybox', floor: '#7b6cf2', surround: '#48d3f2', strip: '#2a2554', strip2: '#3b3470', pen: '#9a86ff', rim: '#bfe8ff', knob: '#8f7cf7' },
  { id: 'ocean', name: 'Ocean', floor: '#2f6fd6', surround: '#9be7ff', strip: '#173a73', strip2: '#22508f', pen: '#6f9be6', rim: '#d4f5ff', knob: '#5aa9ff' },
  { id: 'night', name: 'Night Watch', floor: '#3b3a6b', surround: '#141a33', strip: '#0d1126', strip2: '#1c2340', pen: '#5d5ba0', rim: '#7a86c9', knob: '#8b89d6' },
  { id: 'sandbox', name: 'Sandbox', floor: '#c9a36a', surround: '#87ceeb', strip: '#5c4322', strip2: '#77593a', pen: '#dcbf8e', rim: '#cfeefa', knob: '#e2c08a' },
]

export const DEFAULT_THEME: ThemeId = 'sunshine'
export const themeById = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, PuppyTheme>
export const coerceTheme = (v: unknown): ThemeId | undefined =>
  typeof v === 'string' && v in themeById ? (v as ThemeId) : undefined
