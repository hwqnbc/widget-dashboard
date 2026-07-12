/**
 * World colour palettes for the drone simulator, keyed off the MUI theme mode.
 * Kept in a plain module (no React/MUI imports) because the values must cross
 * into the R3F canvas, which is a separate React root that MUI context does
 * not reach — the widget resolves the palette outside and passes it as props.
 */
export interface WorldPalette {
  sky: string
  fog: string
  ground: string
  grid: string
  building: string
  pad: string
  ring: string
}

export const DAY_PALETTE: WorldPalette = {
  sky: '#8ec9ee',
  fog: '#a9d4ef',
  ground: '#79a86f',
  grid: '#65935c',
  building: '#b9c0cc',
  pad: '#455a64',
  ring: '#ffb300',
}

export const NIGHT_PALETTE: WorldPalette = {
  sky: '#0b1026',
  fog: '#141b3a',
  ground: '#1e2b24',
  grid: '#2d4136',
  building: '#3b4262',
  pad: '#263238',
  ring: '#ffca28',
}
