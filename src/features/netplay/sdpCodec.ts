/**
 * Compact pairing tokens for a data-channel-only WebRTC handshake.
 *
 * A raw SDP offer is ~1 kB of almost entirely boilerplate — far too big for a
 * QR code a child can scan across a kitchen table. But a data channel needs
 * only five things from the other side: the ICE ufrag/password, the DTLS
 * fingerprint, the DTLS setup role, and somewhere to send packets. Everything
 * else is fixed for this connection shape, so it can be rebuilt from a
 * template on arrival.
 *
 * That takes a token from ~1000 characters to ~160 — a QR around version 9,
 * which scans instantly on a phone at arm's length.
 *
 * Pure module (no DOM, no WebRTC): the e2e suites import it directly and
 * round-trip real browser SDPs through it.
 */

/** Which half of the handshake a token carries. */
export type TokenKind = 'offer' | 'answer'

export interface PackedSdp {
  kind: TokenKind
  sdp: string
}

/** One ICE host candidate — all a peer on the same LAN actually needs. */
interface Candidate {
  /** '4' IPv4 literal, '6' IPv6 literal, 'm' an mDNS `<uuid>.local` name. */
  form: '4' | '6' | 'm'
  /** Address as transmitted: literal IP, or the mDNS uuid stripped of dashes. */
  addr: string
  port: number
}

/** Field / candidate-list / candidate-part separators. Chosen so that none can
 * appear inside the values they delimit (an IPv6 literal has colons but no
 * comma; a uuid is hex and dashes but no tilde). */
const FIELD = '~'
const CAND = ';'
const PART = ','

/** Version + shape prefix. `C1` compact, `C0` raw-SDP escape hatch. */
const COMPACT = 'C1'
const RAW = 'C0'

const SETUP_CODE: Record<string, string> = {
  actpass: 'a',
  active: 'c',
  passive: 'p',
}
const SETUP_NAME: Record<string, string> = { a: 'actpass', c: 'active', p: 'passive' }

/** Candidates worth carrying. Two devices on one wifi reach each other on a
 * host candidate; more than a handful is a sign of an interface zoo (VPNs,
 * virtual adapters) and only bloats the QR. */
const MAX_CANDIDATES = 4

const line = (sdp: string, prefix: string): string | null => {
  for (const l of sdp.split(/\r?\n/)) {
    if (l.startsWith(prefix)) return l.slice(prefix.length).trim()
  }
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `a=candidate:` lines, keeping only UDP host candidates. */
function parseCandidates(sdp: string): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const l of sdp.split(/\r?\n/)) {
    const m = /^a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)/.exec(l.trim())
    if (!m) continue
    const [, , component, transport, , address, port, type] = m
    if (component !== '1') continue // RTCP component — unused by a data channel
    if (transport.toLowerCase() !== 'udp') continue
    if (type !== 'host') continue
    const key = `${address}:${port}`
    if (seen.has(key)) continue
    seen.add(key)

    const mdns = /^(.+)\.local$/i.exec(address)
    if (mdns && UUID_RE.test(mdns[1])) {
      out.push({ form: 'm', addr: mdns[1].replace(/-/g, '').toLowerCase(), port: Number(port) })
    } else {
      out.push({ form: address.includes(':') ? '6' : '4', addr: address, port: Number(port) })
    }
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

