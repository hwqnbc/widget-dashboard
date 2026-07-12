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
  fog: '#1a2247',
  ground: '#26352c',
  grid: '#3e5747',
  building: '#565f8c',
  pad: '#2f3d44',
  ring: '#ffca28',
}
