import { createContext, useContext } from 'react'

export interface FullscreenContextValue {
  /** id of the widget currently shown fullscreen, or null. */
  fullscreenId: string | null
  open: (id: string) => void
  close: () => void
}

export const FullscreenContext = createContext<FullscreenContextValue>({
  fullscreenId: null,
  open: () => {},
  close: () => {},
})

export function useFullscreen(): FullscreenContextValue {
  return useContext(FullscreenContext)
}
