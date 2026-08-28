# QEV Workspace: Trusted Action Rooms Strategy

## Document control

| Field | Value |
|---|---|
| Classification | DOCUMENT |
| Goal | Make QEV Workspace materially better than Discord and Microsoft Teams for a defined class of collaboration |
| Repository | `TheArtOfSound/qev-workspace` |
| Baseline branch | `main` |
| Baseline commit | `ed58a343d6a05090107b385555824e2855bf66d7` |
| Baseline verification | Repository assertion: `main` and the recorded commit compare as identical, with zero commits ahead or behind |
| Commit timestamp | 2026-06-23T04:55:22Z |
| Assumption | The repository already contains application code and should be extended or repaired rather than replaced |
| Verification method | `repository_assertion` |

This document records the verified `main` baseline only. Work on later or unmerged branches is outside this baseline unless separately reconciled and verified.

## Executive judgment

QEV Workspace will not become better than Discord or Teams by cloning their feature lists. That approach would produce a weaker copy with years of missing integrations, reliability work, moderation systems, mobile polish, and organizational administration.

The viable path is to define a category where the existing QEV architecture has a structural advantage:

> **QEV Workspace should become the trusted action room: a consent-native workspace where people can communicate, show, act, and prove what happened without losing control of their device or data.**

The product should combine durable room communication with live collaboration, explicitly scoped remote actions, cryptographic identity, revocable permissions, and an evidence trail. Communication is not the endpoint. Communication should turn into safe, observable action inside the same room.

A concise product expression is:

> **Talk. Show. Act. Prove.**

This is narrower than “replace every chat and meeting product,” but it is stronger. QEV can become the preferred workspace for cross-organization support, pair debugging, technical onboarding, incident coordination, sensitive collaboration, and any session where one person may need to inspect or act on another person’s device with explicit consent.

## Verified repository baseline

### Detected stack

| Layer | Detected technology | Repository evidence |
|---|---|---|
| Monorepo | pnpm workspaces across `apps/*` and `packages/*`; package manager pinned to pnpm 9.15.0 | `pnpm-workspace.yaml`, root `package.json` |
| Primary language | TypeScript 5.8 across browser, relay, protocol, crypto, and desktop frontend packages | Root and package-level `package.json` files |
| Web client | React 19, React DOM 19, Vite 6, TypeScript | `apps/web/package.json` |
| Realtime relay | Node.js, Fastify 5, `@fastify/websocket`, TypeScript, `tsx` development runner | `apps/relay/package.json` |
| Live media direction | Browser WebRTC screen-sharing MVP with WebSocket signaling | `README.md` |
| Shared contracts | Dedicated TypeScript protocol package | `packages/protocol/package.json` |
| Cryptographic boundary | Dedicated crypto package depending on the shared protocol package | `packages/crypto/package.json` |
| Native host | Tauri 2.8 with a React/Vite frontend and Rust toolchain | `apps/host-desktop/package.json`, `.github/workflows/host-desktop-release.yml` |
| Web CI | GitHub Actions on pushes to `main` and pull requests | `.github/workflows/web.yml` |
| Web deployment | Static GitHub Pages deployment from `apps/web/dist` | `.github/workflows/pages.yml` |
| Relay deployment reference | Hosted relay configured as `wss://qev-workspace.onrender.com/ws` | `.github/workflows/web.yml`, `.github/workflows/pages.yml` |
| Desktop distribution | macOS DMG build and prerelease publication through GitHub Releases | `.github/workflows/host-desktop-release.yml` |
| Testing | Playwright plus repository smoke and audit scripts | Root `package.json` |
| License | MIT | `LICENSE` |
| Secret/build hygiene | Environment files, logs, build output, caches, and Tauri targets ignored | `.gitignore` |

### Existing product strengths

