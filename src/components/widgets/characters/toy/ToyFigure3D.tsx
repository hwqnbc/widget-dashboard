// The toy avatar's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral ToyModel3D on the shared turntable stage. The stage owns the
// spin (faster while celebrating); the model owns the character animation.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// toy/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import ToyModel3D from './ToyModel3D'

export default function ToyFigure3D({ action }: { action?: string }) {
  return (
    <FigureStage3D spin={action ? 1.3 : 0.45}>
      <ToyModel3D action={action} />
    </FigureStage3D>
  )
}
