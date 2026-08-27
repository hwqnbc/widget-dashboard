/**
 * Which transport a session uses.
 *
 * Real play always goes over WebRTC. `?netloop=1` selects the in-page loopback
 * transport instead, which is how the e2e suites pair two widgets in one
 * document without any networking. The switch is a URL parameter rather than a
 * build flag so the same production bundle is what gets tested.
 */
import { createLoopbackTransport } from './loopbackTransport'
import { createWebrtcTransport } from './webrtcTransport'
import type { TransportFactory } from './types'

export const LOOPBACK_PARAM = 'netloop'

export function loopbackRequested(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get(LOOPBACK_PARAM) === '1'
  } catch {
    return false
  }
}

export const transportFactory = (): TransportFactory =>
  loopbackRequested() ? createLoopbackTransport : createWebrtcTransport
