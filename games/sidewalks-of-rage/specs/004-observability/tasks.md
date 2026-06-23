---
description: "Task list for Observability & Analytics (004)"
---

# Tasks: Observability & Analytics

Most of this slice is implemented; remaining items are follow-ups + the manual dashboard enable.

## Phase 1: Server observability — DONE
- [X] T001 Attach `ws` to a Node http server; add `GET /stats` (concurrent, factions, battleLine, globalScore, peak/total metrics, uptime) + `GET /health`, CORS-open, in server/index.js (FR-002/003/006)
- [X] T002 Add `metrics` counters (peakConcurrent, totalConnections, totalRounds, totalKills); persist in state.json; load on boot with zero-fallback (FR-004)
- [X] T003 Structured JSON event logs: join / leave / round_end / server_start (FR-005)
- [X] T004 `scripts/test-stats.mjs` asserting /health, /stats shape + live concurrency + join log; wired into `npm run check` (SC-002/005)

## Phase 2: Page analytics — DONE (code) / MANUAL (enable)
- [X] T005 Add Vercel Web Analytics beacon to index.html (FR-001)
- [ ] T006 [MANUAL] Enable "Web Analytics" for the project in the Vercel dashboard so visits record (SC-001)

## Phase 3: Follow-ups (not in this slice)
- [ ] T007 Minimal admin dashboard page that polls `/stats` (live concurrency + battle line + peak)
- [ ] T008 Ad-impression / view metrics on the billboards (Phase 4 monetization)
- [ ] T009 [DEPENDENCY] Deploy the ws server to a persistent host so /stats carries live data (see server-hosting spec); add an external uptime ping hitting /health

## Notes
- No gameplay change; `npm run check` includes the stats test and stays green.
- `/stats` exposes no PII/secrets (the game has no accounts) — safe to expose publicly.
