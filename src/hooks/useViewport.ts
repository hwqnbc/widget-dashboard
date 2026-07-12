import { useEffect, useState } from 'react'

export type Orientation = 'portrait' | 'landscape'

export interface Viewport {
  width: number
  height: number
  orientation: Orientation
  /** Coarse-pointer devices (phones/tablets) — where orientation matters most. */
  isMobile: boolean
}

function read(): Viewport {
  const width = window.innerWidth
  const height = window.innerHeight
  return {
    width,
    height,
    orientation: width >= height ? 'landscape' : 'portrait',
    isMobile:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
  }
}

/**
 * The live viewport size + orientation, updated on resize / orientation change.
 * The app's first viewport-aware hook — games use it (via the fullscreen view)
 * to adapt to portrait vs landscape.
 */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read)
  useEffect(() => {
    const onChange = () => setVp(read())
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])
  return vp
}
