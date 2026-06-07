# Consent Model

QEV Workspace is built around active consent.

## Session lifecycle

1. Host creates a session.
2. Host receives a short-lived session code.
3. Guest joins using the code.
4. Both sides see identity information.
5. Host chooses whether to share screen.
6. Host chooses whether to grant control.
7. Host may pause/revoke/end at any time.
8. Session ends automatically on disconnect or expiry.

## Consent requirements

Viewing and control are separate permissions.

```txt
Screen sharing does not imply control.
Mouse control does not imply keyboard control.
Keyboard control does not imply clipboard access.
File transfer is offer/accept, not automatic sync.
```

## UI requirements

During any active session, the host must see:

- Peer display name/device name
- Current permissions
- Session timer
- Pause control
- End session control
- Audit status

During remote control, the host must see a stronger indicator:

```txt
Remote control active: [Guest Name] can control this device.
[Pause Control] [End Session]
```

## Forbidden UX patterns

- Hiding active connection state
- Tiny-only tray indicators
- Auto-accepting control
- Persisting screen permission
- Persisting control permission
- “Remember this controller” in v1
- Keyboard control bundled with screen share
- Silent clipboard sync
