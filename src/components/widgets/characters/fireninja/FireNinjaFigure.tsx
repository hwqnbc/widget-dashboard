import FireBladeFigure from './FireBladeFigure'

/**
 * The fire ninja avatar's static full-body figure: standing at the ready holding
 * the bare sword handle, no fire, no animation. A no-prop wrapper so the avatar
 * registry can expose a uniform `Figure` across avatars (mirrors NinjaFigure).
 */
export default function FireNinjaFigure() {
  return <FireBladeFigure lit={false} animate={false} />
}
