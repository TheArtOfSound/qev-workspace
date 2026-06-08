# QEV Live Relay Headless Smoke Report

Generated: 2026-06-08T19:23:50.847Z

Base URL: http://localhost:5173

PASS: 8
FAIL: 0

## Results

| Status | Check | Detail |
|---|---|---|
| PASS | live: load two independent production app contexts | ok |
| PASS | live: browser A creates identity and room through relay | ok |
| PASS | live: browser B creates identity and joins room through relay | ok |
| PASS | live: both browsers establish QEV key with peer | ok |
| PASS | live: safety verification unlocks private actions | ok |
| PASS | live: fake-camera private video starts and peer data channel opens | ok |
| PASS | live: encrypted private-channel proof completes | ok |
| PASS | live: no browser runtime errors | ok |

## Meaning

This test uses two isolated headless Chromium browser contexts, the production web build, the configured live relay, fake camera/mic devices, safety verification, WebRTC media startup, and the encrypted private-channel proof.

A pass means the browser + relay + QEV key + media/data-channel path is actually connecting in automation.

A failure report is still written even when the runner fails early.

Important: this runner serves the local production build from http://localhost:5173 because the hosted relay allowlist accepts that origin. Random 127.0.0.1 ports are expected to fail the relay origin gate.

## Browser Errors

Page errors: none

Console errors: none

## Debug Artifacts

No failure screenshots needed.
