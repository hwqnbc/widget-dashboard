import { useEffect, useRef, type RefObject } from 'react'
import { Box, Tooltip } from '@mui/material'
import type MapView from '@arcgis/core/views/MapView'
import type { AnyView } from './MapPageBody'

const PLACEHOLDER = '—'

/** `lat, lon` at 5 decimals (~1 m) — the order people paste into things. */
function format(lat: string, lon: string): string {
  return `${lat}, ${lon}`
}

/**
 * Live coordinate chip over the map: tracks the pointer (rAF-throttled),
 * falls back to the view center on `stationary` (touch devices never hover),
 * click copies `lat, lon` with a brief "Copied" swap. Everything writes
 * straight to the DOM node — the zero-render input-path idiom (a re-render
 * per mousemove through React would be pure waste; and React re-creating
 * the node would wipe the DOM-held value). The view arrives as ref +
 * revision, never as a prop (lessons.md #67).
 */
export default function CoordinateReadout({
  viewRef,
  viewRevision,
}: {
  viewRef: RefObject<AnyView | null>
  viewRevision: number
}) {
  const chipRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void viewRevision // re-bind when the view is swapped (2D/3D toggle)
    const view = viewRef.current
    const chip = chipRef.current
    if (!view || view.destroyed || !chip) return

    const write = (lat: number | null | undefined, lon: number | null | undefined) => {
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return
      chip.dataset.lat = lat.toFixed(5)
      chip.dataset.lon = lon.toFixed(5)
      if (chip.dataset.copied !== 'yes') {
        chip.textContent = format(chip.dataset.lat, chip.dataset.lon)
      }
    }

    let rafPending = false
    const handles: { remove(): void }[] = []
    try {
      handles.push(
        (view as MapView).on('pointer-move', (event) => {
          if (rafPending) return
          rafPending = true
          requestAnimationFrame(() => {
            rafPending = false
            try {
              if (view.destroyed) return
              const mp = view.toMap({ x: event.x, y: event.y })
              write(mp?.latitude, mp?.longitude)
            } catch {
              /* view mid-teardown */
            }
          })
        }),
      )
      // Touch devices never hover: track the view center once the camera
      // rests (also provides the initial value when the view loads).
      handles.push(
        (view as MapView).watch('stationary', (stationary: boolean) => {
          if (!stationary) return
          try {
            if (view.ready) write(view.center?.latitude, view.center?.longitude)
          } catch {
            /* view mid-teardown */
          }
        }),
      )
    } catch {
      /* offline/broken view — the chip stays on the placeholder */
    }
    return () => {
      for (const h of handles) h.remove()
    }
  }, [viewRef, viewRevision])

  const copy = () => {
    const chip = chipRef.current
    if (!chip?.dataset.lat || !chip.dataset.lon) return
    try {
      void navigator.clipboard
        ?.writeText(format(chip.dataset.lat, chip.dataset.lon))
        .catch(() => {})
    } catch {
      /* clipboard unavailable — the chip still shows the value */
    }
    chip.textContent = 'Copied'
    chip.dataset.copied = 'yes'
    window.setTimeout(() => {
      delete chip.dataset.copied
      if (chip.dataset.lat && chip.dataset.lon) {
        chip.textContent = format(chip.dataset.lat, chip.dataset.lon)
      }
    }, 1000)
  }

  return (
    <Tooltip title="Copy coordinates">
      <Box
        onClick={copy}
        sx={{
          position: 'absolute',
          right: 8,
          bottom: 24, // clear of the attribution bar
          zIndex: 1,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'background.paper',
          opacity: 0.85,
          fontFamily: 'monospace',
          fontSize: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Box component="span" ref={chipRef} data-testid="map-coords">
          {PLACEHOLDER}
        </Box>
      </Box>
    </Tooltip>
  )
}
