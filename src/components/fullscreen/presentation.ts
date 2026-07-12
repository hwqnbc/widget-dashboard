import { createContext, useContext } from 'react'

/** How a widget is being presented. Widgets read this to adapt (e.g. a board
 * game relaxes its size cap when fullscreen). Default = normal in-grid render. */
export interface Presentation {
  fullscreen: boolean
}

export const PresentationContext = createContext<Presentation>({ fullscreen: false })

/**
 * Read the current presentation. Kept separate from `useViewport` so widgets that
 * only care whether they're fullscreen don't re-render on every resize.
 */
export function usePresentation(): Presentation {
  return useContext(PresentationContext)
}
