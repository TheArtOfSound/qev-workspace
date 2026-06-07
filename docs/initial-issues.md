# Initial GitHub Issues

Create these after the repo exists.

## 1. Define v1 consent and threat model

Lock the rules for screen viewing, control, revocation, session expiry, and audit events.

Acceptance criteria:

- `CONSENT_MODEL.md` finalized
- `THREAT_MODEL.md` finalized
- Forbidden features listed
- Permission names finalized

## 2. Build public GitHub Pages landing page

Deploy the static app shell and docs to GitHub Pages.

Acceptance criteria:

- Pages workflow enabled
- Public app loads
- Safety/non-goal copy visible
- Session UI visible

## 3. Build WebRTC signaling server

Create ephemeral room signaling over WebSocket.

Acceptance criteria:

- Create room
- Join room
- Relay offer/answer/ICE
- Expire stale rooms
- Enforce two-peer room limit

## 4. Build browser screen-share MVP

Enable one user to share a browser-approved screen stream with another.

Acceptance criteria:

- Host creates room
- Guest joins room
- Host shares screen after browser prompt
- Guest sees stream
- Either side can end session

## 5. Add QEV-style device identity envelope

Replace in-memory identity with QEV-backed local secret storage in desktop builds.

Acceptance criteria:

- Device identity interface finalized
- Local key creation implemented
- Private key never leaves local vault

## 6. Add local audit log

Append security-relevant events without recording sensitive content.

Acceptance criteria:

- Event schema implemented
- Session lifecycle events recorded
- Control events ready for future native agent

## 7. Prototype desktop agent

Start Tauri/Rust desktop agent with visible session indicator and emergency stop.

Acceptance criteria:

- App launches
- Shows active/inactive status
- No control functionality until permissions are implemented
