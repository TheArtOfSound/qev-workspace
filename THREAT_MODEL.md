# QEV Workspace Threat Model

## Primary assets

- User screen contents
- User input control
- Session identity
- Device identity keys
- Session permission grants
- Local audit logs
- File-transfer contents, when added

## Primary adversaries

1. Scam operator attempting to trick a user into granting access
2. Malicious authenticated user attempting to exceed granted permissions
3. Network attacker attempting session interception
4. Relay operator attempting to inspect or alter session contents
5. Compromised browser tab attempting cross-session leakage
6. Malware attempting to abuse the desktop agent

## High-risk abuse cases

- Control continues after host revokes access
- Guest joins a room with guessed/reused code
- Relay forwards messages across rooms
- UI hides or minimizes active-control state
- Desktop agent starts with broad OS permissions and no session indicator
- Clipboard sync leaks secrets
- File transfer becomes malware delivery
- Unattended access becomes default behavior

## Required mitigations

- Short-lived single-use pairing codes
- Room-scoped WebSocket membership
- Peer identity binding after join
- Permission epochs for every privileged event
- Monotonic counters on control messages
- Visible active-session banner
- Emergency stop always available
- Local append-only audit log
- Conservative file-transfer UX
- No unattended access in v1

## Permission model

Permissions are explicit grants, not global roles.

```txt
can_view_screen
can_control_mouse
can_control_keyboard
can_offer_clipboard
can_offer_file
```

Every permission has:

```txt
scope
issuer
holder
session_id
permission_epoch
expires_at
revoked_at
```

## Trust statement

The relay should be trusted only for availability and message routing, not confidentiality. Session contents should be protected at the transport layer and, where needed, by application-level encryption and identity binding.
