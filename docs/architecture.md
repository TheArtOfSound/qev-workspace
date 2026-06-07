# Architecture

## Components

```txt
apps/web
  Public landing page, lobby, browser screen-share MVP

apps/relay
  Ephemeral WebSocket signaling server

apps/desktop
  Future native agent for true remote control

packages/protocol
  Shared message and permission types

packages/crypto
  QEV integration boundary and crypto helpers
```

## Browser MVP

The browser MVP supports:

- Session creation
- Session joining
- Signaling through relay
- WebRTC peer connection
- Screen stream sharing
- Chat/control-plane messages
- Consent/audit event display

It does not support true OS-level remote control.

## Signaling flow

```txt
Host -> relay: create_room
Relay -> host: room_created { roomCode }
Guest -> relay: join_room { roomCode }
Relay -> host: peer_joined
Host/guest exchange WebRTC offer/answer/ICE through relay
WebRTC data channel opens
Host starts screen share
```

## Native agent later

The desktop agent will handle:

- Screen capture beyond browser limits
- OS-level mouse/keyboard event injection
- Permanent session indicator
- Emergency-stop overlay
- Device identity key storage
- Local audit logs

## Deployment

```txt
GitHub Pages: web shell + docs
Relay: Cloudflare Workers / Fly.io / VPS
TURN: coturn on VPS when needed
Desktop: signed installers later
```
