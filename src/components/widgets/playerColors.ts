import { TOY } from './characters/toyPalette'
import { N } from './characters/ninjaPalette'

/** Per-player brand colour, shared by the games (turn banner, Memory badges,
 * winning-line glow all key off these). */
export const PLAYER_COLOR: Record<'toy' | 'ninja', string> = {
  toy: TOY.teal,
  ninja: N.iceDeep,
}
