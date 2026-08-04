// Bazooka Joe's 3D figure viewer: the mesh-level model on the shared
// turntable stage. Thin by design — the model owns its look and moves; the
// stage owns canvas, lights and spin. Loaded only via lazy() from the avatar
// registry (never re-export from bazookajoe/index.ts — three.js must stay
// out of the main chunk).
import FigureStage3D from '../shared/FigureStage3D'
import BazookaJoeModel3D from './BazookaJoeModel3D'

export default function BazookaJoeFigure3D({
  action,
  spinning = true,
}: {
  action?: string
  spinning?: boolean
}) {
  return (
    <FigureStage3D spin={spinning ? 0.45 : 0}>
      <BazookaJoeModel3D action={action} />
    </FigureStage3D>
  )
}
