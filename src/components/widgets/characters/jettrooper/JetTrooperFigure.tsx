import JetBlastFigure from './JetBlastFigure'

/**
 * Jet Trooper's static full-body figure: standing with the beam weapon at
 * the carry, jetpack quiet. A no-prop wrapper so the avatar registry can
 * expose a uniform `Figure` across avatars.
 */
export default function JetTrooperFigure() {
  return <JetBlastFigure blasting={false} />
}
