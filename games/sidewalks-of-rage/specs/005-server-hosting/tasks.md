---
description: "Task list for WebSocket Server Hosting (005)"
---

# Tasks: WebSocket Server Hosting

## Phase 1: Config + client wiring — DONE (this slice)
- [X] T001 Add Dockerfile (node:20-slim, prod deps, server+src, PORT 8080) and .dockerignore (FR-001)
- [X] T002 Add fly.toml: internal_port 8080, force_https, autostop OFF + min_machines_running=1, /health check, shared-cpu-1x 256MB (FR-002/004/005)
- [X] T003 Make Client.defaultUrl() read VITE_WS_URL first (wss in prod), then same-host, then localhost (FR-003)
- [X] T004 Add .env.development (ws://localhost:8080) + .env.production (wss://<app>.fly.dev); gitignore .env*.local (FR-003/006)

## Phase 2: Deploy — MANUAL (needs your Fly account; see plan.md runbook)
- [ ] T005 [MANUAL] `fly auth login`; `fly apps create sidewalks-of-rage-ws` (or keep/rename — update .env.production to match)
- [ ] T006 [MANUAL] `fly deploy`; verify `fly status`, `curl .../health`, `curl .../stats`
- [ ] T007 [MANUAL] If app name differs from default, update VITE_WS_URL in .env.production, `npm run build`, commit public/, push (Vercel ships the client)
- [ ] T008 [MANUAL] Two-browser play-test on the live site: confirm players see each other + shared battle line; /stats shows concurrent: 2

## Phase 3: Hardening (optional follow-ups)
- [ ] T009 Attach a Fly volume + point STATE_FILE at it if global score must survive redeploys
- [ ] T010 External uptime monitor hitting /health (alert if the server drops)
- [ ] T011 Bump VM to 512mb if OOM restarts appear

## Notes
- `npm run check` stays green (Node tests use localhost; VITE_WS_URL only affects the browser build).
- This is "one always-on server" — multi-region / sharding / interest management is Phase 3 (VISION.md).
