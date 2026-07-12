import SwordNinjaFigure from './SwordNinjaFigure'

/**
 * The ninja avatar's static full-body figure: the sword ninja standing with its
 * katana sheathed, no animation. A no-prop wrapper so the avatar registry can
 * expose a uniform `Figure` across avatars (mirrors the toy's `ToyFigure`).
 */
export default function NinjaFigure() {
  return <SwordNinjaFigure drawn={false} animate={false} />
}
