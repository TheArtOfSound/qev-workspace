# Audit Log

The audit log records session-level security events. It must not record private screen contents, passwords, typed text, or file contents.

## Event shape

```json
{
  "eventId": "audit_...",
  "sessionId": "sess_...",
  "type": "audit.screen_share_started",
  "actorDeviceId": "dev_...",
  "peerDeviceId": "dev_...",
  "timestamp": "2026-06-07T00:00:00.000Z",
  "metadata": {}
}
```

## Required events

- Session created
- Peer joined
- Peer identity confirmed
- Screen sharing started
- Screen sharing stopped
- Control requested
- Control granted
- Control paused
- Control revoked
- File offered
- File accepted
- File rejected
- Session ended

## Integrity direction

Local append-only logs should eventually be chained:

```txt
event_hash = hash(previous_event_hash + canonical_json(event))
```

This creates tamper evidence without storing sensitive content.
