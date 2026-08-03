import type { ComponentType } from 'react'
import LegoSwatTruck from './models/LegoSwatTruck'

/**
 * The Model Viewer's model catalog. Each entry is a user-provided
 * react-three-fiber component under `models/` — a venue-neutral group of
 * meshes (no Canvas, no lights; the stage owns those) that faces +Z and sits
 * on y=0. Adding a model = drop the component in `models/` and register it
 * here; the picker, persistence coercion and e2e `data-model` contract all
 * key off this list.
 *
 * This module is imported only by the lazy ModelViewerBody, so every model
 * rides the shared three/R3F chunk — never import it from eagerly-loaded
 * code (the shell, the widget catalog).
 */

/** Props every catalog model receives. `animate` gates its motion loop. */
export interface ModelComponentProps {
  animate: boolean
}

export const MODEL_IDS = ['legoSwatTruck'] as const
export type ModelId = (typeof MODEL_IDS)[number]

export interface ModelMeta {
  id: ModelId
  name: string
  Component: ComponentType<ModelComponentProps>
}

export const MODEL_CATALOG: ModelMeta[] = [
  { id: 'legoSwatTruck', name: 'SWAT Truck', Component: LegoSwatTruck },
]

export const modelById = Object.fromEntries(
  MODEL_CATALOG.map((m) => [m.id, m]),
) as Record<ModelId, ModelMeta>

export const coerceModelId = (v: unknown): ModelId | undefined =>
  typeof v === 'string' && (MODEL_IDS as readonly string[]).includes(v)
    ? (v as ModelId)
    : undefined
