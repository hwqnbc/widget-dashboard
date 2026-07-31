// The ninja avatar's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral NinjaModel3D on the shared turntable stage. The stage owns
// the spin; the model owns the character animation. The 'draw' action stops
// the turntable (the stage eases back to face the camera) — its
// choreography is directional and a spinning figure hides the blade behind
// the body for half of every turn.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// ninja/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import NinjaModel3D from './NinjaModel3D'

export default function NinjaFigure3D({ action }: { action?: string }) {
  const spin = action === 'draw' ? 0 : action === 'pump' ? 1.3 : 0.45
  return (
    <FigureStage3D spin={spin}>
      <NinjaModel3D action={action} />
    </FigureStage3D>
  )
}
