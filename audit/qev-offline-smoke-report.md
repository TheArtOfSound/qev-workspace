# QEV Offline Smoke Report

Generated: 2026-06-08T19:59:29.046Z

PASS: 8
FAIL: 0

## Results

| Status | Check | Detail |
|---|---|---|
| PASS | crypto: ECDH identities derive matching AES-GCM session keys | ok |
| PASS | crypto: wrong peer key cannot decrypt payload | ok |
| PASS | protocol: room code, envelope, and safety number are deterministic enough for UI flow | ok |
| PASS | static: private app-data path is wired | ok |
| PASS | static: room lock, safety gate, and trusted peer pinning are wired | ok |
| PASS | static: local privacy export and burn-room cleanup are wired | ok |
| PASS | static: media truth and experimental frame crypto are wired | ok |
| PASS | static: user-facing organization exists | ok |

## Meaning

This proves the cryptographic and source-wiring prerequisites exist before a browser-to-browser runtime test.
It does not prove the live relay, browser media permissions, or two-browser WebRTC negotiation by itself.
