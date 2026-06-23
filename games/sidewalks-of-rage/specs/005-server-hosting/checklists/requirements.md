# Specification Quality Checklist: WebSocket Server Hosting

**Created**: 2026-06-23 | **Feature**: [spec.md](../spec.md)

- [x] Clear value (real multiplayer + live /stats on the deployed site)
- [x] No [NEEDS CLARIFICATION] markers
- [x] Requirements testable (curl /health + /stats; two-browser sync; degrade-when-down)
- [x] Host decision justified (Fly: cheapest always-on managed; alternatives in research)
- [x] The scale-to-zero risk and mixed-content (wss) gotcha are explicitly handled
- [x] No secrets committed (ws URL is public; .env*.local gitignored)
- [x] Bounded scope (one always-on server; sharding/regions = Phase 3)
- [x] Manual deploy steps documented as a runbook

## Notes
- Config + client wiring are shipped; `fly deploy` is the user's manual step (needs their account).
- Unblocks observability spec 004 (server /stats only carries live data once hosted).
