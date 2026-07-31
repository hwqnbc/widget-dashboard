// The fire ninja's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral FireNinjaModel3D on the shared turntable stage. The stage
// owns the spin; the model owns the character animation. The 'blaze' action
// stops the turntable (the stage eases back to face the camera) — the guard
// sweep is directional and a spinning figure hides the flaming blade behind
// the body for half of every turn.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// fireninja/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import FireNinjaModel3D from './FireNinjaModel3D'

export default function FireNinjaFigure3D({ action }: { action?: string }) {
  return (
    <FigureStage3D spin={action === 'blaze' ? 0 : 0.45}>
      <FireNinjaModel3D action={action} />
    </FigureStage3D>
  )
}
