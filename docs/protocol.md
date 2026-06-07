# Protocol

## Message envelope

All protocol messages use an envelope:

```json
{
  "type": "room.create",
  "sessionId": "sess_...",
  "roomCode": "QEV-1234-ALPHA",
  "senderDeviceId": "dev_...",
  "counter": 1,
  "sentAt": "2026-06-07T00:00:00.000Z",
  "payload": {}
}
```

## Relay messages

```txt
room.create
room.created
room.join
room.joined
room.peer_joined
signal.offer
signal.answer
signal.ice
session.end
error
```

## Permission messages

```txt
permission.request
permission.grant
permission.revoke
permission.expired
```

## Audit messages

```txt
audit.session_created
audit.peer_joined
audit.screen_share_started
audit.screen_share_stopped
audit.control_requested
audit.control_granted
audit.control_revoked
audit.session_ended
```

## Remote control messages, future desktop agent only

```txt
control.intent.mouse_move
control.intent.mouse_click
control.intent.key_down
control.intent.key_up
```

Every control intent must include:

```txt
sessionId
senderDeviceId
permissionEpoch
monotonicCounter
normalized target coordinates where applicable
```

The receiving desktop agent must reject stale epochs, expired grants, revoked grants, malformed coordinates, and replayed counters.
