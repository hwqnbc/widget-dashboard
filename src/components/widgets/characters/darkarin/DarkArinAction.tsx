import type { AvatarActionProps } from '../../../../features/avatars/types'
import TwinSwordFigure from './TwinSwordFigure'

/**
 * DarkArin's tap-toggled action: cross the two swords in front of the body into a
 * defensive X guard. `active` swings both arms in (and holds the cross); `animate`
 * gates the transition so the initial ready-stance render snaps without flashing.
 * Uniform `AvatarActionProps` contract.
 */
export default function DarkArinAction({ active, animate }: AvatarActionProps) {
  return <TwinSwordFigure crossed={active} animate={animate} />
}
