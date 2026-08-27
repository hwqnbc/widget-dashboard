/**
 * The real transport: a browser-to-browser WebRTC data channel.
 *
 * **No ICE servers, on purpose.** With an empty `iceServers` list the browser
 * gathers host candidates only — the addresses it holds on the local network —
 * so a link forms exactly when both devices are on the same wifi and never
 * traverses the internet. That is the feature, not a limitation: the page is
 * served from GitHub Pages, but the game traffic never leaves the house.
 *
 * Two consequences worth knowing (both documented in `docs/netplay.md`):
 * - `RTCPeerConnection` is a secure-context API, so both devices must load the
 *   app over HTTPS. `http://<lan-ip>:5173` will not do — use the deployed URL.
 * - Networks with client isolation (most guest wifi) block peer-to-peer
 *   traffic outright, and no amount of ICE fixes that without a relay server.
 *
 * Handshaking is non-trickle: we wait for ICE gathering to finish, then pack
 * the complete description into one token. Trickle would mean a second channel
 * to carry candidates on — and the whole point is that there is no channel but
 * the QR code.
 */
import { packSdp, unpackToken } from './sdpCodec'
import type { NetTransport, TransportHandlers } from './types'

/** How long to wait for candidate gathering before packing what we have.
 * Host-only gathering on a LAN finishes in well under a second; the timeout is
 * a backstop for an interface that never reports done. */
const GATHER_TIMEOUT_MS = 4000

const CHANNEL_LABEL = 'widget-netplay'

/** Resolve once the browser has finished gathering candidates (or we give up
 * waiting and ship the ones already in the description). */
function gatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
    const timer = setTimeout(finish, GATHER_TIMEOUT_MS)
  })
}

export function webrtcSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    window.isSecureContext
  )
}

export function createWebrtcTransport(handlers: TransportHandlers): NetTransport {
  if (!webrtcSupported()) {
    throw new Error(
      typeof RTCPeerConnection === 'undefined'
        ? 'This browser has no WebRTC support.'
        : 'Two-device play needs a secure (https) page.',
    )
  }

  const pc = new RTCPeerConnection({ iceServers: [] })
  let channel: RTCDataChannel | null = null
  let closed = false

  const bindChannel = (dc: RTCDataChannel) => {
    channel = dc
    dc.onopen = () => handlers.onStatus('connected')
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') handlers.onMessage(e.data)
    }
    dc.onclose = () => {
      if (!closed) handlers.onStatus('closed')
    }
  }

  pc.ondatachannel = (e) => bindChannel(e.channel)
  pc.onconnectionstatechange = () => {
    if (closed) return
    // The data channel's own `onopen` is what says "you can play now", so a
    // `connected` peer connection is not promoted here — only the failure
    // states, which the channel would otherwise never report.
    if (pc.connectionState === 'failed') {
      handlers.onStatus('failed', 'Could not reach the other device.')
    } else if (pc.connectionState === 'disconnected') {
      handlers.onStatus('closed')
    }
  }

  /** Local description → pairing token, once candidates are in. */
  const localToken = async (kind: 'offer' | 'answer'): Promise<string> => {
    await gatheringComplete(pc)
    const sdp = pc.localDescription?.sdp
    if (!sdp) throw new Error('The browser did not produce a connection offer.')
    return packSdp(sdp, kind)
  }

  const applyRemote = async (token: string, expect: 'offer' | 'answer') => {
    const parsed = unpackToken(token)
    if (!parsed) throw new Error("That code wasn't readable — try scanning again.")
    if (parsed.kind !== expect) {
      throw new Error(
        expect === 'offer'
          ? "That's a reply code, not a game code."
          : "That's a game code, not a reply code.",
      )
    }
    await pc.setRemoteDescription({ type: parsed.kind, sdp: parsed.sdp })
  }

  return {
    kind: 'webrtc',

    async createOffer() {
      // Created before the offer so the SDP carries the data-channel m-line.
      bindChannel(pc.createDataChannel(CHANNEL_LABEL, { ordered: true }))
      await pc.setLocalDescription(await pc.createOffer())
      handlers.onStatus('pairing')
      return localToken('offer')
    },

    async acceptOffer(token: string) {
      await applyRemote(token, 'offer')
      await pc.setLocalDescription(await pc.createAnswer())
      handlers.onStatus('connecting')
      return localToken('answer')
    },

    async acceptAnswer(token: string) {
      await applyRemote(token, 'answer')
      handlers.onStatus('connecting')
    },

    send(data: string) {
      if (channel?.readyState === 'open') channel.send(data)
    },

    close() {
      if (closed) return
      closed = true
      try {
        channel?.close()
        pc.close()
      } catch {
        /* already torn down */
      }
      handlers.onStatus('closed')
    },
  }
}
