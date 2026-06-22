# Implementation Plan: Core Game Baseline

**Branch**: `001-core-game-baseline` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-core-game-baseline/spec.md`

## Summary

Document the architecture of the existing "Sidewalks of Rage" brawler as a spec-driven
baseline, and identify the work needed to bring the codebase into full alignment with the
spec and constitution. The game is already implemented (Phaser 3 client + Node `ws` server);
this plan formalizes its design and surfaces one concrete remediation: the network protocol
contract is duplicated between client and server (FR-026 / Constitution I) and must become a
single canonical source. The plan establishes the data model, the canonical protocol
contract, and a runnable validation guide so `/speckit-tasks` and `/speckit-implement` can
close the gap without behavioral change for players.

## Technical Context

**Language/Version**: JavaScript (ES modules, `"type": "module"`); Node.js for the server
(uses built-in `crypto.randomUUID`, so Node 16+; CI/dev assume Node 18+).

**Primary Dependencies**: Phaser 3 (`^3.80.1`) for the client game engine; `ws` (`^8.18.3`)
for the WebSocket server; Vite (`^5.4.0`) as dev server and bundler.

**Storage**: N/A — all state is in-memory. Server holds runtime state (roster, round state,
battle line, global score) in process memory; no database or persistence. Score/round state
is ephemeral and resets when the server restarts.

**Testing**: None currently in the project. This plan introduces a lightweight test approach
for the one refactor it proposes (canonical protocol), plus a manual `quickstart.md`
validation guide. Full automated test coverage of gameplay is out of scope for this baseline.

**Target Platform**: Modern evergreen web browsers (desktop + mobile/touch). Client builds to
static assets served under `/sidewalks-of-rage/` as part of the larger personal website;
server runs as a standalone Node process (default port 8080, `PORT`-overridable).

**Project Type**: Web application with two runtimes — a browser client (`src/`) and a Node
WebSocket server (`server/`) — sharing a network protocol contract.

**Performance Goals**: 60 fps client rendering with up to 16 concurrent enemies; position
updates broadcast ~15×/sec per player; remote player actions reflected sub-second under
normal LAN/WAN conditions.

**Constraints**: Logical canvas 800×600 with `Phaser.Scale.FIT` (resolution-independent);
full keyboard/touch input parity; minimal dependency surface; deterministic Vite-only build
to `../../public/sidewalks-of-rage/`.

**Scale/Scope**: Small co-op/competitive sessions (handful of concurrent players per server
process); single arena; ~3,300 LOC across client and server today.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Shared Protocol as Single Source of Truth | ⚠️ **VIOLATION (existing)** | `MESSAGE_TYPES` is duplicated in `src/network/protocol.js` and `server/index.js`. This plan's primary remediation makes `src/network/protocol.js` the single canonical source the server imports. Tracked in Complexity Tracking + addressed in Phase 1 contract. |
| II | Server-Authoritative Multiplayer | ✅ PASS | Server already owns roster, factions, archetypes, round state, battle line, global score; clients send intent and render confirmed state. No change needed; plan preserves this. |
| III | Tunable Game Feel via Centralized Constants | ✅ PASS | Combat constants live in `COMBAT` (`src/utils/CombatSystem.js`); player/enemy/wave tunables are named constants. Plan adds no magic numbers. |
| IV | Cross-Platform Input Parity | ✅ PASS | Keyboard + virtual D-pad unified into one input state; `touch-enabled` toggles touch UI. No change needed. |
| V | Deterministic Build & Deploy, YAGNI | ✅ PASS | Vite-only build to `public/`; deps minimal (Phaser, ws, Vite). The protocol refactor adds no new dependency. |

**Gate result**: PASS to proceed. The single Principle I violation is **pre-existing** in the
codebase (not introduced by this plan); the plan's explicit purpose includes remediating it,
so it is justified and tracked rather than blocking.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-game-baseline/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── network-protocol.md   # Canonical client⇄server message contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root = games/sidewalks-of-rage/)

```text
src/                         # Browser client (Phaser 3)
├── main.js                  # Phaser game config + scene registration
├── scenes/
│   ├── TitleScene.js        # Title screen, start input
│   └── GameScene.js         # Arena: player, enemies, combat, HUD, networking glue
├── entities/
│   └── Enemy.js             # Enemy archetypes, AI state machine, speech bubbles
├── background/
│   └── CityBackground.js    # Static city skyline environment
├── network/
│   ├── protocol.js          # CANONICAL message-type contract (single source of truth)
│   └── Client.js            # WebSocket client wrapper (connect/send/on)
├── ui/
│   └── VirtualDPad.js       # Touch controls; unifies into shared input state
└── utils/
    └── CombatSystem.js      # COMBAT constants, hit detection, hitstop, knockback, combos

server/
└── index.js                 # Node ws server; authoritative state; imports protocol.js

index.html                   # Touch-control DOM + Phaser mount
vite.config.js               # base + outDir to ../../public/sidewalks-of-rage/
package.json                 # scripts: dev, build, preview, server
```

**Structure Decision**: Retain the existing two-runtime web-app layout (browser `src/` +
Node `server/`). The only structural change this plan mandates is making
`src/network/protocol.js` the canonical protocol module that `server/index.js` imports,
eliminating the duplicated `MESSAGE_TYPES` table. No new top-level directories are
introduced; this honors Constitution V (YAGNI) while resolving Constitution I.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Pre-existing duplicate `MESSAGE_TYPES` (Constitution I) | Not a desired complexity — it is the defect this baseline plans to remove. Listed here for traceability until tasks resolve it. | The simpler (and target) state is a single shared module; the duplication exists only because the server was written standalone. Remediation = import the canonical module server-side. |