1. **Consent is already a product primitive.** Viewing, mouse control, keyboard control, clipboard access, and file transfer are explicitly separated. This is a better foundation than treating remote capability as one broad role. Evidence: `CONSENT_MODEL.md`.
2. **Privileged actions have defined safety properties.** The repository requires explicit request, explicit grant, visible activity, time limits, instant revocation, and audit logging. Evidence: `SECURITY.md`.
3. **The threat model is concrete.** It names session hijacking, cross-room leakage, permission overreach, hidden control, relay inspection, clipboard leakage, and malware delivery. Evidence: `THREAT_MODEL.md`.
4. **The relay is not treated as a confidentiality authority.** The trust model limits the relay to availability and routing and calls for transport protection plus identity binding. Evidence: `THREAT_MODEL.md`.
5. **The architecture already spans browser and native execution.** The web client can handle communication and WebRTC while the Tauri/Rust host can enforce operating-system permissions and input control. Evidence: `README.md`, `apps/host-desktop/package.json`, `.github/workflows/host-desktop-release.yml`.
6. **The repository already has CI, deployment, smoke checks, and release automation.** This is an application foundation, not an empty concept repository. Evidence: root `package.json` and the reviewed workflows.

### Baseline weaknesses and unresolved gaps

The following capabilities are **not established by the reviewed `main` baseline**. This wording is intentional: absence of evidence in the verified baseline is not a claim about unmerged branches.

- Durable user accounts, authentication, organizations, membership roles, or guest policy
- Durable room and message persistence across relay restarts
- Message pagination, unread state, mentions, notifications, search, threads, reactions, or attachments
- Multiparty voice/video infrastructure and media quality controls
- Production TURN and SFU topology
- Enterprise administration, SSO, retention policy, export, legal hold, or audit administration
- Mobile clients
- Moderation and abuse-reporting systems for large public communities
- Production cryptographic review sufficient for public trust claims
- Signed and notarized desktop installers
- A measured availability, latency, recovery, or capacity target

There is also documentation drift. `apps/desktop/README.md` describes a future placeholder, while the verified repository contains `apps/host-desktop`, a Tauri package, and a macOS release workflow. The product documentation must be updated when implementation reality changes.

## Strategic definition of “better”

“Better” must be measurable and tied to a user job. QEV should aim to be better on six axes.

### 1. Faster movement from discussion to resolution

A user should not need to leave the room, open a separate remote-support product, exchange a second code, restate context, and then return to chat. The room should already contain the conversation, participants, screen-share state, permission grants, files, decisions, and audit record.

### 2. More precise trust

Permissions should be capability grants, not vague roles. “Can view this screen for ten minutes” is different from “can control the mouse,” “can type,” “can offer a file,” or “can read room history.” The host and the system must enforce those differences.

### 3. Stronger evidence

Important collaboration should produce durable, inspectable evidence:

- Who joined
- Which device identity was used
- What permission was requested
- Who granted it
- When it became active
- When it expired or was revoked
- Which files were offered and accepted
- Which decisions were recorded
- Whether the room history or audit receipt was altered

### 4. Lower-friction external collaboration

The product should be exceptionally good when participants do not share an employer, tenant, or existing account system. A guest should be able to join a narrowly scoped room without receiving broad access to an organization.

### 5. Better privacy and ownership

QEV should minimize unnecessary server trust, keep high-risk secrets and device keys local, make retention explicit, and support local or customer-controlled audit evidence. Private does not mean ephemeral by default; it means the user understands where data lives, how long it lives, and who can access it.

### 6. Simpler operational truth

The interface must always answer four questions without interpretation:

1. Who is here?
2. What can each participant currently do?
3. What is happening now?
4. How do I stop it immediately?

## Product model

The durable product should use the following core entities rather than a loose collection of screens.

| Entity | Responsibility |
|---|---|
| Identity | Represents a person and their cryptographically bound device identities |
| Organization | Optional administrative boundary for policies, billing, roles, and retention |
| Room | Durable collaboration context with membership, history, active sessions, and policy |
| Membership | Defines a participant’s relationship to a room without granting hidden device capabilities |
| Message | Durable room communication with stable ID, sender, timestamp, ordering, and edit/delete policy |
| Session | Time-bounded live connection inside a room |
| Permission grant | Explicit capability, issuer, holder, scope, epoch, expiry, and revocation state |
| Artifact | File, screenshot, transcript export, decision record, or other offered/accepted object |
| Action event | An observable event such as joining, sharing, requesting control, granting control, or ending a session |
| Audit receipt | Tamper-evident record of security-relevant room and session events |

Membership roles and device-control permissions must remain separate. A room administrator must not automatically gain control of another participant’s device.

## UX doctrine

### One room, one operational surface

The primary room view should combine:

