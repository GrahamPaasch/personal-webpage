---
description: "Task list for Core Game Baseline (001)"
---

# Tasks: Core Game Baseline

**Input**: Design documents from `specs/001-core-game-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/network-protocol.md, quickstart.md

**Tests**: This is a reverse-engineered baseline of working code. Per research R4, automated
testing is scoped to ONE lightweight protocol-consistency guard; everything else is verified
through the `quickstart.md` scenarios. No broad test suite is created here.

**Organization**: Tasks are grouped by the three user stories in spec.md. Because the gameplay
already exists, most user-story tasks are **verification** tasks (confirm code satisfies the
acceptance criteria); genuine code changes are called out explicitly (protocol consolidation,
offline degradation).

**Path note**: All paths are relative to the game project root `games/sidewalks-of-rage/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 for user-story phases (omitted for Setup/Foundational/Polish)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the project builds and runs before assessing behavior.

- [ ] T001 Verify dev prerequisites and install: Node 18+ available and `npm install` completes cleanly in `games/sidewalks-of-rage/` (per quickstart.md Prerequisites)
- [ ] T002 [P] Verify production build: `npm run build` succeeds and emits assets to `../../public/sidewalks-of-rage/` per vite.config.js (Constitution V)
- [ ] T003 [P] Verify server boot: `npm run server` starts the WebSocket server on the default port (and honors `PORT`) without errors in server/index.js

**Checkpoint**: Client builds and server runs — ready to assess behavior.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Resolve the single Constitution I violation so the protocol has one source of
truth. This blocks the multiplayer verification in User Story 2.

**⚠️ CRITICAL**: This is the only mandatory code change in the baseline.

- [ ] T004 Make `src/network/protocol.js` the canonical protocol: ensure it exports the complete `MESSAGE_TYPES` catalog from contracts/network-protocol.md (add any missing entries) (FR-026, Constitution I)
- [ ] T005 Refactor `server/index.js` to `import { MESSAGE_TYPES } from '../src/network/protocol.js'` and DELETE the duplicate inline `MESSAGE_TYPES` literal (FR-026, Constitution I)
- [ ] T006 [P] Add a no-framework protocol consistency guard (e.g. `scripts/check-protocol.mjs`) that imports the canonical `MESSAGE_TYPES`, asserts it contains every catalog type, and fails if `server/index.js` declares its own `MESSAGE_TYPES` literal (research R1/R4, contracts/network-protocol.md)
- [ ] T007 Smoke-test that the refactor is behavior-neutral: run quickstart.md V5 then V2 end-to-end (join/move/attack/kill/round/score) and confirm no player-facing change (SC-006)

**Checkpoint**: Protocol is single-source; multiplayer flow unchanged. User stories can be verified.

---

## Phase 3: User Story 1 - Brawl through enemy waves (Priority: P1) 🎯 MVP

**Goal**: Confirm the standalone single-player brawl loop (move, attack, take damage, die,
respawn) fully satisfies its acceptance criteria.

**Independent Test**: Launch solo and complete quickstart.md V1 — a full playable loop with no
multiplayer dependency.

