# Implementation Plan: Observability & Analytics

**Branch**: `004-observability` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

## Summary
Two cheap, decoupled layers: (1) a page-visit beacon on the static client (works on Vercel today,
no server), and (2) an HTTP observability surface on the existing ws server (`/stats`, `/health`,
persisted peak/total metrics, structured JSON event logs). No new client dependency, no gameplay
change. Already implemented in this slice; admin dashboard + ad metrics are follow-ups.

## Technical Context
- **Client analytics**: Vercel Web Analytics beacon (`/_vercel/insights/script.js`) in `index.html`.
  Privacy-friendly, no accounts/PII. Plausible is a drop-in alternative if preferred.
- **Server**: attach `ws` to a Node `http.createServer` (same port) so it can serve `GET /stats`
  (live + cumulative metrics, CORS-open) and `GET /health` (liveness). Metrics (`peakConcurrent`,
  `totalConnections`, `totalRounds`, `totalKills`) live in the existing `metrics` object and persist
  via the existing atomic `state.json`. Structured `console.log(JSON.stringify({evt,...}))` events.
- **Verification**: `scripts/test-stats.mjs` (in `npm run check`) asserts `/health`, `/stats`
  shape + live concurrency, and that a `join` event is logged.

## Constitution Check
- I/II/IV: unaffected (no protocol or gameplay change; ws still authoritative).
- III: metric/limit values are named; no magic numbers introduced.
- V (YAGNI/deterministic): no new runtime dep; HTTP shares the ws port; `/stats` is plain Node.
**Gate: PASS.**

## Dependency
Server metrics only carry real data once the ws server is deployed to a persistent host — that is
the next feature (server hosting). Page analytics is independent and live now.
