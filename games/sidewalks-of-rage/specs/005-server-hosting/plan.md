# Plan & Runbook: WebSocket Server Hosting

**Spec**: [spec.md](./spec.md) | Research: `.specify/scratch/hosting-research.md`

## Approach
Ship the server as a container to **Fly.io**, always-on (no scale-to-zero), wss via Fly edge TLS.
The client picks its server URL from `VITE_WS_URL` at build time. All config is checked in:
`Dockerfile`, `.dockerignore`, `fly.toml`, `.env.development`, `.env.production`. The only manual
step is `fly deploy` (needs your Fly account) + a rebuild of the client with the right URL.

## Cost & key risk
~$2/mo (shared-cpu-1x 256MB; bump to 512MB ~$3.32/mo if OOM). **Biggest trap:** Fly defaults to
scale-to-zero, which drops live WebSockets when it thinks the machine is idle — `fly.toml` disables
it (`auto_stop_machines="off"`, `auto_start_machines=false`, `min_machines_running=1`).

## Runbook (when you're ready to go live)

```bash
cd games/sidewalks-of-rage

# 1) one-time: install + login
curl -L https://fly.io/install.sh | sh
fly auth login

# 2) create the app (config already in fly.toml). Pick a unique name or keep the default;
#    if you change it, also update .env.production's VITE_WS_URL host to match.
fly apps create sidewalks-of-rage-ws   # or `fly launch --no-deploy` to scaffold interactively

# 3) deploy the server
fly deploy

# 4) verify the server
fly status
curl https://sidewalks-of-rage-ws.fly.dev/health   # -> ok
curl https://sidewalks-of-rage-ws.fly.dev/stats    # -> JSON metrics

# 5) point the client at it (already set in .env.production if you used the default app name),
#    rebuild, and ship the static client
npm run build        # bakes VITE_WS_URL=wss://sidewalks-of-rage-ws.fly.dev into the bundle
# commit the rebuilt public/ + push -> Vercel deploys the client
```

Then open the live game in two browsers → they should see each other and share the battle line,
and `/stats` shows `concurrent: 2`.

## Gotchas (from research)
- **Mixed content:** the https page can only open `wss://` — `VITE_WS_URL` must be `wss://`. ✓ set.
- **Scale-to-zero drops ws:** disabled in `fly.toml`. Keep autostop & autostart both off.
- **Deploys/restarts drop connections:** clients auto-reconnect (full state re-broadcast on join).
- **CORS:** ws is not subject to CORS; only `/stats` needs it (already `Access-Control-Allow-Origin: *`).
- **State on redeploy:** `server/state.json` is local disk — lost on redeploy unless you attach a Fly
  volume and point `STATE_FILE` at it. Add a 1GB volume ($0.15/GB-mo) mounted at `/data` if you want
  the global score to survive deploys.
- **256MB tight for Node:** bump `memory="512mb"` in fly.toml if you see OOM restarts.

## Verification
- Headless: `npm run check` stays green (tests connect to localhost directly; `VITE_WS_URL` only
  affects the browser client). Build inlines the production URL.
- Live: `/health` + `/stats` via curl; two-browser play-test on the deployed site.