- Room timeline and messages
- Participant and presence state
- Live call or screen-share surface
- Permission and trust state
- Files, decisions, and action records
- A persistent emergency stop when privileged actions are active

Do not scatter the user across disconnected chat, call, remote-control, and audit applications.

### Progressive capability

The default room should be safe and simple. Higher-risk capability appears only when requested:

1. Join room
2. Communicate
3. Offer screen share
4. Request a narrowly scoped capability
5. Grant with clear duration and consequences
6. Display active state continuously
7. Revoke instantly
8. Record the result

### No fake-success states

A UI may show an action as successful only after the authoritative layer confirms it. Examples:

- A message is “sent” after the server accepts and identifies it.
- A participant is “connected” after realtime membership is confirmed.
- Control is “active” after the native host validates the current permission epoch.
- A file is “transferred” after the receiver verifies completion and integrity.
- An audit receipt is “verified” only after its integrity check passes.

## Architecture direction: extend the existing system

The next architecture should preserve the monorepo and extend its current boundaries.

### `apps/web`

Extend the React/Vite client into the durable room shell:

- Authentication and guest entry
- Room list and room view
- Durable timeline
- Presence and unread state
- Threads, reactions, mentions, attachments, and search
- Voice/video and screen share
- Permission requests and visible grant state
- Audit and decision views

### `apps/relay`

Evolve the Fastify service into the initial API and realtime gateway rather than introducing an unrelated backend immediately:

- Authenticated HTTP APIs
- Realtime room events
- Membership and authorization checks
- Message acceptance and fan-out
- Session signaling
- Idempotency and ordering controls
- Rate limits and abuse controls

As scale grows, media, durable APIs, and realtime fan-out may become separate services, but the first production step should retain coherent contracts and avoid premature fragmentation.

### `packages/protocol`

Make this the canonical event and capability contract:

- Versioned room events
- Stable message and event IDs
- Permission-grant schemas
- Error codes
- Idempotency keys
- Ordering fields
- Audit event types
- Compatibility rules

### `packages/crypto`

Keep identity, key handling, transcript protection, and audit-receipt verification behind explicit interfaces. Do not make public security claims until the implementation and protocol receive production cryptographic review.

### `apps/host-desktop`

Use the Tauri/Rust host as the enforcement boundary for privileged device actions:

- Screen capture
- Mouse and keyboard injection
- Operating-system permission onboarding
- Permission-epoch validation
- Permanent active-control indicator
- Emergency stop
- Local key storage
- Local audit persistence
- Signed update path

The browser may request control; the native host must independently verify that control is currently allowed.

### Durable infrastructure to add

These are extensions of the product, not unrelated domains:

- A durable relational data store for users, rooms, memberships, messages, grants, and audit metadata
- Object storage for accepted files and room artifacts
- A realtime fan-out mechanism for multi-instance delivery and presence
- TURN infrastructure and, when multiparty calls require it, an SFU media service
- Search indexing after message and permission semantics are stable
- Monitoring, alerting, backups, and recovery procedures

## Delivery roadmap

### Phase 1: Durable room core

Build the minimum collaboration system that survives process and browser restarts.

Deliverables:

- Authentication plus narrowly scoped guest access
- Durable rooms and memberships
- Durable messages with stable IDs
- Pagination and deterministic ordering
- Realtime delivery through WebSocket events
- Presence, reconnect, unread counts, and basic mentions
- Server-side authorization on every room operation
- Database migrations and restart-safe tests

Exit criteria:

- Two independent clients can exchange messages in the same room.
- A client in another room receives nothing.
- Messages remain after browser, API, and realtime process restarts.
- Duplicate submissions do not create duplicate messages.
- Unauthorized room reads and writes fail in integration tests.

### Phase 2: Communication completeness

Add the collaboration primitives users expect before asking them to consolidate tools.

Deliverables:

- Threads and replies
- Reactions and mentions
- Attachments with offer/accept policy
- Search
- Notifications and unread navigation
- One-to-one and small-group voice/video
- Screen sharing
- Connection-quality and device controls
- Accessible keyboard and screen-reader behavior

Exit criteria:

- Core room communication works without leaving QEV.
- Three-client media and reconnect tests pass.
- File and message authorization is enforced across organizations and guests.
- Accessibility tests cover the primary room workflow.

### Phase 3: Trusted action layer

