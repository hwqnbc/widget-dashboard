import { createContext, useContext } from 'react'

export interface FullscreenContextValue {
  /** id of the widget currently shown fullscreen, or null. */
  fullscreenId: string | null
  open: (id: string) => void
  close: () => void
  /** The overlay's body element while a widget is fullscreen, else null. The
   * board reparents the live widget's portal host into this element (instead
   * of remounting a fresh copy), so the running game/canvas is preserved. */
  overlayHost: HTMLElement | null
}

export const FullscreenContext = createContext<FullscreenContextValue>({
  fullscreenId: null,
  open: () => {},
  close: () => {},
  overlayHost: null,
})

export function useFullscreen(): FullscreenContextValue {
  return useContext(FullscreenContext)
}
