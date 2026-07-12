import type { AvatarActionProps } from '../../../../features/avatars/types'
import FireBladeFigure from './FireBladeFigure'

/**
 * The fire ninja avatar's tap-toggled action: ignite / extinguish the fire
 * blade. `active` shoots the flame blade out of the hilt (and holds it,
 * flickering); `animate` gates the ignite so the initial bare-handle render
 * snaps without flashing. Uniform `AvatarActionProps` contract.
 */
export default function FireNinjaAction({ active, animate }: AvatarActionProps) {
  return <FireBladeFigure lit={active} animate={animate} />
}
