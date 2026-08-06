# Deployment

## Architecture

| Surface | Host | Notes |
| --- | --- | --- |
| Web app | GitHub Pages | Static Vite build under `/qev-workspace/` |
| API + WebSocket relay | Render (`qev-workspace`) | Fastify HTTP + `/ws` + `/ws/audio` |
| Database | SQLite on Render disk (current) | `SQLITE_PATH=/var/data/qev-workspace.sqlite` |

PostgreSQL (`DATABASE_URL=postgres://…`) is the preferred multi-instance database; this production pass ships a durable SQLite path with tracked migrations. A Postgres adapter is not enabled yet—startup fails clearly if a postgres URL is supplied.

## Required production secrets (Render)

Set these in the Render dashboard (never commit values):

| Variable | Required | Purpose |
| --- | --- | --- |
| `JWT_SIGNING_SECRET` | **yes** (≥32 chars) | HS256 access-token signing |
| `SQLITE_PATH` | yes (or future Postgres) | Durable DB file path |
| `USE_MOCK_STORAGE` | must be `false` | Disables in-memory mocks |
| `MOCK_AUTH_ENABLED` | must be `false` | Disables mock login |
| `ALLOWED_ORIGINS` | yes | CORS allowlist (no `*` with credentials) |
| `WEB_ORIGIN` | recommended | Primary web origin |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | recommended | NAT traversal for voice |
| `JWT_ISSUER` / `JWT_AUDIENCE` | recommended | Token binding |

## Required web build variables (GitHub Actions / Pages)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | HTTPS API base (e.g. `https://qev-workspace.onrender.com`) |
| `VITE_AUTH_API_URL` | Auth API base (usually same as API) |
| `VITE_RELAY_URL` | WSS relay URL (e.g. `wss://qev-workspace.onrender.com/ws`) |
| `GITHUB_PAGES=true` | Sets Vite base path `/qev-workspace/` |

Production builds **must not** fall back to `https://example.com/api/login`.

## Local development

```bash
pnpm install
cp apps/relay/.env.example apps/relay/.env
cp apps/web/.env.example apps/web/.env
pnpm seed:dev   # creates dev@qev.local / dev-password-123
pnpm dev
```

Default URLs:

- Web: `http://localhost:5173`
- API/health: `http://localhost:8787/health`
- WebSocket: `ws://localhost:8787/ws`
- Voice signaling: `ws://localhost:8787/ws/audio`

Development may set `USE_MOCK_STORAGE=true` to exercise the legacy in-memory modules. Production startup refuses that flag.

## Migrations

Migrations live in `apps/relay/src/db/migrations/` and are applied automatically on relay boot when mock storage is disabled.

```bash
pnpm migrate
```

## Health checks

```bash
curl -sS https://qev-workspace.onrender.com/health
```

Expected shape:

```json
{ "ok": true, "service": "qev-workspace-relay", "storage": "sqlite", ... }
```

## Known hosting constraints

1. **Render free tier disks** may not be available on every plan. Without a persistent disk, SQLite data is lost on redeploy. Attach a disk at `/var/data` or move to managed Postgres before claiming full production durability.
2. **TURN** is required for reliable voice across restrictive NATs. STUN-only is insufficient for many networks.
3. **Voice** remains two-person P2P (server-enforced). Group voice needs an SFU.
4. **Access tokens** are stored in `localStorage` (`qev_token`) for SPA compatibility. XSS must be prevented; refresh tokens use `HttpOnly` cookies.
