import JetBlastFigure from './JetBlastFigure'

/**
 * Jet Trooper's looping victory action: Jet & Blast — lift off on flaring
 * cyan jetpack exhaust, hover with a bob, fire two red pulses from the beam
 * weapon's lens dish, and settle back down. Self-contained (no props) to
 * match the registry's celebration contract — the CSS keyframes loop
 * cleanly. Rendered by WinnerCelebration and played on tap by the Avatar
 * Actions widget.
 */
export default function JetTrooperCelebration() {
  return <JetBlastFigure blasting />
}
