import ClawFigure from './ClawFigure'

/**
 * Imperium Claw General's looping victory action: a diagonal energy-blade slash
 * that pivots at the elbow (along the blade's own axis). Self-contained (no props)
 * to match the registry's celebration contract — the CSS keyframes loop cleanly.
 * Rendered by WinnerCelebration and played on tap by the Avatar Actions widget.
 */
export default function ImperiumCelebration() {
  return <ClawFigure slashing />
}
