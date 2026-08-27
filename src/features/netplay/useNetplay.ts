/**
 * React binding for a netplay link: owns the transport, tracks link state, and
 * hands the widget a typed `send` plus decoded incoming messages.
 *
 * The link is deliberately **transient** — like fullscreen, it lives in
 * component state and never reaches redux-persist. A saved "connected" flag
 * would be a lie the moment the page reloads, and reloading is exactly what a
 * kid's tablet does when it sleeps.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Seat } from '../avatars/types'
import {
  decodeMsg,
  encodeMsg,
  NET_VERSION,
  seatForRole,
  type NetMsg,
} from './netProtocol'
import { transportFactory } from './transportFactory'
import type { NetRole, NetStatus, NetTransport } from './types'

export interface NetplayLink {
  status: NetStatus
  role: NetRole | null
  /** The seat this device plays, once a role is chosen. */
  seat: Seat | null
  /** The token to show as a QR: the offer (host) or the reply (guest). */
  token: string | null
  /** Host, mid-handshake, still needing the guest's reply code. */
  needsReply: boolean
  /** A step is in flight (gathering candidates, applying a description). */
  busy: boolean
  error: string | null
  connected: boolean
  host(): void
  join(token: string): void
  submitReply(token: string): void
  send(msg: NetMsg): void
  disconnect(): void
}

const message = (e: unknown): string =>
  e instanceof Error ? e.message : 'Something went wrong setting up the link.'

export function useNetplay(onMessage: (msg: NetMsg) => void): NetplayLink {
  const [status, setStatus] = useState<NetStatus>('idle')
  const [role, setRole] = useState<NetRole | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transport = useRef<NetTransport | null>(null)
  /** One greeting per link — `connected` can be reported more than once. */
  const greeted = useRef(false)
  // Held in a ref so a re-rendered handler never leaves the transport wired to
  // a stale closure over the previous board.
  const handler = useRef(onMessage)
  handler.current = onMessage
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      transport.current?.close()
      transport.current = null
    }
  }, [])

  const open = useCallback((): NetTransport => {
    transport.current?.close()
    greeted.current = false
    const created = transportFactory()({
      onMessage: (raw) => {
        if (!alive.current) return
        const msg = decodeMsg(raw)
        // A message we cannot parse is dropped rather than guessed at: better
        // a missed move (the position resyncs) than a corrupted board.
        if (!msg) return
        if (msg.t === 'hello') {
          // Protocol-level, so it is handled here and never reaches the game.
          // A version mismatch is caught NOW, while the boards are still
          // empty and identical — the alternative is two people discovering
          // it several moves into a game that has quietly diverged.
          if (msg.v !== NET_VERSION) {
            // Close FIRST: the transport reports `closed` on the way down, and
            // the diagnosis has to be the state the player is left looking at.
            transport.current?.close()
            setError('The other device has a different version of this app — reload both.')
            setStatus('failed')
          }
          return
        }
        handler.current(msg)
      },
      onStatus: (next, detail) => {
        if (!alive.current) return
        setStatus(next)
        if (detail) setError(detail)
        else if (next === 'connected') setError(null)
        if (next === 'connected' && !greeted.current) {
          greeted.current = true
          transport.current?.send(encodeMsg({ t: 'hello', v: NET_VERSION }))
        }
      },
    })
    transport.current = created
    return created
  }, [])

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      if (alive.current) {
        setError(message(e))
        setStatus('failed')
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [])

  const host = useCallback(() => {
    setRole('host')
    setToken(null)
    void run(async () => {
      const created = open()
      const offer = await created.createOffer()
      if (alive.current) setToken(offer)
    })
  }, [open, run])

  const join = useCallback(
    (offer: string) => {
      setRole('guest')
      setToken(null)
      void run(async () => {
        const created = open()
        const reply = await created.acceptOffer(offer)
        if (alive.current) setToken(reply)
      })
    },
    [open, run],
  )

  const submitReply = useCallback(
    (reply: string) => {
      void run(async () => {
        const active = transport.current
        if (!active) throw new Error('Start a game first.')
        await active.acceptAnswer(reply)
      })
    },
    [run],
  )

  const send = useCallback((msg: NetMsg) => {
    transport.current?.send(encodeMsg(msg))
  }, [])

  const disconnect = useCallback(() => {
    transport.current?.close()
    transport.current = null
    setRole(null)
    setToken(null)
    setError(null)
    setStatus('idle')
  }, [])

  return {
    status,
    role,
    seat: role ? seatForRole(role) : null,
    token,
    // The reply hop only exists on a real WebRTC handshake; the loopback
    // transport pairs on redemption and jumps straight to `connected`, so the
    // host must not be told to go scanning for a code that will never appear.
    needsReply:
      role === 'host' &&
      status === 'pairing' &&
      token !== null &&
      transport.current?.kind === 'webrtc',
    busy,
    error,
    connected: status === 'connected',
    host,
    join,
    submitReply,
    send,
    disconnect,
  }
}
