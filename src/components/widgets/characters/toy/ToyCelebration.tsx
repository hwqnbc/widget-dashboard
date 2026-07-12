import SixSevenFigure from './SixSevenFigure'

/**
 * The toy avatar's looping victory "action": the "6 7" runs continuously.
 * Self-contained (no props) so the avatar registry can render it uniformly
 * alongside the other avatars' celebrations.
 */
export default function ToyCelebration() {
  return <SixSevenFigure playing />
}
