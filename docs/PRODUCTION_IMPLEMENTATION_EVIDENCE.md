# Production implementation evidence

Branch: `agent/productionize-persistent-rooms`  
Base feature head: `0a45a1535c317f3fd3f2b958f876dbb5a7e0a123` (`agent/persistent-room-system` / PR #12)  
Date: 2026-08-05

## Inventory (pre-change)

| Category | Finding |
| --- | --- |
| Production-capable logic | Real WebRTC P2P voice (`getUserMedia`, SDP, ICE), Fastify relay, CORS hooks, History API route guard, GitHub Pages + Render scaffolding |
| Development-only mock logic | `mockAuth.ts` (any email + password ≥8), `mockRooms.ts` / `mockChat.ts` in-memory arrays, unauthenticated `/ws/audio`, production client fallback to `https://example.com/api/login` |
| Missing persistence | No durable users/rooms/messages; data lost on relay restart |
| Missing authorization | Client-supplied `memberId` / `sender`; global room list; no membership checks |
| Missing deployment configuration | No JWT/DB secrets, no auth build env, no migrations, free Render without durable path |
| Missing operational safeguards | No rate limits, refresh rotation, secure headers, production mock refusal |

## Requirement checklist

### 1. Preserve existing implementation

| Status | complete |
| --- | --- |
| Files | Extended `apps/web/src/*` and `apps/relay/src/*`; kept mock modules for `USE_MOCK_STORAGE=true` |
| Description | Did not scaffold a parallel app; production routes replace mock registration only when mock storage is disabled |
| Verification | Manual review of branch diff vs `0a45a15` |
| Remaining risk | Ephemeral `/ws` pairing rooms remain in-memory by design |

### 2. Production authentication

| Status | complete (local/CI); deploy blocked until secrets set |
| --- | --- |
| Files | `apps/relay/src/auth/*`, `apps/web/src/auth.ts`, `Login.tsx`, `App.tsx` |
| Description | `POST /api/auth/register|login|refresh|logout`, `GET /api/auth/me`, scrypt password hashes, HS256 JWT with `sub,email,name,iat,exp,iss,aud,jti`, refresh cookie rotation |
| Commands | `pnpm test:auth` |
| Result | web unit 5/5 pass; relay integration 2/2 pass (2026-08-05) |
| Remaining risk | Access token still in `localStorage` (documented XSS surface) |

### 3. Database persistence

| Status | complete for SQLite path |
| --- | --- |
| Files | `apps/relay/src/db/client.ts`, `migrations/001_initial.sql` |
| Description | Tracked migrations; users, rooms, memberships, messages, refresh_tokens, ws_tickets |
| Commands | `pnpm migrate`; integration test durability within process |
| Result | Migrations apply; messages survive list after create in integration test |
| Remaining risk | Postgres `DATABASE_URL` rejected until adapter lands; Render free disk may be unavailable |

### 4–6. Authorization, rooms, chat

| Status | complete |
| --- | --- |
| Files | `rooms/store.ts`, `rooms/routes.ts`, `chat/store.ts`, `chat/routes.ts`, web `rooms.ts`/`chat.ts`/`ChatBox.tsx` |
| Description | Bearer auth + membership on all durable APIs; sender from token; pagination; no HTML injection |
| Commands | `pnpm --filter @qev-workspace/relay test:auth`; Playwright rooms/chat |
| Result | Integration test proves non-member 403; chat browser test 1/1 pass |

### 7. Voice signaling

| Status | complete for 2-person P2P |
| --- | --- |
| Files | `audio/namespace.ts`, `audioWebrtc.ts`, `VoiceChannel.tsx` |
| Description | Short-lived ticket via `POST /api/voice/ticket`; membership enforced; max 2 participants; ICE via `GET /api/webrtc/ice` |
| Commands | `CI=true QEV_USE_VIRTUAL_MICROPHONE=1 pnpm test:voice` |
| Result | 1/1 pass — both peers `connected`, live remote tracks, mute/unmute, leave |
| Remaining risk | No production TURN configured on host yet; STUN-only fails some NATs |

### 8. Routing / session UI

| Status | complete |
| --- | --- |
| Files | `App.tsx`, `Login.tsx`, `auth.css` |
| Description | Login/register, logout, session bar, reload keeps access token when unexpired |
| Commands | Playwright `tests/auth.integration.spec.ts` |
| Result | 1/1 pass including logout clear |

### 9–10. Deployment & security

| Status | partial |
| --- | --- |
| Files | `render.yaml`, `.github/workflows/*`, `.env.example`, `docs/DEPLOYMENT.md`, `SECURITY.md` |
| Description | Secure headers, CORS credentials, rate limits, production mock refusal, env docs |
| Remaining risk | Live deploy secrets/disk/TURN not verified in this session; do not claim live production success without health + login smoke against deployed hosts |

### 11. Tests

| Suite | Command | Result |
| --- | --- | --- |
| Auth unit | `pnpm --filter @qev-workspace/web test:auth` | 5 pass |
| Auth/room/chat integration | `pnpm --filter @qev-workspace/relay test:auth` | 2 pass |
| Mock chat unit | `pnpm --filter @qev-workspace/relay test:chat` | 2 pass |
| Browser auth/rooms/chat | `CI=true pnpm exec playwright test --config playwright.rooms.config.ts tests/auth.integration.spec.ts tests/rooms.integration.spec.ts tests/chat.integration.spec.ts --workers=1` | 3 pass |
| Browser voice | `CI=true QEV_USE_VIRTUAL_MICROPHONE=1 pnpm test:voice` | 1 pass |
| Typecheck | `pnpm --filter @qev-workspace/relay typecheck && pnpm --filter @qev-workspace/web typecheck` | pass |
| Builds | `pnpm run build:packages && pnpm --filter @qev-workspace/relay build && pnpm --filter @qev-workspace/web build` | pass |

### 12–13. Dev compatibility & docs

| Status | complete |
| --- | --- |
| Files | `seed-dev-user.mjs`, README, DEPLOYMENT, architecture, SECURITY, evidence |
| Description | Seed command refuses production unless `ALLOW_PROD_SEED=true`; mocks behind flag |

## Deployed verification (this session)

| Check | Result |
| --- | --- |
| Workflow run on GitHub | Not yet — pending push |
| Deployed API health | **Not verified** in this session |
| Deployed web load | **Not verified** in this session |
| Production login | **Not verified** in this session |

Do not treat deployment as successful until Render secrets + disk are applied and the health/login smoke commands succeed.

## Remaining limitations

1. Two-person P2P voice only (server + UI enforced).
2. SQLite single-instance; Postgres adapter not implemented.
3. Render free tier may lack persistent disk → data loss on redeploy without paid disk or Postgres.
4. TURN not configured on production host.
5. Access JWT in localStorage (XSS risk documented).
6. Chat live delivery is still poll-based (3s); no authenticated chat WS yet.
7. Live production deploy not smoke-tested in this session.
