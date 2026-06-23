---
description: "Task list for GameScene Decomposition & Performance (003)"
---

# Tasks: GameScene Decomposition & Performance

**Input**: [spec.md](./spec.md), [plan.md](./plan.md) (the detailed, adversarially-reviewed
blueprint — each task below maps to a numbered Step there).

**Run on**: a machine where the game runs in a browser (RTX workstation). Each task's real gate is
`npm run check` (headless) **plus** a targeted two-tab visual check described in the plan.

> **Already shipped in the prior automated pass (NOT in this feature):** blueprint Steps 1
> (CI), 2 (README), 3 (bundle split), 4 (persistence), 5 (kill flood-cap), and 12 (round-end
> banner `tweens.timeline`→`chain` crash fix). This feature is the remaining **perf (6–11)** and
> **decomposition (13)** work.

## Format: `[ID] [P?] [Story] Description (→ plan Step)`

---

## Phase 1: Behavior-preserving performance (US2 — do before decomposition)

- [ ] T001 [US2] Object-pool FX: damage numbers, hit/death particles, speech bubbles — full reset on acquire incl. backgroundColor/padding (separate pools for damage vs speech, per adversarial fix #3) (→ Step 6)
- [ ] T002 [US2] Enemy pooling: recycle instead of destroy via a custom acquire (find-inactive-or-construct + reset()), NOT vanilla group.get(); ensure death sets active=false before next spawn tick (adversarial fix #4) (→ Step 7)
- [ ] T003 [US2] Enemy timer/listener hygiene: clear animationcomplete listeners + cancel tint-restore & speech delayedCalls in die()/reset(); clear recycled enemy from the shared attackHitEnemies Set (adversarial fixes #5,#6) (→ Step 8)
- [ ] T004 [P] [US2] Dirty-checked depth sort + cached displayHeight (epsilon ≤0.5px; refresh on knockback/respawn/reset; don't skip label depth on frames body depth changed) (adversarial fix #9) (→ Step 9)
- [ ] T005 [P] [US2] Precomputed frozen anim-key maps in Enemy preUpdate (byte-identical key strings) (→ Step 10)
- [ ] T006 [P] [US2] Scalar math / allocation removal in knockback/hitstop/lunge/input snapshot — preserve fallback NORMALIZATION exactly (adversarial fix #7) and dpadState consume-before-dead-check ordering (fix #8) (→ Step 11)

**Checkpoint**: perf changes in, `npm run check` green, manual visual confirms identical feel.

## Phase 2: GameScene decomposition (US1 — smallest/safest module first)

Extract in this exact order; build + smoke + targeted visual check + commit after EACH. Honor the
plan's "Cross-cutting footguns" for every sub-step (this→this.scene rebinding; per-module SHUTDOWN
teardown; preserve each depth formula; physics body magic numbers; strict update()-loop order;
share `attackHitEnemies` Set and `isPlayerDead` by reference, never copy).

- [ ] T007 [US1] Extract `src/factions/FactionTints.js` (pure leaf; getFactionTint returns null for unknown) (→ Step 13a)
- [ ] T008 [US1] Extract `src/ui/Hud.js` (score/battle-line/banner/kill-msg/death-overlay + own resize+tween teardown; banner already fixed) (→ Step 13b)
- [ ] T009 [US1] Extract `src/network/RemotePlayerManager.js` (remote sprite/label map + SHUTDOWN destroy-all) (→ Step 13c)
- [ ] T010 [US1] Extract `src/network/NetworkSync.js` (Client + handlers + throttled send; playerId live getter; single battleLinePosition source) (→ Step 13d)
- [ ] T011 [US1] Extract `src/enemies/EnemyManager.js` (spawn/waves/difficulty + guarded re-arm against post-SHUTDOWN; live getters) (→ Step 13e)
- [ ] T012 [US1] Extract `src/player/PlayerStatus.js` (health/damage/death/respawn; isPlayerDead single live source) (→ Step 13f)
- [ ] T013 [US1] Extract `src/combat/CombatResolver.js` (both-direction hit resolution; shares attackHitEnemies Set by reference) (→ Step 13g)
- [ ] T014 [US1] Extract `src/player/PlayerController.js` (sprite/state/movement/anim/attack/depth/label; dpadState passed in; onAttack callback) (→ Step 13h)
- [ ] T015 [US1] Reduce GameScene to a composition root: thin update() fetching dpadState once and delegating in strict order; only scene-level SHUTDOWN concerns remain (→ Step 13-final)

## Phase 3: Verification & artifacts

- [ ] T016 Full two-tab manual regression of every system (movement, jump i-frames, attack window, combat both directions, HUD, battle line, round end banner, remote players, waves, difficulty, death/respawn, touch parity) (SC-001, SC-005)
- [ ] T017 Repeated scene-restart leak check: title→game→title→game shows zero leaked timers/tweens/listeners/sprites (SC-002)
- [ ] T018 `npm run check` green + protocol single-source (SC-003); then rebuild + commit public/ bundle

---

## Notes

- Do Phase 1 (perf) before Phase 2 (decomposition) so pooling reset logic exists before modules move.
- Each task is independently shippable/reversible; commit per task or per logical group.
- If any pooling reset can't be made provably leak-free, DROP that pooling item (YAGNI) rather than
  ship a visual-state-leak bug.
- This whole feature is behavior-preserving; the ONLY intended change is internal structure +
  allocation/churn. Any observable difference is a regression to fix.
