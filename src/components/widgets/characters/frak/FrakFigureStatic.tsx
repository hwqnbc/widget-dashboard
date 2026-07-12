import FrakFigure from './FrakFigure'

/**
 * frak's static full-body figure: the ready stance with one gold blade raised
 * and one lowered, no animation. A no-prop wrapper so the avatar registry can
 * expose a uniform `Figure` across avatars.
 */
export default function FrakFigureStatic() {
  return <FrakFigure chopping={false} />
}
