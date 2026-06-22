# Phase 0 Research: Core Game Baseline

This baseline reverse-engineers an existing implementation, so most "unknowns" are decisions
about how to align the code with the spec/constitution rather than greenfield technology
choices. Each item below resolves a NEEDS CLARIFICATION or a design decision raised in the
plan and spec.

## R1. Canonical protocol consolidation (FR-026 / Constitution I)

**Decision**: Make `src/network/protocol.js` the single canonical definition of
`MESSAGE_TYPES` (and any shared payload-shape helpers). The Node server (`server/index.js`)
MUST import this module instead of redeclaring its own `MESSAGE_TYPES` object.

**Rationale**: `src/network/protocol.js` already exports `MESSAGE_TYPES` as an ES module, and
`server/index.js` is already an ES module (`"type": "module"` in package.json) — so a direct
`import { MESSAGE_TYPES } from '../src/network/protocol.js'` works under Node without a build
step or bundler. This removes the drift risk with zero new dependencies (Constitution V) and
zero behavioral change (the two tables are currently identical).

**Alternatives considered**:
- *Duplicate but add a test asserting equality* — keeps two sources of truth; treats the
  symptom, not the cause. Rejected: violates the intent of Constitution I.
- *Extract protocol into a third shared package* — over-engineering for a single small object;
  adds workspace/build complexity. Rejected per YAGNI (Constitution V).
- *Generate the server table from the client at build time* — adds tooling for no benefit over
  a plain import. Rejected.

**Validation**: A small Node-run check (see quickstart) imports both the client protocol and
the server module and asserts the server uses the canonical keys; manual smoke test confirms
multiplayer join/move/attack/kill/round flow is unchanged.

## R2. Offline / no-server fallback behavior

**Decision**: The single-player brawl loop (User Story P1) MUST remain playable when the
WebSocket connection cannot be established or drops. Multiplayer meta (remote players, shared
battle line, global score, server-assigned faction) degrades gracefully: the client continues
the local enemy-wave loop and simply shows no remote players / no authoritative round updates.

**Rationale**: The spec's P1 story is explicitly independent of multiplayer, and the client
already runs enemy spawning, combat, and scoring locally (the server is authoritative only
over shared meta). Treating connection loss as "meta unavailable" rather than "game over"
matches the existing client-side architecture and the "no hard lose condition" assumption.

**Alternatives considered**:
- *Block play until connected* — contradicts P1 independence and harms first-load UX.
  Rejected.
- *Full offline simulation of battle line/factions client-side* — would duplicate server
  authority on the client, risking Constitution II. Rejected; meta simply pauses instead.

**Open detail for tasks**: exact reconnection strategy (retry/backoff vs. one-shot) is an
implementation detail to decide in `/speckit-tasks`; the requirement here is "P1 stays
playable, meta degrades cleanly."

## R3. Status of tuning constants (spec contract vs. implementation detail)

**Decision**: Specific numeric tunables (speeds, reach, depth tolerance, timings, knockback
distances, battle-line step, wave thresholds, spawn caps) are **implementation detail** held
in centralized constants per Constitution III, NOT fixed spec contract. The spec only fixes
*qualitative* relationships (e.g., "vertical movement slower than horizontal", "each kill
moves the line one fixed step", "difficulty increases when the player's faction is ahead").

**Rationale**: Brawler feel is iterated by tweaking numbers; freezing exact values in the spec
would make routine tuning a spec amendment. Centralization already satisfies traceability.

**Alternatives considered**:
- *Pin every constant in the spec* — makes tuning bureaucratic; rejected.
- *Leave relationships unspecified too* — would make requirements untestable; rejected. The
  qualitative relationships are kept as testable requirements.

## R4. Testing approach for this baseline

**Decision**: Introduce no broad gameplay test harness now. Scope automated verification to
(a) a minimal protocol-consistency check for the R1 refactor and (b) the manual `quickstart.md`
validation scenarios mapped to the spec's acceptance criteria. A fuller test strategy is a
future feature, not part of this baseline.

**Rationale**: The project currently has no test framework; adding one wholesale is a separate
investment and would violate YAGNI for a documentation-and-one-refactor baseline. The single
behavioral-risk change (protocol import) is cheaply verifiable.

**Alternatives considered**:
- *Add Vitest + full unit/integration suite now* — large scope creep beyond the baseline's
  intent; rejected for this feature, recommended as a follow-up spec.
- *No verification at all* — leaves the one refactor unguarded; rejected.

## R5. Node version baseline for the server

**Decision**: Target Node.js 18+ for the server.

**Rationale**: `server/index.js` uses `crypto.randomUUID` (Node 16.7+) and modern ESM; Node 18
is the current widely-available LTS-class baseline and matches typical hosting. No code change
required — this just records the assumed runtime.

**Alternatives considered**: Node 16 (minimum that satisfies APIs used) — recorded as the hard
floor, but 18+ is the recommended/assumed baseline.

## Resolved NEEDS CLARIFICATION summary

| Item | Resolution |
|------|-----------|
| How to make protocol single-source (Constitution I) | R1: server imports `src/network/protocol.js`; no new deps |
| Offline / no-server behavior | R2: P1 loop playable; meta degrades gracefully |
| Are tuning constants spec contract? | R3: No — implementation detail; only qualitative relationships are contract |
| Testing scope for baseline | R4: protocol check + manual quickstart only |
| Server runtime version | R5: Node 18+ (16.7 hard floor) |

All NEEDS CLARIFICATION items are resolved. Ready for Phase 1.
