// The toy avatar's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral ToyModel3D on the shared turntable stage. The stage owns the
// spin; the model owns the character animation. The turntable is the USER'S
// toggle (`spinning`, uniform across every avatar viewer): on = the one
// 0.45 rad/s rate, off = ease back to face the camera.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// toy/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import ToyModel3D from './ToyModel3D'

export default function ToyFigure3D({ action, spinning = true }: { action?: string; spinning?: boolean }) {
  return (
    <FigureStage3D spin={spinning ? 0.45 : 0}>
      <ToyModel3D action={action} />
    </FigureStage3D>
  )
}
