import ChopFigure from './ChopFigure'

/**
 * Lloyd's looping victory action: the overhead golden-sword chop — wind up
 * to face height, whip down through a wide slash with a gold impact flash,
 * ease back to the carry — while the dragon wings flap in sync (up through
 * the wind-up, snapping down on the slash). Self-contained (no props) to
 * match the registry's
 * celebration contract — the CSS keyframes loop cleanly. Rendered by
 * WinnerCelebration and played on tap by the Avatar Actions widget.
 */
export default function LloydCelebration() {
  return <ChopFigure chopping />
}
