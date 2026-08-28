# Netplay — two devices, one wifi

Design notes for `src/features/netplay/` and `src/components/netplay/`, the
peer-to-peer link that lets two people play one game from two devices.
Consumers: the Connect 4 widget (`docs/connect-4.md`) and Tic-Tac-Toe
(`docs/tic-tac-toe.md`), both through their **2 Devices** mode.

## The constraint that shaped everything

This app is a static site on GitHub Pages. There is no server, no database and
no session store — so there is nothing for two devices to sync *through*.
Everything below follows from that.

The answer is WebRTC: the two browsers talk **directly** to each other. The
page is fetched from the internet; the game traffic never leaves the house.

## No ICE servers, on purpose

`new RTCPeerConnection({ iceServers: [] })`.

With an empty list the browser gathers **host candidates only** — the
addresses it holds on the local network. No STUN, no TURN, no third party. A
link forms exactly when both devices are on the same wifi, which is the
feature as asked for, and the token stays small because there are no
server-reflexive candidates to carry.

Two consequences to know about:

- **HTTPS is required.** `RTCPeerConnection` is a secure-context API. Both
  devices must load the app over `https://` — the deployed Pages URL. Serving
  the dev server at `http://192.168.x.x:5173` and opening that on a phone
  will *not* work: the API simply isn't there. (`localhost` is a secure
  context, which is why the e2e suite can drive the real handshake.)
- **Client-isolated networks can't work.** Most guest wifi blocks
  device-to-device traffic outright. No ICE configuration fixes that; it needs
  a relay server, which is the thing this design does without. The widget
  reports a failed link rather than pretending.

## Signaling without a signaling server

WebRTC needs the two peers to exchange an offer and an answer before they can
talk. Normally a server passes those along. Here the **QR code is the
signaling channel**: one device shows a square, the other points a camera at
it. Twice — once each way — because the handshake genuinely has two hops.

A raw offer SDP is ~700–1000 characters, and a QR that big is dense enough
that a child holding a tablet at arm's length will not scan it. So
`sdpCodec.ts` throws away the boilerplate.

### What a data channel actually needs

Of the whole SDP, only five things vary per connection:

| Field | Why it's needed |
|---|---|
| `a=ice-ufrag` | ICE username fragment |
| `a=ice-pwd` | ICE password |
| `a=fingerprint` | the DTLS certificate hash (32 bytes) |
| `a=setup` | DTLS role — `actpass` / `active` / `passive` |
| `a=candidate:…` | where to send packets |

Everything else — version, origin, timing, the BUNDLE group, the
`m=application … webrtc-datachannel` line, the SCTP port, the max message
size — is fixed for this connection shape and is rebuilt from a template on
arrival.

Candidates shrink further. Only UDP `typ host` candidates are kept (a LAN peer
needs nothing else), capped at four so a machine with a VPN and three virtual
adapters doesn't bloat the code. Chrome hides local IPs behind mDNS names like
`8bf4f4b9-….local`; those are stored as bare hex and re-dashed on unpack.

The result, measured by the e2e suites against real Chrome SDPs: **118–162
characters**, a QR around version 7. Scans instantly.

### Token format

```
C1o~<ufrag>~<pwd>~<fingerprint-hex>~<setup>~<cand>;<cand>
   │                                          └─ '4'|'6'|'m' , address , port
   └─ 'o' offer / 'a' answer          C1 = compact, C0 = raw escape hatch
```

Separators (`~` `;` `,`) are chosen so none can occur inside the values they
delimit — an IPv6 literal has colons but no comma, a uuid is hex and dashes.

**The escape hatch matters.** If anything is unexpected — a non-sha-256
fingerprint, a missing credential, no host candidate at all — `packSdp` emits
a `C0` token carrying the whole URL-encoded SDP instead of a compact one it
isn't sure about. A big dense QR still works; a subtly wrong small one never
does. The dialog notices (`isCompactToken`) and warns that the square is dense
and typing the code may be easier.

## The transport seam

```
NetTransport            createOffer / acceptOffer / acceptAnswer / send / close
  ├── webrtcTransport   the real thing
  └── loopbackTransport two widgets in ONE document, no networking
```

A transport moves opaque strings and reports link state. It knows nothing
about games; a widget knows nothing about WebRTC.

`loopbackTransport` exists so the feature is **testable**. Driving a real
handshake headlessly for every game-rule assertion would mean two browser
contexts, a camera and an unbounded ICE wait — none of which says anything
about whether two Connect 4 boards stay in step. Selected with `?netloop=1` in
the URL (a URL parameter, not a build flag, so the tested bundle is the
shipped bundle).

Its pairing shape deliberately mirrors WebRTC's — the host publishes a token,
the guest redeems it — except that it pairs in one hop instead of two. The
dialog copes because it renders from **link status**, never from a step
counter; `needsReply` is gated on `transport.kind === 'webrtc'` so a loopback
host is never told to go scanning for a code that will never appear.

## The wire protocol

`netProtocol.ts`, deliberately game-agnostic — a turn-based board game only
ever needs three things:

| Message | Meaning |
|---|---|
| `hello` | version handshake, sent on connect |
| `move` | `{ seat, ply, move }` — a move number, whatever that means to the game |
| `sync` | whole position; the host sends one on connect |
| `new` | restart, with who opens |

Connect 4's move is a column index and Tic-Tac-Toe's is a cell index; the same
envelope carries both, unchanged. `sync` state is opaque here and validated by
the widget that understands it.

`hello` never reaches the game: `useNetplay` sends it the moment a link opens
and checks the incoming one itself, failing the link on a version mismatch.
Catching that while both boards are still empty and identical is the whole
point — the alternative is two people discovering the skew several moves into
a game that has quietly diverged. Note that a foreign version must still
*decode*; rejecting it as malformed would turn a fixable "reload both devices"
into unexplained silence.

