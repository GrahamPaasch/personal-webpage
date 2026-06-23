# Feature Specification: WebSocket Server Hosting

**Feature Branch**: `005-server-hosting`

**Created**: 2026-06-23

**Status**: Config + client wiring shipped; the actual `fly deploy` is a manual step you run (it
needs your Fly account). Runbook in [plan.md](./plan.md).

**Input**: Vercel serves only the static client; it cannot run the persistent WebSocket server. To
have real multiplayer (and real `/stats` numbers), `server/index.js` must live on a persistent host.
This is the unblock for everything multiplayer — and the first concrete slice of the MMO infra in
[VISION.md](../../VISION.md) (Phase 3/4). Research: `.specify/scratch/hosting-research.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real multiplayer on the live site (Priority: P1)
As the owner, I deploy the ws server to an always-on host and the live game page connects to it over
`wss://`, so two browsers anywhere see each other and share the battle line.
**Independent Test**: deploy per the runbook; open the live game in two browsers; confirm they see
each other and the battle line syncs; `curl https://<app>/health` → ok, `/stats` → JSON.
**Acceptance**: 1. Client uses `VITE_WS_URL` (wss) in production, localhost in dev. 2. The host never
scales to zero (live connections aren't dropped while quiet). 3. https page → `wss://` (no mixed
content). 4. If the server is down, the client degrades to single-player (no crash).

## Requirements *(mandatory)*
- **FR-001**: The server MUST be deployable to an always-on host via checked-in config (Dockerfile +
  fly.toml), no code change.
- **FR-002**: The host config MUST NOT scale to zero (`auto_stop_machines="off"`,
  `min_machines_running=1`) — a quiet ws server must stay up.
- **FR-003**: The client production URL MUST be `wss://` via `VITE_WS_URL` (build-time), with a
  localhost dev fallback and a same-host fallback.
- **FR-004**: TLS/wss MUST be handled by the host edge (no app TLS code).
- **FR-005**: A `GET /health` check MUST back the host liveness probe.
- **FR-006**: No secrets in the repo (a ws URL is public; `.env*.local` is gitignored).

## Success Criteria *(mandatory)*
- **SC-001**: After deploy + a rebuild with the right `VITE_WS_URL`, two live browsers share state.
- **SC-002**: The server stays up 24/7 (no scale-to-zero disconnects) and `/health` passes.
- **SC-003**: Cost is a few $/month (single small machine).
- **SC-004**: Server-down degrades to single-player; no client crash.

## Assumptions / Decisions
- **Host: Fly.io** — cheapest managed option that can be made truly always-on; native wss; simple
  `Dockerfile + fly.toml + fly deploy`. (Render Starter $7/mo is the no-CLI runner-up.) Rationale +
  alternatives in the research scratch.
- `server/state.json` is on the machine's local disk — survives in-machine restarts, **lost on
  redeploy** unless a Fly volume is attached (acceptable for a casual leaderboard; see plan.md).
- `VITE_WS_URL` is build-time: moving the server = rebuild the client. Fine for a static deploy.

## Out of scope (later phases)
Multi-region, zones/sharding, interest management, a managed DB for the global meta — all Phase 3
(`VISION.md`). This feature is just "one always-on server the live client can reach."