This is the category-defining phase.

Deliverables:

- Explicit view, mouse, keyboard, clipboard-offer, and file-offer grants
- Permission epochs and monotonic control-event counters
- Native host enforcement
- Visible active-control state
- Emergency stop
- Time-bounded grants
- Tamper-evident audit receipts
- Session decision and resolution records

Exit criteria:

- Revocation blocks the next privileged event and cannot be bypassed by stale messages.
- Every privileged event is linked to an active grant and audit event.
- The relay cannot silently grant device capability.
- Cross-room, replay, expiry, and disconnect tests pass.
- The host remains visibly controlled for the full duration of control.

### Phase 4: Team and enterprise operation

Deliverables:

- Organizations, teams, and role policy
- Guest and cross-organization controls
- SSO and lifecycle provisioning where required
- Retention, export, legal hold, and administrative audit views
- Policy-controlled file and clipboard behavior
- Signed and notarized desktop releases
- Managed updates and rollback
- Reliability objectives and incident response procedures

Exit criteria:

- Administrative policy never silently overrides end-user device consent.
- Retention and deletion behavior is testable and documented.
- Installer signatures and update integrity are independently verifiable.
- Backup restoration and regional failover exercises succeed.

### Phase 5: Category leadership

Build features that make the room operationally smarter rather than merely busier.

Deliverables:

- Structured decisions, approvals, tasks, and resolutions in the room timeline
- Reusable room templates for support, incident response, onboarding, and pair work
- Verified session summaries derived from room events
- Public APIs and extensions constrained by the same permission model
- Customer-controlled evidence export and verification

Exit criteria:

- A completed room can explain what was decided, what was done, who authorized it, and how to verify the evidence.
- Extensions cannot exceed the permissions granted to their identity.
- Users measurably complete target workflows with fewer context switches and less time than the multi-tool alternative.

## Target product metrics

These are targets, not current claims.

| Metric | Target |
|---|---|
| Guest time to useful room state | Under 60 seconds without broad organizational access |
| Regional text-message delivery | p95 under 500 ms after server acceptance |
| Realtime reconnect | Under 3 seconds for ordinary transient disconnects |
| Control revocation propagation | Host enforcement within 250 ms locally and 500 ms end-to-end under normal network conditions |
| Cross-room leakage | Zero in automated isolation and adversarial tests |
| Privileged action audit coverage | 100% of accepted privileged actions linked to an active grant and audit event |
| Durable message loss | Zero acknowledged messages lost during tested single-process restart scenarios |
| Accessibility | Primary room flow meets WCAG 2.2 AA acceptance checks |
| Release integrity | Signed desktop artifacts with reproducible verification instructions |

## Immediate implementation order

1. Reconcile all post-baseline room and chat work with this verified `main` baseline.
2. Replace development-session memory storage with a durable repository-backed data adapter and migrations.
3. Introduce user, device, guest, room, membership, message, and event identifiers with stable schemas.
4. Move message delivery to authenticated realtime room events while keeping HTTP retrieval and pagination.
5. Add room isolation, authorization, restart persistence, ordering, and idempotency tests before adding more UI.
6. Add presence, reconnect, unread state, mentions, and notifications.
7. Add attachments with explicit offer/accept behavior and integrity metadata.
8. Integrate screen sharing into the durable room rather than a separate session-only surface.
9. Connect permission grants to the native host and enforce permission epochs.
10. Build visible control state, emergency stop, and audit receipts before expanding control capability.
11. Sign and notarize desktop builds before positioning the host as production-ready.
12. Update `README.md` and `apps/desktop/README.md` so documentation matches the implemented host architecture.

## Repository evidence checklist

Every checklist item records evidence rather than relying on an assertion without a source.