- [ ] T008 [P] [US1] Verify title→arena entry on Space/Enter/tap in src/scenes/TitleScene.js → src/scenes/GameScene.js (US1-AC1, FR-001)
- [ ] T009 [P] [US1] Verify 2-axis movement with vertical slower than horizontal, and facing follows last horizontal move, in src/scenes/GameScene.js (US1-AC2, FR-003/FR-004)
- [ ] T010 [P] [US1] Verify attack startup/active-window/lunge/recovery and that movement + re-attack are suppressed mid-action in src/scenes/GameScene.js + src/utils/CombatSystem.js (US1-AC5, FR-006)
- [ ] T011 [US1] Verify hit detection (depth tolerance, forward reach, facing) and single-hit-per-swing in src/utils/CombatSystem.js + src/scenes/GameScene.js (US1-AC3, FR-009/FR-010)
- [ ] T012 [US1] Verify hit feedback (hitstop, knockback, screen shake, damage number, particles) in src/utils/CombatSystem.js + src/scenes/GameScene.js (FR-011)
- [ ] T013 [US1] Verify player damage rules (per-hit cooldown; no damage while jumping; counter-attack window) in src/scenes/GameScene.js (FR-012)
- [ ] T014 [US1] Verify death overlay + respawn at full health with temporary invincibility in src/scenes/GameScene.js (US1-AC4, FR-013)
- [ ] T015 [P] [US1] Verify enemy spawning from edges, pursuit, and AI states (idle/chase/attack/hit/dying) in src/entities/Enemy.js (FR-014)
- [ ] T016 [P] [US1] Verify the 5 enemy archetypes differ in speed/health/damage and show themed speech callouts in src/entities/Enemy.js (FR-015/FR-016)
- [ ] T017 [P] [US1] Verify city-skyline environment renders (sky, buildings, billboards, storefronts, sidewalk) in src/background/CityBackground.js (FR-027)

**Checkpoint**: P1 MVP — the core brawler is verified playable on its own.

---

## Phase 4: User Story 2 - Compete in the shared faction battle (Priority: P2)

**Goal**: Confirm shared multiplayer meta — server-authoritative faction assignment, mirrored
players, battle-line shifts, round resolution, and global score — works across clients.

**Independent Test**: Connect two clients and complete quickstart.md V2.

**Depends on**: Phase 2 (canonical protocol) complete.

- [ ] T018 [P] [US2] Verify join handshake assigns faction + archetype and delivers id, global score, and existing roster in server/index.js + src/scenes/GameScene.js (US2-AC1, FR-002)
- [ ] T019 [P] [US2] Verify remote players mirror position/facing/attack sub-second across clients via PLAYER_MOVE/PLAYER_ATTACK in server/index.js + src/network/Client.js (US2-AC2, FR-022/FR-025, SC-003)
- [ ] T020 [US2] Verify each PLAYER_KILL shifts the shared battle line one fixed step toward the killer's faction, clamped to [0,100], on all clients in server/index.js (US2-AC3, FR-023)
- [ ] T021 [US2] Verify round end at an extreme: winner's global score increments, ROUND_END + GLOBAL_SCORE broadcast, line resets to 50, play continues, in server/index.js (US2-AC4, FR-024)
- [ ] T022 [P] [US2] Verify disconnect handling: PLAYER_LEFT broadcast and remote player removal + updated faction counts in server/index.js + src/scenes/GameScene.js (US2-AC5, FR-025)
- [ ] T023 [US2] Verify server is sole authority for roster/faction/archetype/round/battle-line/global-score and clients only send intent (FR-021, Constitution II)

**Checkpoint**: P1 + P2 verified — competitive multiplayer meta works and is consistent.

---

## Phase 5: User Story 3 - Pursue mastery via combos, waves, and difficulty (Priority: P3)

**Goal**: Confirm the depth layer — combos with scoring multiplier, escalating waves, and
battle-line-driven adaptive difficulty.

**Independent Test**: Solo session completing quickstart.md V3.

