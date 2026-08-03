// Gold Gunner's 3D figure viewer: the mesh-level model on the shared
// turntable stage. Thin by design — the model owns its look and moves; the
// stage owns canvas, lights and spin. Loaded only via lazy() from the avatar
// registry (never re-export from goldgunner/index.ts — three.js must stay out
// of the main chunk).
import FigureStage3D from '../shared/FigureStage3D'
import GoldGunnerModel3D from './GoldGunnerModel3D'

export default function GoldGunnerFigure3D({
  action,
  spinning = true,
}: {
  action?: string
  spinning?: boolean
}) {
  return (
    <FigureStage3D spin={spinning ? 0.45 : 0}>
      <GoldGunnerModel3D action={action} />
    </FigureStage3D>
  )
}
