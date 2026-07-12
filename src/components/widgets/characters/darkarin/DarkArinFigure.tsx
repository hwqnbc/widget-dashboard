import TwinSwordFigure from './TwinSwordFigure'

/**
 * DarkArin's static full-body figure: standing in the ready stance with both
 * swords held out, no animation. A no-prop wrapper so the avatar registry can
 * expose a uniform `Figure` across avatars.
 */
export default function DarkArinFigure() {
  return <TwinSwordFigure crossed={false} animate={false} />
}
