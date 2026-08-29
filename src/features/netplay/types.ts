/**
 * Transport-agnostic link plumbing shared by every net-played widget.
 *
 * A transport moves opaque strings between two devices and reports link state.
 * It knows nothing about games; a widget knows nothing about WebRTC. That seam
 * is what lets the e2e suites drive a real two-seat game through an in-page
 * `loopback` transport with no networking at all (see `loopbackTransport.ts`).
 */

/** Which side opened the link. The host takes seat 1, the guest seat 2. */
export type NetRole = 'host' | 'guest'

/**
 * Link lifecycle, published verbatim as `data-net` for the test contract.
 *
 * - `idle` — nothing started.
 * - `pairing` — a token has been produced and we are waiting on the other side.
 * - `connecting` — both descriptions exchanged, ICE / channel coming up.
 * - `connected` — the data channel is open; play.
 * - `reconnecting` — the link is blipping (a recoverable ICE `disconnected`,
 *   or the heartbeat has gone quiet). The channel usually still buffers, so
 *   messages arrive late rather than never; a grace period decides which.
 * - `failed` / `closed` — link gone; the UI offers a fresh pairing.
 */
export type NetStatus =
  | 'idle'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed'

export interface TransportHandlers {
  onMessage(data: string): void
  onStatus(status: NetStatus, detail?: string): void
}

export interface NetTransport {
  readonly kind: 'webrtc' | 'loopback'
  /** Host side: produce the token the guest scans. */
  createOffer(): Promise<string>
  /** Guest side: consume the host's token, produce the answer token. */
  acceptOffer(token: string): Promise<string>
  /** Host side: consume the guest's answer token. */
  acceptAnswer(token: string): Promise<void>
  send(data: string): void
  close(): void
}

export type TransportFactory = (handlers: TransportHandlers) => NetTransport
