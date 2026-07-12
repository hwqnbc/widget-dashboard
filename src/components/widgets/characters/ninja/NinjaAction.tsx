import type { AvatarActionProps } from '../../../../features/avatars/types'
import SwordNinjaFigure from './SwordNinjaFigure'

/**
 * The ninja avatar's tap-toggled action: draw / sheathe the katana. `active`
 * draws (and holds the guard); `animate` gates the swing so the initial sheathed
 * render snaps without flashing. Uniform `AvatarActionProps` contract.
 */
export default function NinjaAction({ active, animate }: AvatarActionProps) {
  return <SwordNinjaFigure drawn={active} animate={animate} />
}
