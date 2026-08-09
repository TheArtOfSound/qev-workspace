# Security Policy

QEV Workspace is a consent-first remote workspace. Security issues are treated as product-critical.

## Hard safety rules

The project must not introduce:

- Hidden remote access
- Silent monitoring
- Unauthorized persistence of remote control
- Credential capture
- Unattended access in early milestones
- Remote shell access
- Privilege escalation
- Bypass of operating-system permission prompts

## Authentication & session security

- Passwords are hashed with scrypt (never stored in plaintext).
- Access tokens are short-lived HS256 JWTs (`sub`, `email`, `name`, `iat`, `exp`, `iss`, `aud`, `jti`).
- Refresh tokens are stored as hashes server-side and delivered in `HttpOnly` cookies with rotation and reuse detection.
- Access tokens may be stored in `localStorage` (`qev_token`) for SPA routing; this is XSS-sensitive. The app must never inject untrusted HTML (`dangerouslySetInnerHTML` is forbidden for chat).
- Production requires `JWT_SIGNING_SECRET` from environment secrets (never source control).
- `USE_MOCK_STORAGE` and `MOCK_AUTH_ENABLED` are refused when `NODE_ENV=production`.

## Authorization

Every protected HTTP and voice-signaling operation must verify:

1. Valid access token (or short-lived voice ticket derived from one)
2. User still exists and is not disabled
3. Active room membership
4. Room exists and is not archived

Message sender identity is always derived from the authenticated session, never from client-supplied `sender` fields.

## Transport & voice

- Production HTTP/WebSocket traffic must use HTTPS/WSS.
- WebRTC media is transport-encrypted by the browser. That is **not** application-level E2E encryption of chat history or relay metadata.
- Voice is limited to two P2P participants per room until an SFU is introduced.
- Prefer backend-issued temporary TURN credentials (`GET /api/webrtc/ice`) over static secrets in the frontend bundle.

## Reportable vulnerabilities

Report issues involving:

- Session hijacking / refresh-token reuse failures
- Pairing code reuse
- Cross-room message or signaling delivery
- Permission bypass
- Control after revocation
- Audit log tampering
- Peer identity spoofing
- Relay leakage of private session contents
- XSS or CSRF in the web app
- Secret/key exposure
- Authentication oracle that reveals account existence beyond generic errors

## Design expectation

Every privileged remote-control action must be:

1. Explicitly requested
2. Explicitly granted
3. Visibly active
4. Time-bounded
5. Revocable instantly
6. Written to an audit log

## Cryptography note

This repository defines the crypto and identity boundary. Production cryptography and threat claims must be reviewed before public trust statements are made. Do not claim end-to-end encrypted chat or voice unless application-level encryption has been implemented and tested.
