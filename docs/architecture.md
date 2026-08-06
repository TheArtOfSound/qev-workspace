# Architecture

## Components

```txt
apps/web
  Auth UI, durable rooms, chat, 2-person voice, screen-share MVP

apps/relay
  Fastify HTTP API (auth/rooms/chat/voice tickets)
  Durable SQLite storage with migrations
  Ephemeral /ws QEV pairing rooms
  Authenticated /ws/audio WebRTC signaling

apps/desktop
  Future native agent for true remote control

packages/protocol
  Shared message and permission types

packages/crypto
  QEV integration boundary and crypto helpers
```

## Durable collaboration plane

```txt
Browser --HTTPS--> /api/auth/*          register/login/refresh/logout/me
Browser --HTTPS--> /api/rooms*          create/list/join/leave/members
Browser --HTTPS--> /api/rooms/:id/messages
Browser --HTTPS--> /api/voice/ticket    short-lived WS ticket
Browser --HTTPS--> /api/webrtc/ice      STUN/TURN servers
Browser --WSS----> /ws/audio            SDP/ICE (membership-bound, 2 peers)
```

Persistence:

- users, refresh tokens, rooms, memberships, messages, ws tickets in SQLite
- access JWT in `localStorage` (`qev_token`); refresh cookie `qev_refresh`

## Ephemeral QEV pairing plane (screen share)

```txt
Host -> relay: room.create
Relay -> host: room.created { roomCode }
Guest -> relay: room.join { roomCode }
Host/guest exchange WebRTC offer/answer/ICE through /ws
```

These pairing rooms remain TTL-based and separate from durable account rooms.

## Voice topology

Current production voice is **direct peer-to-peer** with a hard server-side limit of **2 participants**. Group voice requires an SFU (LiveKit, mediasoup, Janus, etc.) as a separate phase.

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
GitHub Pages: web shell
Render: relay + SQLite (disk) + WSS
TURN: coturn or managed TURN
Desktop: signed installers later
```

See `docs/DEPLOYMENT.md`.
