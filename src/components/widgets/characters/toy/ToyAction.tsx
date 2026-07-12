import type { AvatarActionProps } from '../../../../features/avatars/types'
import SixSevenFigure from './SixSevenFigure'

/**
 * The toy avatar's tap-toggled action: the "6 7". `active` starts/stops it; the
 * CSS keyframes toggle cleanly, so `animate` is unused here. Uniform
 * `AvatarActionProps` contract so the Avatar Actions widget can drive any avatar.
 */
export default function ToyAction({ active }: AvatarActionProps) {
  return <SixSevenFigure playing={active} />
}
