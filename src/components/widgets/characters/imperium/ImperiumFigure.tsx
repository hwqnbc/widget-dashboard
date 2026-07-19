import ClawFigure from './ClawFigure'

/**
 * Imperium Claw General's static full-body figure: standing with the energy blade
 * held across the body, no animation. A no-prop wrapper so the avatar registry can
 * expose a uniform `Figure` across avatars.
 */
export default function ImperiumFigure() {
  return <ClawFigure slashing={false} />
}
