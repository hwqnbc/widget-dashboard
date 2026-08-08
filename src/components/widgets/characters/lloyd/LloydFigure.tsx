import ChopFigure from './ChopFigure'

/**
 * Lloyd's static full-body figure: standing with the golden scimitar at the
 * carry, no animation. A no-prop wrapper so the avatar registry can expose a
 * uniform `Figure` across avatars.
 */
export default function LloydFigure() {
  return <ChopFigure chopping={false} />
}