| Status | Checklist item | Evidence |
|---|---|---|
| Complete | Record the requested `main` commit | Repository comparison reports `main` identical to `ed58a343d6a05090107b385555824e2855bf66d7`; commit object exists and is timestamped 2026-06-23T04:55:22Z |
| Complete | Confirm existing application code | `README.md` records web, relay, desktop, protocol, and crypto components; package manifests contain build/dev scripts and dependencies |
| Complete | Detect the browser stack | `apps/web/package.json`: React 19, React DOM 19, Vite 6, TypeScript |
| Complete | Detect the relay stack | `apps/relay/package.json`: Fastify 5, `@fastify/websocket`, Node/TypeScript execution |
| Complete | Detect the native stack | `apps/host-desktop/package.json` and release workflow: Tauri 2.8, Rust, React/Vite, macOS DMG |
| Complete | Record CI and deployment paths | `.github/workflows/web.yml`, `.github/workflows/pages.yml`, `.github/workflows/host-desktop-release.yml` |
| Complete | Record consent and security constraints | `CONSENT_MODEL.md`, `SECURITY.md`, `THREAT_MODEL.md` |
| Complete | Record licensing | `LICENSE`: MIT |
| Complete | Prefer extension over greenfield replacement | Architecture direction maps each proposed responsibility to existing `apps/web`, `apps/relay`, `packages/protocol`, `packages/crypto`, and `apps/host-desktop` boundaries |
| Complete | Avoid fake-success logic | UX doctrine requires authoritative confirmation before sent, connected, controlled, transferred, or verified states are shown |
| Complete | Avoid unrelated product domains | Scope remains room communication, media, remote collaboration, permission enforcement, audit evidence, administration, and required infrastructure |
| Complete | Identify documentation drift | `apps/desktop/README.md` describes a future placeholder while `apps/host-desktop` and its DMG release workflow are present |

## Engineering acceptance ledger

The baseline status is explicit. An unchecked capability must not be marketed as complete.

| Capability | Baseline status | Evidence at baseline | Evidence required for completion |
|---|---|---|---|
| Durable rooms and memberships | Not established | No reviewed baseline evidence of durable room storage | Schema/migrations, API tests, restart persistence test, authorization tests |
| Durable chat | Not established | Current milestone describes session lobby and WebRTC, not durable messaging | Message IDs, persistence, pagination, ordering, idempotency, two-client UI test |
| Realtime presence and unread state | Not established | No reviewed baseline evidence | Multi-client presence/reconnect tests and unread-state integration tests |
| Multiparty voice/video | Not established | Browser screen-sharing direction only | Three-client media test, TURN/SFU failure tests, device and quality controls |
| Permission-separated remote action | Designed, not fully proven | Consent, security, and threat documents define the model | Native enforcement tests for view/mouse/keyboard/clipboard/file grants and epochs |
| Instant revocation | Required, not fully proven | Security and consent documents require revocation | End-to-end stale-event and post-revocation negative tests with latency measurement |
| Tamper-evident audit evidence | Designed, not fully proven | Local audit and append-only direction in repository documents | Integrity format, verification tool, tamper tests, export/restore tests |
| Production cryptographic trust claims | Not approved | `SECURITY.md` explicitly requires review | Independent protocol/implementation review and resolved findings |
| Signed desktop distribution | Not established | Release notes state preview build is not signed/notarized | Signature/notarization checks and documented verification |
| Enterprise administration | Not established | No reviewed baseline evidence | Policy model, SSO/lifecycle integration tests, retention/export tests |
| Production reliability | Not established | Build/deploy workflows exist but no SLO evidence | Load tests, monitoring, backup restore, failure injection, incident runbook |
| Documentation consistency | Failing | Desktop placeholder documentation conflicts with implemented host package/workflow | Documentation CI or release checklist proving architecture docs match shipped components |

## Risks and stop conditions

1. **Feature-parity trap:** Stop any roadmap that prioritizes dozens of shallow chat features before durable identity, authorization, ordering, and room isolation are correct.
2. **Consent dilution:** Do not let organization roles silently become device-control grants.
3. **Browser-only overreach:** Do not claim safe operating-system control if the native host is not independently enforcing grants.
4. **Ephemeral-backend overclaim:** Do not market development-session memory as durable collaboration.
5. **Security theater:** Do not label audit, encryption, verification, or identity as proven when the authoritative check has not run.
6. **Infrastructure fragmentation:** Do not split into many services before the shared protocol and operational requirements are stable.
7. **Documentation drift:** Do not release architecture-affecting changes without updating the baseline documents.

## Final direction

QEV should not be “another place to chat.” It should be the place where communication can safely become action.

Discord-like immediacy and Teams-like organization are supporting capabilities. The category-defining product is a room where identity is visible, permissions are precise, remote action is reversible, evidence is durable, and no participant has to surrender control to collaborate effectively.
