import FrakFigure from './FrakFigure'

/**
 * frak's looping victory action: chopping up and down, alternating the two gold
 * swords. Self-contained (no props) to match the registry's celebration
 * contract — the CSS keyframes loop cleanly, so there's no mount-flash to gate.
 * Rendered by WinnerCelebration and played on tap by the Avatar Actions widget.
 */
export default function FrakCelebration() {
  return <FrakFigure chopping />
}
