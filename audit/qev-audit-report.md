# QEV Workspace Audit Report

Generated: 2026-06-08T18:03:51.316Z

## Summary

- PASS: 16
- WARN: 0
- FAIL: 0

**Gate:** PASS — no required audit checks failed.

## Checks

| Status | Area | Check | File | Why | Missing |
|---|---|---|---|---|---|
| PASS | Build system | root-build-and-typecheck-scripts | `package.json` | The repo needs repeatable commands for build and type validation. | — |
| PASS | Web build | web-vite-and-tsc-scripts | `apps/web/package.json` | The web app must have a deterministic Vite build and TypeScript check. | — |
| PASS | React mount | index-root-and-main-entry | `apps/web/index.html` | A blank page often starts with a missing root mount or wrong Vite entry. | — |
| PASS | Crash protection | render-error-boundary | `apps/web/src/main.tsx` | The app should show a useful render failure instead of a blank black screen. | — |
| PASS | Core crypto | app-layer-aes-gcm | `packages/crypto/src/index.ts` | QEV private app data depends on peer-derived AES-GCM encryption. | — |
| PASS | Private peer data | webrtc-private-data-channel | `apps/web/src/webrtc.ts` | Encrypted chat, private proof, and control intents require a peer data channel. | — |
| PASS | Media capability truth | media-privacy-detection | `apps/web/src/mediaPrivacy.ts` | The UI must honestly distinguish WebRTC transport encryption from QEV frame encryption. | — |
| PASS | Frame crypto | experimental-frame-crypto-failure-mode | `apps/web/src/mediaFrameCrypto.ts` | Experimental frame encryption must fail closed by dropping frames rather than leaking plaintext. | — |
| PASS | Room privacy | room-passphrase-lock | `apps/web/src/App.tsx` | Room passphrases should gate app-layer private data and not ride inside invite links. | — |
| PASS | Safety verification | private-actions-gated | `apps/web/src/App.tsx` | Screen/video/chat/control must not be trusted until the user verifies the safety number. | — |
| PASS | Trusted peers | peer-key-pinning | `apps/web/src/App.tsx` | Known peers should be locally pinned and key changes should warn the user. | — |
| PASS | Private proof | encrypted-private-channel-proof | `apps/web/src/App.tsx` | Users need a simple proof that the app-layer private channel is actually working. | — |
| PASS | Local privacy | encrypted-transcript-export | `apps/web/src/App.tsx` | Transcript export must be encrypted locally and never downloaded as plaintext. | — |
| PASS | Room lifecycle | burn-room-cleanup | `apps/web/src/App.tsx` | Users need a clear way to burn a room and clear stale local session state. | — |
| PASS | User organization | workspace-tabs-and-theme | `apps/web/src/App.tsx` | The app should be navigable by sections and have a visible theme switcher. | — |
| PASS | User organization | section-layout-css | `apps/web/src/styles.css` | Security/control/workspace pages should not collapse into unreadable long-scroll columns. | — |

## Truth Notes

### Media privacy truth

QEV chat/control/transcript data can be app-layer encrypted. Browser video/screen media is WebRTC transport-encrypted unless frame crypto successfully attaches. The UI must not claim frame-level QEV media encryption unless the frame crypto status says attached.

### Relay visibility truth

The relay may still see signaling metadata such as room code, message type, and timing. It should not receive plaintext QEV encrypted chat/control payloads.

### Consent truth

Control must remain explicit, visible, time-limited, and revocable. No silent access, hidden monitoring, or unattended control should be added.

### Passphrase truth

The invite link may include the room code. The room passphrase must be shared separately and used to reject mismatched encrypted app-layer data.

## Next Manual Audit

1. Open the app in two browsers.
2. Create a room.
3. Join from the second browser.
4. Verify the safety number.
5. Start screen/video.
6. Send encrypted chat.
7. Run private-channel proof.
8. Export encrypted transcript and confirm no plaintext chat appears in the JSON.
9. Burn the room and confirm room code, URL, media, chat, grants, and passphrase clear.
