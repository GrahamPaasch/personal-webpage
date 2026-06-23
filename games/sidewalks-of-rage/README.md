# Sidewalks of Rage

A real-time, browser-based, multiplayer 2.5D beat-'em-up brawler with a satirical
"science vs. skeptic" theme (the `fauci` faction vs. the `rogan` faction). Players share an
arena, fight waves of themed enemies, and collectively push a shared **battle line** toward a
round win for their faction. Part of the [grahampaasch.com](https://www.grahampaasch.com)
personal website, served under `/sidewalks-of-rage/`.

## Tech Stack

- **[Phaser 3](https://phaser.io/)** — browser game engine (arcade physics, 800×600 `FIT` canvas)
- **[ws](https://github.com/websockets/ws)** — Node WebSocket server (authoritative shared state)
- **[Vite](https://vitejs.dev/)** — dev server + production bundler
- ES modules throughout; Node 18+ for the server (`crypto.randomUUID`)

## Quick Start

```bash
npm install

# Terminal 1 — authoritative WebSocket server (default port 8080, override with PORT)
npm run server

# Terminal 2 — Vite dev client
npm run dev
```

Open the printed local URL. Multiplayer works across multiple browser tabs/devices pointed at
the same server. For a production-style preview: `npm run build` then `npm run preview`.

## npm Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server (client) |
| `npm run server` | Node WebSocket game server (`PORT` overridable) |
| `npm run build` | Production build → `../../public/sidewalks-of-rage/` |
| `npm run preview` | Serve the production build locally |
| `npm run check:protocol` | Guard: protocol message catalog has a single source of truth |
| `npm run smoke` | Headless 2-client multiplayer end-to-end test |
| `npm run test:persistence` | Headless test: server state survives a restart |
| `npm run test:kill-limit` | Headless test: PLAYER_KILL flood cap engages |
| `npm run check` | Runs protocol guard + build + smoke + both tests (pre-merge gate) |

## Controls

- **Keyboard:** WASD / arrows to move, **Space** to attack, **Shift** to jump.
- **Touch:** on-screen virtual D-pad + jump/attack buttons (shown only on touch devices).

Both input paths feed a single unified input state — every action works on both.

## Project Structure

```
src/
├── main.js                 # Phaser config + scene registration
├── scenes/                 # TitleScene, GameScene
├── entities/Enemy.js       # enemy archetypes + AI
├── background/             # static city skyline
├── network/                # protocol.js (canonical), Client.js
├── ui/VirtualDPad.js       # touch controls
└── utils/CombatSystem.js   # COMBAT constants, hit detection, combos
server/index.js             # authoritative WebSocket server (+ file-based state.json)
scripts/                    # headless guards/tests (protocol, smoke, persistence, kill-limit)
specs/                      # Spec Kit (SDD) feature specs
```

## Network Protocol

The client↔server message catalog (`MESSAGE_TYPES`) is defined **once** in
[`src/network/protocol.js`](src/network/protocol.js) and imported by the server — a single
source of truth enforced by `npm run check:protocol`. The full contract (directions, payloads,
authority rules) lives in
[`specs/001-core-game-baseline/contracts/network-protocol.md`](specs/001-core-game-baseline/contracts/network-protocol.md).

The server is authoritative over roster, faction assignment, archetype, round state, the
battle-line position, and the global score. Clients send only intent (join/move/attack/kill).

## Spec-Driven Development (GitHub Spec Kit)

This project uses [GitHub Spec Kit](https://github.com/github/spec-kit) for spec-driven
development. The `/speckit-*` skills register only when Claude Code is launched from **this
directory**. Workflow:

```
/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-analyze → /speckit-implement
```

Feature specs live under `specs/<feature>/`. The project **constitution** (governing
principles: single-source protocol, server-authoritative multiplayer, centralized game-feel
constants, keyboard/touch parity, deterministic build) is at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Build & Deploy

`npm run build` emits to `../../public/sidewalks-of-rage/` (a generated artifact — do not
hand-edit) under base path `/sidewalks-of-rage/`. Phaser is split into its own vendor chunk for
long-term caching. The site deploys from `main` per the repo's `SOURCE_OF_TRUTH.md`.

## CI

[`.github/workflows/sidewalks-of-rage-ci.yml`](../../.github/workflows/sidewalks-of-rage-ci.yml)
runs the protocol guard, build, smoke test, and both headless tests on every push/PR that
touches this subproject.
