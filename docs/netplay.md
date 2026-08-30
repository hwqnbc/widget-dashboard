# Netplay — two devices, one wifi

Design notes for `src/features/netplay/` and `src/components/netplay/`, the
peer-to-peer link that lets two people play one game from two devices.
Consumers: Connect 4 (`docs/connect-4.md`), Tic-Tac-Toe
(`docs/tic-tac-toe.md`), Maze Runner (`docs/maze-runner.md`) and Archery
(`docs/archery.md`), all through a **2 Devices** mode — turn-based, turn-based,
a live race, and a turn-based game whose move is a real-valued shot.

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
| `ping` / `pong` | liveness heartbeat — handled inside `useNetplay` like `hello`; games never see them (see *When the wifi blips*) |

Connect 4's move is a column index and Tic-Tac-Toe's is a cell index; the same
envelope carries both, unchanged. **A real-valued move fits too**: Archery
quantizes a shot (launch vector, launch height, captured animation phases)
into one 46-bit integer riding the same `move: number`, and both sides run the
same pure fixed-step resolver on the identical unpacked ints — determinism by
quantization, no protocol change (see `docs/archery.md`). `sync` state is opaque here and validated by
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
idea — and another turn-based one (Dots and Boxes) needs the right-hand
column only.

Othello, the fourth consumer, stretched the seam one notch without changing
it: its turn is not derivable from the board (a forced pass breaks disc
parity), so its `TBoard` is a whole position `{ cells, turn }` and its
`applyMove` computes the pass-aware next mover — the hook is generic over
`TBoard` and never needed to know (see `docs/othello.md`). A pass never
crosses the wire: both devices derive it in the same pure function.

### Two consumer shapes

`useNetGame` is turn-based **by construction**: ply, turn ownership, one shared
board. Maze Runner's ghost race has none of those — two runners move at once on
their own copies of one maze — so it sits *beside* the hook rather than under
it, on `useNetplay` directly, and speaks three messages the turn-based games
never send:

| Message | Meaning |
|---|---|
| `go` | start the run now; both sides count down from their own receipt |
| `pos` | where a runner has got to |
| `done` | this seat finished, with its elapsed ms |

That is the honest boundary. The transport, the pairing codec, the version
handshake and the protocol are shared; the *turn wiring* is not, and pretending
otherwise would have distorted a hook that serves two games well.

Two notes from building it. `pos` needs **no sequencing or rate limit**: maze
moves are discrete, so it is one message per committed move (~11/s at worst
under key auto-repeat), it is last-write-wins, and a lost one costs a marker
position rather than the game. And with a **synchronised start**, the first
`done` is necessarily the lower time — so the winner needs no arbitration and
message ordering cannot change the result.

## Seats — and the avatar costume

Host is always Player 1 (`toy`), guest always Player 2 (`ninja`) — decided by
role, so both sides agree with nothing to negotiate. The wire only ever speaks
seats; avatars are rendering.

That used to mean each device rendered its *own* `ui.avatars` picks, which
looked broken in practice: the same seat wore different characters on the two
tablets, and "my guy" wasn't the same guy when the kids compared screens. So
**the host's seat→avatar map now travels in its `sync`** (the payload is
opaque and extensible, so this needed no new message type and no version
bump — an older peer just ignores the field) and the guest wears it as a
**costume**:

- The map lands in `SeatAvatarsOverride` (a React context in
  `features/avatars/useSeatAvatars`), which every seat-resolving hook consults
  before redux — so `PlayerBadge`, `TurnBanner`, `WinnerCelebration`, the
  discs/marks and the maze ghost all follow from one provider around the
  widget's subtree.
- It is **never written to the guest's settings**: their picks are a
  device-level preference used by the whole dashboard, and joining a game must
  not rewrite them. The override is transient, scoped to the linked widget,
  and drops the moment the link does (`peerAvatars` is gated on
  `link.alive`, not strict `connected`, so a wifi blip doesn't flicker the
  characters mid-game).
- One React subtlety, for the next consumer: the widget's own function body
  runs *above* its provider, so body-level lookups (disc colours, the maze's
  ghost head) use the same `effectiveAvatars` map the provider is handed —
  context alone only covers descendants.

Proven where it can actually diverge: the two-context WebRTC suite (`144`)
gives each device its own localStorage, swaps the host's Player 1 on the real
Settings page, and asserts the guest renders the host's pick — then gets its
own back when the link drops. Loopback suites share one store, so they pin the
`data-avatar-toy`/`data-avatar-ninja` contract only.

## The link is transient

Like fullscreen, the link lives in component state and never reaches
redux-persist. A saved "connected" flag would be a lie the moment the page
reloads — and reloading is exactly what a kid's tablet does when it sleeps.
The game *position* is persisted as always, so a dropped link and a re-pair
resumes the board (the host pushes `sync` on connect).

## When the wifi blips — and when it really dies

Field report, verbatim: "sometimes got disconnected til the maze desync". The
diagnosis mattered more than the fix: on a LAN with a **reliable, ordered**
data channel, the transport layer *cannot* lose a message — SCTP retransmits
until delivery or death. The only way a game desyncs is if **we** tear the
link down while it was still going to recover. Which is exactly what the
first version did: it mapped `connectionState === 'disconnected'` straight to
dead, and `disconnected` is a state WebRTC enters for a second or two of
packet loss that ICE heals on its own.

