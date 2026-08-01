// The frak avatar's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral FrakModel3D on the shared turntable stage. The stage owns
// the spin; the model owns the character animation. The turntable is the
// USER'S toggle (`spinning`, uniform across every avatar viewer): on = the
// one 0.45 rad/s rate, off = ease back to face the camera — tap off to
// watch the Blade Flurry's alternating chops face-on.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// frak/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import FrakModel3D from './FrakModel3D'

export default function FrakFigure3D({ action, spinning = true }: { action?: string; spinning?: boolean }) {
  return (
    <FigureStage3D spin={spinning ? 0.45 : 0}>
      <FrakModel3D action={action} />
    </FigureStage3D>
  )
}