**Moves, not state.** A turn-based game needs only the move on the wire — a
handful of bytes, latency-tolerant, no prediction and no rollback. Both peers
run the same reducer. (Real-time games are a different problem entirely; see
the backlog.)

`ply` — the number of moves already played *before* this one — is what keeps
the two boards honest. A move is applied only if it is the other seat's turn
**and** the ply matches. A duplicated, reordered or stale delivery is dropped
rather than guessed at: a missed move leaves the position intact, where a
misapplied one corrupts it.

## The shared seam — `useNetGame`

Connect 4 carried the netplay wiring inline at first. When Tic-Tac-Toe became
the second consumer, all but one line of it turned out to be generic, so it
moved to `features/netplay/useNetGame`:

| Supplied by the hook | Supplied by the game |
|---|---|
| seat assignment (host is Player 1) | `applyMove(board, move, seat)` |
| the turn lock (`blocked`) | `coerceBoard` — validating a peer's `sync` |
| the ply-checked move relay, with all three ignore-reasons | `newBoard()` |
| the host's position `sync` on connect | `onReplace()` — clearing transient UI |
| the broadcast restart | `turn` / `ply`, which both games already derive |
| the pairing dialog's lifecycle | |

Both games derive the turn from `(board, first)`, count ply as filled cells,
and sync `{ board, first }` — so the only real difference between them is a
column drop versus setting a cell. `NetplayChip` moved out for the same reason:
it was identical bar a test id.

The claim that the protocol is game-agnostic was, until this point, an
assertion in this document. A second game now shares the *code*, not just the
idea — and a third (Dots and Boxes, Reversi) needs the right-hand column only.

## Seats

Host is always Player 1 (`toy`), guest always Player 2 (`ninja`) — decided by
role, so both sides agree with nothing to negotiate. Which *avatar* those
seats wear is the usual per-device `ui.avatars` map (`docs/avatars.md`), so
two players can each see their own chosen character; the seat identity on the
wire is unaffected.

## The link is transient

Like fullscreen, the link lives in component state and never reaches
redux-persist. A saved "connected" flag would be a lie the moment the page
reloads — and reloading is exactly what a kid's tablet does when it sleeps.
The game *position* is persisted as always, so a dropped link and a re-pair
resumes the board (the host pushes `sync` on connect).

## Camera

`QrScanner` decodes with jsQR on a downscaled copy of the frame, every other
frame — a QR of a 120-character token is coarse, and full-resolution
`getImageData` on a phone costs more than it buys.

Camera failure is expected, not exceptional: permission gets denied, a laptop
has no rear camera, a browser blocks it in an iframe. Every step that scans
also accepts the code **typed or pasted**, so a blocked camera is never a dead
end. (It is also how the e2e suites pair, having no camera at all.)

QR codes render dark-on-white regardless of theme. An inverted QR is legal and
many scanners cope, but plenty of phone cameras don't, and a code that won't
scan in a dark kitchen is a broken feature. The white plate doubles as the
quiet zone.

## Test contract

Connect 4's root publishes `data-net` (link status), `data-seat` (this
device's seat), `data-turn`, `data-ply`, `data-winner`, `data-mode`.

- `143-netplay` — the codec against real Chrome SDPs (round-trip, mDNS
  candidates, size, the raw fallback, garbage rejection), the protocol
  validator, then a full two-seat game over the loopback transport: pairing,
  seat assignment, move relay, the turn lock, out-of-turn rejection, an agreed
  winner, broadcast new game, and link release on leaving the mode.
- `144-netplay-webrtc` — the same pairing through a real `RTCPeerConnection`
  between two browser contexts, proving a QR-sized token really does open a
  data channel. Separate contexts, not tabs: same-origin tabs share
  localStorage, and the boards would agree through redux-persist rather than
  through the link. Chromium runs with
  `--disable-features=WebRtcHideLocalIpsWithMdns`, because a container has no
  mDNS responder to resolve `.local` candidates with; on real devices on real
  wifi mDNS resolution is exactly what makes this work.

## Future work (enhancement backlog)

Netplay is infrastructure, so this backlog is about reach rather than
gameplay.

**More games on the same rails**
- ~~Tic-Tac-Toe online~~ — **shipped**, and it did prove the point: the second
  game supplies one function (`applyMove`) and inherits everything else. See
  *The shared seam* above and `docs/tic-tac-toe.md`.
- **Dots and Boxes / Reversi online** — same shape again, once those widgets
  exist (`docs/` backlogs).
- **Memory online** — the first game needing more than moves: the card
  shuffle must be shared. Host sends the seed in `sync`.
- **Archery online** — first real-valued move (angle + power) rather than an
  index; still one message per turn.

**Pairing UX**
- **Reconnect on the same code** — hold the last token so a dropped link
  re-pairs without re-scanning; the host's `sync` already restores position.
- **One-hop pairing** — fold the answer into a short numeric code shown by the
  guest, so only one camera scan is needed instead of two.
- **Nearby-device hints** — remember recently paired devices by fingerprint
  and offer them by name.

**Robustness**
- **Link health indicator** — ping/pong round-trip time on the chip, so a
  stalled link is visible before a move goes missing.
- **Desync detector** — a board hash on every `move`; a mismatch triggers a
  host `sync` instead of two players staring at different boards.
- **Spectator seat** — a third peer receiving `sync` only.

**Beyond turn-based**
- **Real-time netplay** (Tank Battle, a Drone Strike versus mode) is a
  different project, not an extension of this one: it needs tick
  synchronisation, interpolation and authority over hits. The transport and
  pairing here would be reusable; the protocol would not.
