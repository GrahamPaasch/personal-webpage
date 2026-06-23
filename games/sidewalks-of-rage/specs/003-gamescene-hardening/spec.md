# Feature Specification: GameScene Decomposition & Performance

**Feature Branch**: `003-gamescene-hardening`

**Created**: 2026-06-23

**Status**: Draft — **deferred to in-browser implementation**. The technical plan of record is
[`plan.md`](./plan.md) (the adversarially-reviewed hardening blueprint). Implement on a machine
where you can run the game and do a visual regression pass (e.g. the RTX workstation).

**Input**: Decompose the 1,573-line `src/scenes/GameScene.js` monolith into cohesive modules and
apply behavior-preserving runtime performance optimizations — **without changing any
player-facing behavior**. Captured as a spec (rather than implemented in the prior automated
pass) because every step's true verification is *visual* and cannot be confirmed headlessly.

## Why this is a spec and not already implemented

The CI/correctness/security work (protocol single-source, server persistence, kill flood-cap,
the round-end banner crash fix, bundle split, CI, README) was implemented and verified headlessly
in a prior pass. **This** work — module extraction and perf pooling — has only *visual*
verification (z-order, animations, hit-feedback, scene-restart teardown, game feel). The adversarial
review documented numerous Phaser footguns (`this`-rebinding, overlap-callback context, tween/timer
teardown, shared-by-reference Sets, three distinct depth formulas) and real reset-correctness
hazards in object pooling. Shipping ~1,500 lines of blind refactor would risk subtle breakage that
build + the multiplayer smoke test cannot catch. So it is specified for implementation where a human
(or a visual harness) can validate each step.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintainable scene architecture (Priority: P1)

As the developer, `GameScene` becomes a thin composition root delegating to focused modules
(player, enemies, combat, HUD, networking, remote players, round state), so future features touch
small files instead of one monolith — with the running game behaving identically.

**Why this priority**: The monolith is the single biggest drag on future development (it was the
headline finding). It unblocks everything else.

**Independent Test**: After each module is extracted, `npm run check` (protocol + build + smoke +
tests) passes AND a manual two-tab playthrough shows the affected system behaving identically.

**Acceptance Scenarios**:

1. **Given** a module is extracted, **When** the game runs, **Then** that system behaves exactly
   as before (movement, combat, HUD, networking, enemies, rounds).
2. **Given** the scene is restarted (title → game → title → game), **When** modules tear down,
   **Then** there are zero leaked timers/tweens/listeners/sprites (closes the current partial-
   teardown leak).
3. **Given** the decomposition is complete, **When** `npm run check` runs, **Then** all headless
   gates stay green and the protocol stays single-source.

### User Story 2 - Behavior-preserving performance (Priority: P2)

As the developer, hot-path allocations and churn are reduced (object pools for FX/enemies,
dirty-checked depth sorting, precomputed anim keys, scalar math) with **identical** game feel.

**Why this priority**: Smoother performance under load (many enemies/particles) without changing
feel. Lower priority than maintainability and strictly behavior-neutral.

**Acceptance Scenarios**:

1. **Given** pooled FX/enemies, **When** many waves are played, **Then** visuals are identical
   (no stale font/background/tint/alpha leaks on recycled objects) and no pre-dead or
   invisible-but-alive enemies appear.
2. **Given** the perf changes, **When** the game runs, **Then** all game-feel constants, tween
   durations/eases, RNG calls, and depth values are unchanged.

### Edge Cases

See [`plan.md`](./plan.md) "Cross-cutting footguns" and the "Adversarial Review" section for the
full hazard list (this-binding, overlap context, teardown, shared `attackHitEnemies` Set identity,
pooling reset completeness incl. backgroundColor/padding, depth-formula divergence, dpadState
consume-while-dead ordering, takeHit fallback normalization).

## Requirements *(mandatory)*

- **FR-001**: Extraction MUST preserve player-facing behavior exactly (constants, formulas, depth
  values, tween durations/eases, RNG calls, update()-loop ordering byte-for-byte).
- **FR-002**: `GameScene` MUST become a composition root; each module MUST own its own
  `SHUTDOWN` teardown (tweens, timers, listeners, sprites).
- **FR-003**: The protocol MUST remain single-source (`npm run check:protocol` green) and all
  headless gates (`npm run check`) MUST stay green after every step.
- **FR-004**: Performance optimizations MUST be behavior-neutral; object-pool reuse MUST fully
  reset every mutable visual/state field on acquire (no leaks across recycles).
- **FR-005**: The three distinct depth formulas (player / enemy / remote) MUST be preserved per
  call site (not unified).
- **FR-006**: Each step MUST be independently shippable/reversible and validated by build + smoke
  + a targeted manual visual check before the next.

## Success Criteria *(mandatory)*

- **SC-001**: Full two-tab manual regression shows every system behaving identically to pre-refactor.
- **SC-002**: Repeated scene restarts leak zero timers/tweens/listeners/sprites.
- **SC-003**: `npm run check` stays green throughout; protocol stays single-source.
- **SC-004**: `GameScene.js` shrinks from ~1,573 lines to a thin composition root, with logic in
  cohesive single-responsibility modules.
- **SC-005**: Game feel (movement, combat timing, knockback, animations, z-order) is unchanged.

## Assumptions

- Implemented where the game can be run in a browser for visual verification (RTX workstation).
- The plan's decomposition order (FactionTints → Hud → RemotePlayerManager → NetworkSync →
  EnemyManager → PlayerStatus → CombatResolver → PlayerController) is followed smallest/safest first.
- The Phaser 3.60 `tweens.timeline` crash was already fixed in the prior pass (banner uses
  `tweens.chain`), so the Hud extraction moves working code.
- Object pooling (the riskiest perf items) is implemented only with exhaustive reset coverage; if
  a clean reset can't be guaranteed for an FX type, that item is dropped (YAGNI) rather than risked.
