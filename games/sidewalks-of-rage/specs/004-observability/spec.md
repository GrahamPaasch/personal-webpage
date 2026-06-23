# Feature Specification: Observability & Analytics

**Feature Branch**: `004-observability`

**Created**: 2026-06-23

**Status**: Largely implemented (server `/stats` + logging + persisted metrics + page analytics
shipped; admin dashboard + ad metrics are follow-ups). See "Status" at the bottom.

**Input**: We have no visibility into whether anyone is playing. Add lightweight, privacy-respecting
visibility — page traffic, live concurrency, and basic gameplay aggregates — so we can tell if the
game is alive, size the audience, and (later) price the ad inventory. This is core infra for the
24/7 / thousands-of-players / ad-funded vision (see [VISION.md](../../VISION.md)), not polish.

## Critical context: the hosting dependency

Vercel serves only the **static client**; it cannot host the persistent WebSocket server. So
server-side metrics (concurrency, rounds, kills) only produce real numbers once `server/index.js`
is deployed to a persistent host (Phase 1 of [005 — server hosting], to be specced). Until then,
the live site runs single-player (graceful degradation) and `/stats` is reachable only where the
server runs. **Page analytics works today regardless.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know if anyone is loading the game (Priority: P1)
As the owner, I can see page visits/traffic to the game without any server, so I know whether the
deploy is getting played at all.
**Independent Test**: Enable Web Analytics in Vercel; load the game page; see the visit in the
Vercel Analytics dashboard.
**Acceptance**: 1. The game page includes the analytics beacon. 2. Visits appear in the dashboard.
3. No PII is collected (the game has no accounts).

### User Story 2 - See live concurrency + gameplay aggregates (Priority: P2)
As the owner/operator, I can query the running server for current players (total + per faction),
the battle line, and cumulative metrics (peak concurrency, total connections / rounds / kills), so I
can monitor health and audience size.
**Independent Test**: With the server running, `GET /stats` returns JSON with those fields; `GET
/health` returns ok.
**Acceptance**: 1. `/stats` reflects live concurrency and faction split. 2. Peak/totals persist
across restarts. 3. `/health` is a cheap liveness probe for the host. 4. Structured JSON events
(`join`/`leave`/`round_end`/`server_start`) are logged for aggregation.

### Edge Cases
- Server not deployed → `/stats` unreachable; page analytics still works (degrades cleanly).
- Corrupt persisted metrics → fall back to zero, never crash boot (same guard as game state).
- Cross-origin polling → `/stats` sends permissive CORS so a dashboard/site can read it.

## Requirements *(mandatory)*
- **FR-001**: The game page MUST emit a privacy-respecting page-visit beacon (no accounts/PII).
- **FR-002**: The server MUST expose `GET /stats` (JSON: concurrent, per-faction, battleLine,
  globalScore, peakConcurrent, totalConnections, totalRounds, totalKills, uptimeSec).
- **FR-003**: The server MUST expose `GET /health` returning a cheap liveness response.
- **FR-004**: Peak concurrency and cumulative totals MUST persist across server restarts.
- **FR-005**: The server MUST emit structured one-line JSON events for join/leave/round-end/start.
- **FR-006**: `/stats` MUST be safe to expose publicly (no secrets/PII) and CORS-readable.
- **FR-007**: Observability MUST add no runtime dependency to the game client and not change
  gameplay (Constitution V; the ws server gains only an HTTP surface on the same port).

## Success Criteria *(mandatory)*
- **SC-001**: Page visits to the game are visible in an analytics dashboard after enablement.
- **SC-002**: `GET /stats` returns accurate live concurrency + faction counts (verified by test).
- **SC-003**: Peak/total metrics survive a restart.
- **SC-004**: A log aggregator can chart sessions/concurrency from the structured events.
- **SC-005**: No gameplay behavior change; `npm run check` stays green.

## Assumptions
- Analytics = Vercel Web Analytics (site is on Vercel); Plausible is an alternative. Enablement is
  a dashboard toggle (out of code's control).
- Server metrics become meaningful only once the ws server is hosted (see hosting spec).
- A visual admin dashboard and ad-impression metrics are follow-ups, not part of this slice.

## Status (2026-06-23)
- ✅ FR-001: `/_vercel/insights/script.js` beacon added to `index.html` (needs dashboard enable).
- ✅ FR-002/003/006: `GET /stats` + `/health` on the ws server (CORS-open), with `test-stats.mjs`.
- ✅ FR-004: peak/totals persisted in `server/state.json`.
- ✅ FR-005: structured `join`/`leave`/`round_end`/`server_start` JSON logs.
- ⬜ Follow-up: minimal admin dashboard page that polls `/stats`; ad-impression metrics (Phase 4).
- ⬜ Dependency: deploy the ws server (next: server-hosting spec) for the numbers to be live.
