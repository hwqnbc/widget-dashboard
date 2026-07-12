import { useCallback, useState, type ReactNode } from 'react'
import { useAppSelector } from '../../app/hooks'
import { widgetMetaByType } from '../../features/widgets/widgetCatalog'
import { FullscreenContext } from './fullscreenContext'
import FullscreenView from './FullscreenView'

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>
  unlock?: () => void
}

/** Best-effort native fullscreen + landscape lock. Works on many Android
 * browsers; iOS Safari / desktop reject → caught, and the in-view rotate hint
 * covers those. Must run inside the click gesture (called from `open`). */
async function lockLandscape() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen()
    }
    await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape')
  } catch {
    /* unsupported — the rotate hint handles it */
  }
}

function releaseOrientation() {
  try {
    ;(screen.orientation as LockableOrientation | undefined)?.unlock?.()
  } catch {
    /* noop */
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen()
  } catch {
    /* noop */
  }
}

/**
 * Holds the (transient, non-persisted) id of the widget currently shown
 * fullscreen and renders its overlay. Mounted once, around the app shell.
 */
export default function FullscreenProvider({ children }: { children: ReactNode }) {
  const instances = useAppSelector((s) => s.widgets.instances)
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)

  const open = useCallback(
    (id: string) => {
      setFullscreenId(id)
      const type = instances.find((w) => w.id === id)?.type
      if (type && widgetMetaByType[type].preferredOrientation === 'landscape') {
        void lockLandscape()
      }
    },
    [instances],
  )

  const close = useCallback(() => {
    setFullscreenId(null)
    releaseOrientation()
  }, [])

  return (
    <FullscreenContext.Provider value={{ fullscreenId, open, close }}>
      {children}
      <FullscreenView id={fullscreenId} onClose={close} />
    </FullscreenContext.Provider>
  )
}
