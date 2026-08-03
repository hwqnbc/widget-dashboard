import { useRef } from 'react'
import { Box, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useAppDispatch } from '../../../app/hooks'
import { updateWidgetData } from '../../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../../registry/widgetRegistry'
import { MODEL_CATALOG, modelById, coerceModelId } from './modelCatalog'
import type { ModelId } from './modelCatalog'
import ModelViewerStage from './ModelViewerStage'

/**
 * Model Viewer body (the lazy chunk entry): a picker over the model catalog,
 * an Animate toggle (the model's own motion, e.g. the truck's wheels) and an
 * Auto-rotate toggle (the camera orbiting the model), all persisted
 * per-widget-instance. Orbit gestures (drag/zoom/pan) live on the canvas, so
 * the whole root opts out of grid dragging.
 */
export default function ModelViewerBody({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const model = useWidgetField<ModelId>(id, 'model', 'legoSwatTruck', coerceModelId)
  const animate = useWidgetField<boolean>(id, 'animate', true)
  const autoRotate = useWidgetField<boolean>(id, 'autoRotate', false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const { Component: Model } = modelById[model]

  const selectModel = (next: ModelId | null) => {
    if (!next || next === model) return
    dispatch(updateWidgetData({ id, data: { model: next } }))
  }
  const toggleAnimate = () => dispatch(updateWidgetData({ id, data: { animate: !animate } }))
  const toggleAutoRotate = () =>
    dispatch(updateWidgetData({ id, data: { autoRotate: !autoRotate } }))

  return (
    <Box
      ref={rootRef}
      className="widget-no-drag"
      data-testid="model-viewer"
      data-model={model}
      data-animate={animate ? 'on' : 'off'}
      data-autorotate={autoRotate ? 'on' : 'off'}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 0.5,
      }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 0.5,
          columnGap: 1,
        }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={model}
          onChange={(_, v) => selectModel(v as ModelId | null)}
          data-testid="model-viewer-picker"
          aria-label="Model"
          sx={{ flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {MODEL_CATALOG.map((m) => (
            <ToggleButton key={m.id} value={m.id} sx={{ textTransform: 'none', py: 0.3, px: 1 }}>
              {m.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" aria-label="View options">
          <ToggleButton
            value="animate"
            selected={animate}
            onChange={toggleAnimate}
            data-testid="model-viewer-animate"
            sx={{ textTransform: 'none', py: 0.3, px: 1 }}
          >
            Animate
          </ToggleButton>
          <ToggleButton
            value="autoRotate"
            selected={autoRotate}
            onChange={toggleAutoRotate}
            data-testid="model-viewer-autorotate"
            sx={{ textTransform: 'none', py: 0.3, px: 1 }}
          >
            Auto-rotate
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Bounded canvas region: relative flex-fill box + absolute inset child,
       * so the canvas can never spill the card (lessons #3/#4). */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Box sx={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
          <ModelViewerStage autoRotate={autoRotate} probeRef={rootRef}>
            <Model animate={animate} />
          </ModelViewerStage>
        </Box>
      </Box>
    </Box>
  )
}
