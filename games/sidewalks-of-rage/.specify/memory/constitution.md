<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0   [initial ratification]
Bump rationale: First concrete constitution; replaces template placeholders.

Principles defined:
  I.   Shared Protocol as Single Source of Truth
  II.  Server-Authoritative Multiplayer
  III. Tunable Game Feel via Centralized Constants
  IV.  Cross-Platform Input Parity
  V.   Deterministic Build & Deploy, Stay Simple (YAGNI)

Added sections:
  - Technology Constraints
  - Development Workflow
  - Governance

Removed sections: none (template placeholders fully replaced)

Templates reviewed for alignment:
  ✅ .specify/templates/plan-template.md   (Constitution Check gate is generic; no edits needed)
  ✅ .specify/templates/spec-template.md   (scope/requirements structure compatible)
  ✅ .specify/templates/tasks-template.md  (task categories compatible)
  ✅ CLAUDE.md                             (points to active plan; no principle references to update)

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): No formal adoption pre-dates this file; using creation date 2026-06-22.
-->

# Sidewalks of Rage Constitution

## Core Principles

### I. Shared Protocol as Single Source of Truth
The network message contract MUST have exactly one canonical definition. `MESSAGE_TYPES`
and any wire-format shapes are owned by `src/network/protocol.js`; the server and all
clients MUST import or mirror that file rather than redefining message strings inline.
Any change to a message type, its payload fields, or their semantics MUST update the
canonical definition first, and MUST be applied to both sender and receiver in the same
change. Rationale: the type table is currently duplicated between client and server, and
silent drift between the two produces bugs that are invisible until two peers disagree at
runtime.

### II. Server-Authoritative Multiplayer
The WebSocket server (`server/index.js`) is the authority for shared state: player
roster, faction assignment, round state, battle-line position, and global score. Clients
MUST treat their local view as a prediction and reconcile to server messages
(`GAME_STATE`, `ROUND_STATE`, `GLOBAL_SCORE`, `FACTION_ASSIGNED`). Clients MUST NOT
invent authoritative outcomes (kills, score, faction) on their own; they send intent
(`PLAYER_MOVE`, `PLAYER_ATTACK`) and render what the server confirms. Rationale: a single
authority keeps every connected player consistent and is the only place cheating and
race conditions can be contained.

### III. Tunable Game Feel via Centralized Constants
Numeric values that shape game feel — combat frame data, hitstop, hitstun, knockback,
reach, screen shake, movement speeds, round pacing — MUST live in named constants
(e.g. the `COMBAT` table in `src/utils/CombatSystem.js`), never as magic numbers spread
through scene or entity logic. New tunables MUST be added to the relevant constants
object with a comment describing units and intent. Rationale: brawler feel is iterated
by tweaking numbers; centralizing them keeps tuning fast, reviewable, and reversible.

### IV. Cross-Platform Input Parity
Every player action MUST be reachable by both keyboard and the on-screen touch controls
(virtual D-pad + jump/attack). A feature that adds or changes an input MUST wire it into
both paths and MUST funnel through the shared input abstraction (`src/ui/VirtualDPad.js`
and the keyboard handlers) rather than reading raw events ad hoc. The `touch-enabled`
body class is the single switch that reveals touch UI. Rationale: the game ships on a
public website hit by desktop and mobile alike; an action that only works on one is a
broken feature for half the audience.

### V. Deterministic Build & Deploy, Stay Simple (YAGNI)
The production build MUST be produced only by `vite build`, which emits to
`../../public/sidewalks-of-rage/` under base path `/sidewalks-of-rage/`. Committed files
in `public/sidewalks-of-rage/` are generated artifacts and MUST NOT be hand-edited.
Dependencies are kept minimal (Phaser, `ws`, Vite); adding a new runtime dependency MUST
be justified against doing it with what already exists. Rationale: the game is one app
inside a larger personal website with a Git-driven deploy; a single reproducible build
path and a small dependency surface keep deploys boring and predictable.

## Technology Constraints

- Engine: Phaser 3 (arcade physics, zero gravity); logical canvas is 800×600 with
  `Phaser.Scale.FIT`. Changes MUST remain resolution-independent within FIT scaling.
- Runtime split: browser client (`src/`) and Node WebSocket server (`server/index.js`,
  default port 8080, overridable via `PORT`). Both are ES modules (`"type": "module"`).
- The client derives its server URL from page protocol/host (`ws`/`wss`); do not hardcode
  environment-specific URLs in committed code.
- Assets live under `assets/`; keep them in-repo and referenced through Phaser's loader.

## Development Workflow

- Local dev: `npm run dev` (Vite) for the client and `npm run server` for the WebSocket
  server. Multiplayer changes MUST be exercised with the server running.
- Spec-Driven flow for non-trivial features: `/speckit-specify` → (`/speckit-clarify`) →
  `/speckit-plan` → `/speckit-tasks` → (`/speckit-analyze`) → `/speckit-implement`.
  Each feature's artifacts live in `specs/<feature>/`.
- Before merging: run `npm run build` to confirm the bundle compiles, and manually verify
  affected input paths on both keyboard and touch.
- This repository deploys from `main`; commits target `main` per the website's
  SOURCE_OF_TRUTH workflow.

## Governance

This constitution supersedes ad-hoc conventions for this game project. Amendments are made
by editing this file with a Sync Impact Report and a semantic version bump:
MAJOR for removing or redefining a principle, MINOR for adding a principle or section,
PATCH for clarifications. Plans and PRs that touch protocol, authority, tunables, input,
or the build pipeline MUST verify compliance with the relevant principle; any deliberate
deviation MUST be called out and justified in the change description. When guidance here
conflicts with convenience, this document wins.

**Version**: 1.0.0 | **Ratified**: 2026-06-22 | **Last Amended**: 2026-06-22
