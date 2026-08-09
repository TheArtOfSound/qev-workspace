# QEV Workspace

QEV Workspace is a consent-first remote workspace for teams.

It is designed for deliberate, visible, permission-based remote support and collaboration. A user can share their screen, grant temporary control, revoke access instantly, and maintain a local audit trail of the session.

QEV Workspace is **not** built for hidden access, silent monitoring, unattended control, credential capture, persistence of remote control, or bypassing user consent.

## Product goals

- Explicit consent before viewing or control
- Short-lived pairing sessions
- Cryptographic device/session identity
- QEV-protected local secrets
- End-to-end session transport where possible
- Visible session indicators
- Revocable permissions
- Local audit logs
- Safe-by-default team collaboration

## Monorepo layout

```txt
apps/
  web/       Browser client (auth, rooms, chat, voice, screen-share MVP)
  relay/     HTTP API, durable storage, WebSocket signaling
  desktop/   Native desktop agent placeholder
packages/
  protocol/  Shared session, permission, and audit message types
  crypto/    QEV integration boundary and browser-safe crypto helpers
docs/
  architecture.md
  protocol.md
  consent-model.md
  threat-model.md
  deployment.md
  PRODUCTION_IMPLEMENTATION_EVIDENCE.md
```

## What is production-ready in this branch

| Capability | Status |
| --- | --- |
| User registration / login (scrypt password hashes) | Ready (requires secrets + DB path) |
| Short-lived JWT access tokens + rotating refresh cookies | Ready |
| Durable rooms + memberships (SQLite migrations) | Ready on persistent storage |
| Durable room chat with membership checks | Ready |
| Authenticated voice signaling tickets | Ready |
| Two-person P2P voice (`getUserMedia` + WebRTC) | Ready; **2-participant limit enforced** |
| TURN credential endpoint | Ready when `TURN_*` env configured |
| GitHub Pages + Render deployment wiring | Partial (secrets/disk/TURN must be set in host) |

## What is still development-only / limited

- `USE_MOCK_STORAGE=true` in-memory rooms/chat/auth (explicit flag only)
- Ephemeral QEV screen-share pairing rooms on `/ws` (invite TTL, not durable accounts)
- Group voice / SFU (not implemented; UI states 2-person P2P limit)
- PostgreSQL multi-instance backend (migrations are SQLite; Postgres URL rejected until adapter lands)
- Application-level E2E encryption for chat (not claimed)
- Permanent TURN secrets must not be baked into the Vite bundle

## Local development

Requires Node.js 22+ and pnpm.

```bash
pnpm install
cp apps/relay/.env.example apps/relay/.env
cp apps/web/.env.example apps/web/.env
pnpm seed:dev
pnpm dev
```

Seeded local user (development only):

```txt
email:    dev@qev.local
password: dev-password-123
```

Run pieces separately:

```bash
pnpm --filter @qev-workspace/relay dev
pnpm --filter @qev-workspace/web dev
```

Default URLs:

```txt
web:   http://localhost:5173
relay: http://localhost:8787
ws:    ws://localhost:8787/ws
```

## Tests

```bash
pnpm test:auth          # web unit + relay auth/room/chat integration
pnpm test:rooms         # browser room persistence
pnpm test:chat          # mock unit + browser chat
pnpm test:voice         # two-browser real WebRTC
```

## Deploy model

- **GitHub Pages**: static web app (`VITE_API_URL`, `VITE_AUTH_API_URL`, `VITE_RELAY_URL`)
- **Render**: relay API + WebSockets + SQLite path
- **TURN**: required for reliable production voice
- See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Token model

- Access JWT in `localStorage` key `qev_token` (≈15 minutes, claims: `sub`, `email`, `name`, `iat`, `exp`, `iss`, `aud`, `jti`)
- Refresh token in `HttpOnly; Secure; SameSite=Lax` cookie `qev_refresh` with server-side rotation and reuse detection
- XSS risk: do not render untrusted HTML; chat content is text-only React children

## Safety boundary

Every privileged remote-control action must be visible, intentional, scoped, revocable, and logged. See `CONSENT_MODEL.md`, `SECURITY.md`, and `THREAT_MODEL.md`.

## Non-goals (early milestones)

- No unattended access in v1
- No silent background control
- No hidden service install
- No credential capture
- No remote shell
- No privilege escalation
- No default screen recording
- No persistence mechanism for remote control access