const expandAddr = (c: Candidate): string => {
  if (c.form !== 'm') return c.addr
  const h = c.addr
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}.local`
}

/**
 * Shrink a browser SDP to a pairing token.
 *
 * Anything unexpected (a non-sha-256 fingerprint, a missing ICE credential, no
 * usable host candidate) falls back to a raw token rather than producing a
 * subtly broken compact one: a big QR still works, a wrong one never does.
 */
export function packSdp(sdp: string, kind: TokenKind): string {
  const raw = `${RAW}${kind === 'offer' ? 'o' : 'a'}${FIELD}${encodeURIComponent(sdp)}`

  const ufrag = line(sdp, 'a=ice-ufrag:')
  const pwd = line(sdp, 'a=ice-pwd:')
  const fingerprint = line(sdp, 'a=fingerprint:')
  const setup = line(sdp, 'a=setup:')
  if (!ufrag || !pwd || !fingerprint || !setup) return raw

  const [algo, hex] = fingerprint.split(/\s+/)
  if (algo?.toLowerCase() !== 'sha-256') return raw
  const fp = hex?.replace(/:/g, '').toLowerCase()
  if (!fp || !/^[0-9a-f]{64}$/.test(fp)) return raw

  const setupCode = SETUP_CODE[setup]
  if (!setupCode) return raw

  const candidates = parseCandidates(sdp)
  if (candidates.length === 0) return raw

  // A separator inside a credential would corrupt the token; browsers never
  // emit one, but a token that silently mis-parses is worse than a big QR.
  if ([ufrag, pwd].some((v) => v.includes(FIELD) || v.includes(CAND) || v.includes(PART))) {
    return raw
  }

  const cands = candidates.map((c) => `${c.form}${PART}${c.addr}${PART}${c.port}`).join(CAND)
  return [
    `${COMPACT}${kind === 'offer' ? 'o' : 'a'}`,
    ufrag,
    pwd,
    fp,
    setupCode,
    cands,
  ].join(FIELD)
}

/** Rebuild the full SDP a `RTCPeerConnection` will accept. */
function buildSdp(
  kind: TokenKind,
  ufrag: string,
  pwd: string,
  fp: string,
  setup: string,
  candidates: Candidate[],
): string {
  const colonised = (fp.match(/../g) ?? []).join(':').toUpperCase()
  // Session id only has to be a stable-per-session number; the peer never
  // interprets it for a data channel.
  const lines = [
    'v=0',
    `o=- ${kind === 'offer' ? '1' : '2'}0000000000000000 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${colonised}`,
    `a=setup:${setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ]
  candidates.forEach((c, i) => {
    // Priority just has to descend across the list; the browser re-derives
    // everything it actually cares about during connectivity checks.
    lines.push(
      `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${expandAddr(c)} ${c.port} typ host generation 0`,
    )
  })
  return `${lines.join('\r\n')}\r\n`
}

/** Parse a pairing token back into an SDP, or null if it is not one. */
export function unpackToken(token: string): PackedSdp | null {
  const trimmed = token.trim()
  const head = trimmed.slice(0, 3)
  const kind: TokenKind | null =
    head[2] === 'o' ? 'offer' : head[2] === 'a' ? 'answer' : null
  if (!kind) return null

  if (trimmed.startsWith(RAW)) {
    const body = trimmed.slice(4)
    if (trimmed[3] !== FIELD || !body) return null
    try {
      return { kind, sdp: decodeURIComponent(body) }
    } catch {
      return null
    }
  }
  if (!trimmed.startsWith(COMPACT)) return null

  const [, ufrag, pwd, fp, setupCode, cands] = trimmed.split(FIELD)
  if (!ufrag || !pwd || !fp || !setupCode || !cands) return null
  if (!/^[0-9a-f]{64}$/.test(fp)) return null
  const setup = SETUP_NAME[setupCode]
  if (!setup) return null

  const candidates: Candidate[] = []
  for (const part of cands.split(CAND)) {
    const [form, addr, port] = part.split(PART)
    if ((form !== '4' && form !== '6' && form !== 'm') || !addr) return null
    const p = Number(port)
    if (!Number.isInteger(p) || p <= 0 || p > 65535) return null
    if (form === 'm' && !/^[0-9a-f]{32}$/.test(addr)) return null
    candidates.push({ form, addr, port: p })
  }
  if (candidates.length === 0) return null

  return { kind, sdp: buildSdp(kind, ufrag, pwd, fp, setup, candidates) }
}

/** True when the token is compact (a small, comfortably scannable QR). */
export const isCompactToken = (token: string): boolean => token.trim().startsWith(COMPACT)
