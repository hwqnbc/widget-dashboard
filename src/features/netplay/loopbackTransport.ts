/**
 * An in-page transport that pairs two widgets in the SAME document.
 *
 * This exists so the netplay feature is testable. Driving a real WebRTC
 * handshake headlessly would mean two browser contexts, a camera, mDNS
 * resolution and an unbounded ICE timeout — none of which say anything about
 * whether Connect 4 keeps two boards in step. The loopback transport swaps out
 * exactly the networking and leaves every other line of the feature (pairing
 * UI, protocol, seat rules, move validation, resync) under test.
 *
 * The pairing shape deliberately mirrors WebRTC's: the host publishes a token,
 * the guest redeems it. The host simply never has an answer to scan, which the
 * UI already handles because it reacts to link status rather than to steps.
 *
 * Enabled by `?netloop=1` in the URL — see `transportFactory.ts`.
 */
import type { NetTransport, TransportHandlers } from './types'

/** An unredeemed host token: its handlers, plus the hook the guest uses to
 * push its own handlers back into the host's closure. */
interface OpenSlot {
  handlers: TransportHandlers
  attach(guest: TransportHandlers): void
}

/** Open host slots by token. Module-level: both widgets share one document,
 * which is the whole point. */
const hub = new Map<string, OpenSlot>()

/** Short, unambiguous, and readable off a screen — no 0/O or 1/I. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function code(): string {
  let out = 'LB'
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

export function createLoopbackTransport(handlers: TransportHandlers): NetTransport {
  let token: string | null = null
  let peer: TransportHandlers | null = null
  let closed = false

  return {
    kind: 'loopback',

    async createOffer() {
      token = code()
      hub.set(token, {
        handlers,
        attach: (guest) => {
          peer = guest
        },
      })
      handlers.onStatus('pairing')
      return token
    },

    async acceptOffer(offer: string) {
      const key = offer.trim().toUpperCase()
      const slot = hub.get(key)
      if (!slot) throw new Error('No game is waiting on that code')
      hub.delete(key) // one guest per host
      slot.attach(handlers)
      peer = slot.handlers
      slot.handlers.onStatus('connected')
      handlers.onStatus('connected')
      return key
    },

    async acceptAnswer() {
      // Loopback pairs on redemption — nothing left to exchange.
    },

    send(data: string) {
      if (!closed) peer?.onMessage(data)
    },

    close() {
      if (closed) return
      closed = true
      if (token) hub.delete(token)
      peer?.onStatus('closed')
      peer = null
      handlers.onStatus('closed')
    },
  }
}

/** Test aid: forget every unredeemed pairing. */
export function resetLoopbackHub(): void {
  hub.clear()
}