Three layers now stand between a blip and a dead game:

- **Grace before death** (`webrtcTransport`). pc `'disconnected'` reports the
  new `reconnecting` status and starts a grace timer
  (`RECONNECT_GRACE_MS` = 8 s). If ICE recovers, the link reports `connected`
  again and nothing was lost — the channel kept buffering, so every message
  arrives late rather than never, and a mid-race ghost simply catches up.
  Only grace expiry or pc `'failed'` is death; channel `onclose` stays
  immediately definitive.
- **Heartbeat** (`useNetplay`, protocol v3). `ping`/`pong` every
  `PING_MS` = 2.5 s, handled inside the hook like `hello` — games never see
  them. ANY incoming message refreshes liveness; silence past
  `QUIET_MS` = 7 s shows `reconnecting`, past `DEAD_MS` = 16 s fails the
  link. This catches the death that fires **no event at all**: a backgrounded
  tablet tab stops JS without closing anything. New message types mean a
  `NET_VERSION` bump (2 → 3, lesson #109): a v2 peer would never pong and
  would be wrongly declared dead — precisely the half-working state the
  handshake exists to refuse.
- **An honest UI for each state.** `link.alive` (= `connected ||
  reconnecting`) is exposed beside the strict `link.connected`: input locks
  gate on `connected` (safe — queued moves apply on recovery), cosmetic
  things like the avatar costume gate on `alive` so a blip doesn't flicker
  them. The chip distinguishes `Reconnecting…` (warning) from `Connection
  lost — tap to re-pair` (error) — a dead link and a never-paired link must
  not both read "Tap to connect". And on `failed`/`closed` the pairing dialog
  **stops showing the stale token**: the `RTCPeerConnection` behind it is
  gone, so the only honest offer is a *Pair again* button that mints a fresh
  code (`netplay-lost`/`netplay-repair`).

Consumers decide what a real death means for *their* game. Turn-based games
need nothing: the board is persisted, the position is whole, re-pairing
resumes it via the host's `sync`. The maze race is live, so an unresolved
race **voids** — see `docs/maze-runner.md`. The timings are exported
constants, so the suites assert observable transitions rather than
re-deriving clocks.

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
  winner, broadcast new game, and link release on leaving the mode — plus the
  dead-link UX: the peer leaving closes the survivor's link, whose chip reads
  lost (not "tap to connect") and whose dialog offers Pair again with the
  stale token gone.
- `144-netplay-webrtc` — the same pairing through a real `RTCPeerConnection`
  between two browser contexts, proving a QR-sized token really does open a
  data channel. Separate contexts, not tabs: same-origin tabs share
  localStorage, and the boards would agree through redux-persist rather than
  through the link. Ends with the guest's page closing OUTRIGHT while linked —
  the real-transport proof of the grace timer + heartbeat: the host notices by
  itself within the documented windows and offers a re-pair. Chromium runs with
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
- ~~Reversi online~~ — **shipped** with the Othello widget itself: online was
  a first-class mode from day one, and its position-shaped `TBoard` proved
  the seam stretches to games whose turn isn't parity (see *The shared seam*
  and `docs/othello.md`).
- **Dots and Boxes online** — same shape again, once the widget exists
  (`docs/widget-ideas.md`).
- **Memory online** — the first game needing more than moves: the card
  shuffle must be shared. Host sends the seed in `sync`, exactly as the maze
  race now sends its maze seed.
- ~~Archery online~~ — **shipped**: the real-valued move, quantized into the
  integer `move` and resolved by a shared fixed-step resolver; a restart is a
  `sendSync` because fresh randomness cannot ride `new`. See `docs/archery.md`.

**Pairing UX**
- **Reconnect without a fresh scan** — a dropped link now offers *Pair again*
  honestly (a new QR: the old `RTCPeerConnection` is unusable, so the old
  token genuinely cannot be reused). True re-scan-free recovery would need a
  fresh handshake carried some other way — worth designing, not worth faking.
- **One-hop pairing** — fold the answer into a short numeric code shown by the
  guest, so only one camera scan is needed instead of two.
- **Nearby-device hints** — remember recently paired devices by fingerprint
  and offer them by name.

**Robustness**
- ~~Blip tolerance + liveness~~ — **shipped**: the grace timer, the
  `ping`/`pong` heartbeat and the dead-link UX (see *When the wifi blips*).
- **Link health indicator** — the heartbeat now exists; surfacing its
  round-trip time on the chip would make a *degrading* link visible before
  the quiet threshold trips.
- **Desync detector** — a board hash on every `move`; a mismatch triggers a
  host `sync` instead of two players staring at different boards.
- **Spectator seat** — a third peer receiving `sync` only.

**Beyond turn-based**
- **Drone Strike score duel** — the next real-time consumer, designed and
  waiting in `docs/drone-strike.md`'s backlog (same seeded waves fought
  privately, synced start, live scoreboard; the ghost/shared-kills fork and
  the deferred shared-battle option are written up there). The maze race
  already proved the `go`/`done` pattern it reuses.
- **Fully shared real-time battles** (Tank Battle, the Drone Strike shared
  world) remain a different project: host-authoritative entity state,
  interpolation and authority over hits. The transport and pairing here are
  reusable; the turn protocol is not — see the strike backlog for the
  worked-through deferral.
