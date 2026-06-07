# QEV Workspace

QEV Workspace is a consent-first remote workspace for teams.

It is designed for deliberate, visible, permission-based remote support and collaboration. A user can share their screen, grant temporary control, revoke access instantly, and maintain a local audit trail of the session.

QEV Workspace is **not** built for hidden access, silent monitoring, unattended control, credential capture, persistence, or bypassing user consent.

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
  web/       Browser client, public page, and WebRTC screen-share MVP
  relay/     Ephemeral WebSocket signaling relay
  desktop/   Native desktop agent placeholder and implementation notes
packages/
  protocol/  Shared session, permission, and audit message types
  crypto/    QEV integration boundary and browser-safe crypto helpers
docs/
  architecture.md
  protocol.md
  consent-model.md
  threat-model.md
  qev-integration.md
```

## Current milestone

This scaffold targets the first safe milestone:

```txt
public page
+ session-code lobby
+ browser screen sharing
+ WebRTC signaling
+ consent state
+ audit events
```

Remote keyboard/mouse control is intentionally **not** implemented in the browser MVP. That belongs in the native desktop agent after the consent model, permission epochs, emergency-stop UI, and audit log format are stable.

## Local development

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Run pieces separately:

```bash
pnpm --filter @qev-workspace/relay dev
pnpm --filter @qev-workspace/web dev
```

Default URLs:

```txt
web:   http://localhost:5173
relay: ws://localhost:8787/ws
```

## Deploy model

- GitHub Pages: static public page / web app shell
- Cloudflare Workers, Fly.io, or a small VPS: signaling relay
- TURN server later: NAT fallback
- Desktop agent later: true control, platform permissions, emergency-stop overlay

## Non-goals

QEV Workspace will not ship features that create stealth access risk in early versions:

- No unattended access in v1
- No silent background control
- No hidden service install
- No credential capture
- No remote shell
- No privilege escalation
- No default screen recording
- No persistence mechanism for remote access

## Safety boundary

Every session must be visible, intentional, scoped, revocable, and logged.