- [ ] T024 [P] [US3] Verify combo tracking within the combo window, combo banner past threshold, and reset on damage/death in src/utils/CombatSystem.js + src/scenes/GameScene.js (US3-AC1/AC3, FR-019)
- [ ] T025 [P] [US3] Verify kills award combo-scaled local score and high combos trigger streak messages in src/utils/CombatSystem.js + src/scenes/GameScene.js (US3-AC2, FR-020)
- [ ] T026 [US3] Verify wave advancement raises enemy count and spawn rate (subject to the concurrent cap) in src/scenes/GameScene.js (US3-AC4, FR-017)
- [ ] T027 [US3] Verify difficulty rubber-bands with battle-line position (harder when player's faction ahead, easier when behind) in src/scenes/GameScene.js (US3-AC5, FR-018)

**Checkpoint**: All three user stories verified independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting requirements and a documented offline-degradation behavior.

- [ ] T028 [P] Verify full input parity per quickstart.md V4: every action works keyboard-only and touch-only with identical effect; touch UI shows only on touch devices, via src/ui/VirtualDPad.js + index.html + src/scenes/GameScene.js (SC-002, FR-007/FR-008, Constitution IV)
- [ ] T029 Verify/implement graceful offline degradation (research R2): with the server unavailable or dropped, the P1 brawl loop remains playable and multiplayer meta pauses cleanly (no crash, no "game over"); decide reconnection strategy in src/network/Client.js + src/scenes/GameScene.js (Edge Cases, SC-005)
- [ ] T030 [P] Verify all centralized tunables remain named constants with no new magic numbers introduced by T004–T006 in src/utils/CombatSystem.js and related files (Constitution III)
- [ ] T031 [P] Update README/quickstart references for running client + server together if any drift is found during verification (docs only)
- [ ] T032 Run the complete quickstart.md (V1–V5) as a final acceptance pass and record any deviations as new findings (all SC-### )

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS User Story 2 (and the protocol guard).
- **User Story 1 (Phase 3)**: Depends only on Setup — it is the offline-capable core and does
  not require Phase 2. Can begin right after Setup.
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2).
- **User Story 3 (Phase 5)**: Depends on Setup (verification of client-local systems).
- **Polish (Phase 6)**: Depends on the user stories being verified.

### User Story Dependencies

- **US1 (P1)**: Independent — the standalone brawl loop (MVP).
- **US2 (P2)**: Requires the canonical protocol (Phase 2); otherwise independent of US1/US3.
- **US3 (P3)**: Independent client-local systems; verifiable solo.

### Within Each Story

- For US1/US3: verification tasks marked [P] touch different subsystems and can run in parallel.
- For US2: T020/T021/T023 share server round logic and are sequential; T018/T019/T022 are [P].

### Parallel Opportunities

- Setup: T002, T003 in parallel.
- Foundational: T006 can be drafted in parallel with T004/T005 (T004 before T005; T007 last).
- US1: T008, T009, T010, T015, T016, T017 in parallel; then T011→T012→T013→T014.
- US2: T018, T019, T022 in parallel; T020→T021→T023 sequential.
- US3: T024, T025 in parallel; then T026, T027.
- Polish: T028, T030, T031 in parallel; T029 and T032 stand alone.

---

## Parallel Example: User Story 1

```text
# Verify these independent subsystems together:
Task: "T008 Verify title→arena entry in src/scenes/TitleScene.js"
Task: "T009 Verify 2-axis movement + facing in src/scenes/GameScene.js"
Task: "T015 Verify enemy spawn/pursuit/AI states in src/entities/Enemy.js"
Task: "T016 Verify enemy archetypes + speech in src/entities/Enemy.js"
Task: "T017 Verify city background in src/background/CityBackground.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup.
2. Phase 3: Verify US1 (the core loop is the MVP and needs no server).
3. **STOP and VALIDATE** with quickstart.md V1.

### Then Foundational + Incremental Delivery

1. Phase 2: Consolidate the protocol (the one real change) and guard it.
2. Phase 4: Verify US2 multiplayer meta → validate with V2.
3. Phase 5: Verify US3 mastery layer → validate with V3.
4. Phase 6: Cross-cutting (input parity, offline degradation) → validate with V4/V5 and a full pass.

---

## Notes

- This baseline mostly *verifies* existing behavior; the only mandatory code change is the
  protocol consolidation (T004–T006) required by Constitution I / FR-026.
- T029 may turn into real implementation if the client does not already degrade gracefully
  without a server — verify first, then implement only if needed (YAGNI, Constitution V).
- Commit after each task or logical group; keep `public/` build artifacts out of manual edits.
- Any verification task that fails becomes a finding for a follow-up `/speckit-converge` run.
