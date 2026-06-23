# Sidewalks of Rage — Hardening & Optimization Blueprint

**Goal:** Harden and optimize the game **without changing any player-facing behavior**.
All numeric game-feel constants, formulas, depth values, tween durations/eases, RNG
calls, network throttle math, and update()-loop ordering MUST be preserved byte-for-byte.

**Strategy:** Land low-risk infra + server + perf wins first (each independently
shippable and reversible), then do the high-risk `GameScene.js` decomposition last,
extracting the smallest, most leaf-like module first.

**Verification primitives** (the only headless gates available in this repo):
- `npm run check:protocol` — protocol single-source-of-truth guard (`scripts/check-protocol.mjs`).
- `npm run build` — Vite production build into `../../public/sidewalks-of-rage/`.
- `npm run smoke` — headless 2-client multiplayer end-to-end (`scripts/smoke-multiplayer.mjs`, binds port 8123).
- `npm run check` — runs all three in order; this is the pre-merge gate.
- **New Node tests** are introduced where noted (plain `node` scripts under `scripts/`,
  exit 0/1, no test framework added per Constitution V / YAGNI).

**Environment confirmed:** Node 20 (`.nvmrc`), `phaser@3.90.0` installed, `ws@^8.18.3`
(server-only, not in client graph), Vite `^5.4.0`, `type: module`. No `.github/workflows`
dir exists yet. `vite.config.js` is the unmodified 3-key version. `.gitignore` has no
`server/state.json` entry.

> **CRITICAL PRE-EXISTING BUG (do NOT silently fix during refactor):**
> `GameScene.js:976` calls `this.tweens.timeline({...})`. `TweenManager#timeline` was
> **removed in Phaser 3.60**; this project is on **3.90.0**, so `showRoundEndBanner()`
> **throws at runtime** when a `ROUND_END` message arrives. This is latent because the
> smoke test never renders the banner. It is tracked as **Step 12 (separate, signed-off
> fix)** and must NOT be folded into any "behavior-preserving" extraction. The Hud
> extraction (Step 13) preserves it verbatim.

---

## Decomposition order (smallest / safest module first)

When Step 13 (GameScene decomposition) is reached, extract modules in this exact order.
Each is its own sub-step (13a..13h) so it can be built, smoke-tested, and committed
independently before the next:

1. **`FactionTints.js`** — pure leaf, zero imports, stateless. (13a)
2. **`Hud.js`** — display-only, reacts to setters; owns its own resize listeners + tween teardown. (13b)
3. **`RemotePlayerManager.js`** — self-contained sprite/label map, no combat coupling. (13c)
4. **`NetworkSync.js`** — owns Client + handlers; routes to Hud / RemotePlayerManager / faction setter. (13d)
5. **`EnemyManager.js`** — spawn scheduler + waves + overlap registration (uses injected live getters). (13e)
6. **`PlayerStatus.js`** — health / damage / death / respawn. (13f)
7. **`CombatResolver.js`** — both-direction hit resolution glue (most cross-cutting). (13g)
8. **`PlayerController.js`** — sprite + state + per-frame movement/anim/attack/depth/label. (13h)

Rationale: leaf-purity and lifecycle-independence increase down the list; `PlayerController`
and `CombatResolver` share the `attackHitEnemies` Set by reference and the consumed
`dpadState`, so they are most entangled and go last. `PlayerStatus.isPlayerDead` and
`PlayerController.swingState` are read by nearly everything, so the readers
(EnemyManager, CombatResolver) are wired before the owners are fully carved out — done by
introducing the modules with live getters/closures, never copied state.

---

## Ordered steps

### Step 1 — Add scoped CI workflow
- **id:** `ci-workflow`
- **risk:** low
- **files:** `/.github/workflows/sidewalks-of-rage-ci.yml` (net-new; repo root, NOT game dir)
- **actions:**
  - Create the workflow exactly as specified in the infra analysis:
    - `on: push (branches: [main])` and `pull_request`, both `paths`-filtered to
      `games/sidewalks-of-rage/**` and the workflow file itself.
    - `concurrency: group sidewalks-of-rage-${{ github.ref }}, cancel-in-progress: true`.
    - `permissions: contents: read`.
    - One job `build-and-test` on `ubuntu-latest` with
      `defaults.run.working-directory: games/sidewalks-of-rage`.
    - Steps: checkout@v4 → setup-node@v4 (`node-version: '20'`, `cache: 'npm'`,
      `cache-dependency-path: games/sidewalks-of-rage/package-lock.json`) →
      `npm install` → `npm run check:protocol` → `npm run build` → `npm run smoke`
      as **discrete** steps (so a failure names the stage).
  - Keep `npm install` (task-specified). Note in a comment that `npm ci` is available
    since a lockfile exists, if reproducible installs are later preferred.
- **verify:** `npm run check` locally still passes; push a branch and confirm the
  Actions run goes green. YAML parse can be checked locally with
  `node -e "require('js-yaml')"` not available — instead rely on the GitHub run.
  No code paths change, so no behavior risk.

### Step 2 — Add game README
- **id:** `readme`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/README.md` (net-new)
- **actions:** Write the README using the 10-section outline from the infra analysis
  (Overview, Tech Stack, Quick Start, npm Scripts table, Project Structure, Network
  Protocol, SDD/Spec Kit workflow, Constitution, Build & Deploy, CI). Link out to
  `specs/001-core-game-baseline/contracts/network-protocol.md`,
  `.specify/memory/constitution.md`. Document the canonical protocol list and the
  `check`/`smoke` gates. Do NOT duplicate the root website README.
- **verify:** Docs-only; `npm run build` unaffected. Manually confirm all referenced
  paths exist (`specs/001-core-game-baseline/`, `.specify/memory/constitution.md`,
  scripts). No behavior risk.

### Step 3 — Optimize Vite bundle config
- **id:** `bundle-config`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/vite.config.js`
- **actions:** Overwrite with the optimized version from the infra analysis.
  - **PRESERVE EXACTLY:** `base: '/sidewalks-of-rage/'`, `build.outDir:
    '../../public/sidewalks-of-rage/'`, `server.allowedHosts: true`.
  - **ADD:** `build.rollupOptions.output.manualChunks: { phaser: ['phaser'] }`,
    `build.chunkSizeWarningLimit: 1600`, `build.sourcemap: false`,
    `build.minify: 'esbuild'` (explicit). Keep comments explaining intent.
  - Do NOT touch `assetsInlineLimit` (PNGs load via Phaser loader, not the JS graph).
- **verify:** `npm run build` succeeds, emits a separate `phaser-<hash>.js` chunk, and
  no chunk-size warning fires. Confirm output still lands in
  `../../public/sidewalks-of-rage/` with `base` intact (check generated `index.html`
  asset paths start with `/sidewalks-of-rage/`). No runtime behavior change.

### Step 4 — Server: file-based state persistence
- **id:** `persistence`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/server/index.js`,
  `/games/sidewalks-of-rage/.gitignore`
- **actions:**
  - Add `server/state.json` and `server/state.json.tmp` to `.gitignore`.
  - In `server/index.js`: import `fs`, `path`, `fileURLToPath`. Resolve
    `STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'state.json')`
    (NOT `process.cwd()` — smoke spawns server with cwd=package root, real `npm run
    server` differs).
  - `loadState()` on boot (synchronous, before `wss` accepts messages): `fs.readFileSync`
    in try/catch; on ENOENT or parse error fall back to defaults. Validate with existing
    `toNumber`/`clamp` helpers — coerce `globalScore.fauci/rogan` to finite non-negative
    integers, clamp `battleLinePosition` to `[0,100]`. Never crash boot on a corrupt file
    (log + fall back). Persist into the existing `globalScore` object (line 13) and
    `roundState.battleLinePosition` (line 14). **Always boot `roundState.active = true`**
    (do not persist `active`). Do NOT persist the player roster/sockets.
  - `saveState()` helper: write to `state.json.tmp` then `fs.renameSync` to `state.json`
    (atomic). Call it from exactly two sites: `endRound()` (after `globalScore[winner] += 1`
    and after the line reset, ~line 134/138) and `applyKillToBattleLine()` (after the
    clamp, ~line 149).
  - Centralize the filename constant near `BATTLE_LINE_STEP` (Constitution III).
- **verify:** New Node test `scripts/test-persistence.mjs` (exit 0/1): start the server,
  drive a kill, kill the process, assert `server/state.json` exists with valid clamped
  values; restart server and assert the loaded `GLOBAL_SCORE`/`ROUND_STATE` on a fresh
  client reflect the persisted values. Clean up `state.json` after. Also run `npm run
  smoke` to confirm the round-drive flow is unaffected. `npm run check:protocol`
  unchanged (no wire-protocol change). Delete `state.json` before/after smoke so it
  doesn't leak persisted score into the smoke assertions.

### Step 5 — Server: kill rate-limit anti-cheat
- **id:** `kill-anti-cheat`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/server/index.js`,
  `/games/sidewalks-of-rage/scripts/smoke-multiplayer.mjs`
- **actions:**
  - Add centralized constants near `BATTLE_LINE_STEP` with unit/intent comments:
    `const KILL_LIMITS = { MIN_KILL_INTERVAL_MS: 250, KILL_WINDOW_MS: 10000,
    MAX_KILLS_PER_WINDOW: 25 };`
  - On the per-connection `player` object (created ~line 185), add `lastKillAt = 0` and
    `killTimes = []`.
  - In the `PLAYER_KILL` handler (line 261-262), BEFORE `applyKillToBattleLine`:
    1. `now = Date.now()`; if `now - player.lastKillAt < MIN_KILL_INTERVAL_MS` → silently
       `return` (do not update `lastKillAt`).
    2. Drop `killTimes` entries older than `KILL_WINDOW_MS`; if `killTimes.length >=
       MAX_KILLS_PER_WINDOW` → silently `return`.
    3. Sanity: only proceed if `roundState.active === true`. Keep the existing
       `FACTIONS.includes(faction)` guard inside `applyKillToBattleLine`.
    4. On ACCEPT: push `now` to `killTimes`, set `lastKillAt = now`, then call
       `applyKillToBattleLine(player.faction)`.
  - Rejection behavior: silent `return` (no broadcast, no disconnect). Optional
    `console.warn` for observability.
  - **No protocol change.** The optional `{ enemyId }` typed payload is explicitly
    DEFERRED (forgeable, near-zero security; do not add server enemy bookkeeping).
  - **Lockstep test fix (required):** the smoke loop at line 95 sleeps 60ms between kills;
    a 250ms `MIN_KILL_INTERVAL_MS` would reject ~3 of 4 and the loop never reaches
    `ROUND_END`. Change `await sleep(60)` → `await sleep(300)` and ensure the iteration
    count (line 93) still yields ≥20 accepted kills to span 50→extreme (bump the cap from
    30 to e.g. 40 if needed for headroom). The single-kill section (lines 79-87, already
    300ms) is unaffected.
- **verify:** New Node test `scripts/test-kill-limit.mjs` (exit 0/1): connect one client,
  fire kills every ~50ms and assert the battle line advances at the throttled rate (not 1
  step per message) and that exceeding `MAX_KILLS_PER_WINDOW` in `KILL_WINDOW_MS` stops
  advancing. Then run `npm run smoke` — must still reach `ROUND_END` + global-score
  increment + reset with the 300ms loop. `npm run check:protocol` unchanged.

### Step 6 — Perf: object pools for damage numbers + particles + speech bubbles
- **id:** `perf-pool-fx`
- **risk:** medium
- **files:** `/games/sidewalks-of-rage/src/utils/CombatSystem.js`,
  `/games/sidewalks-of-rage/src/scenes/GameScene.js` (pool init only),
  `/games/sidewalks-of-rage/src/entities/Enemy.js` (speech bubble)
- **actions:** Introduce scene-owned pools: a reusable `Rectangle` particle pool and a
  floating `Text` pool (damage numbers + speech bubbles share the text pool), sized to the
  centralized max counts. In `spawnDamageNumber`/`spawnHitParticles`/`spawnDeathExplosion`
  (`CombatSystem.js:122-220`) and `Enemy.spawnSpeechBubble` (`Enemy.js:358-382`): acquire
  from pool, fully reset (`setPosition`, `setText`, `setActive(true)`, `setVisible(true)`,
  alpha=1, scale reset, tint/clearTint, rotation=0, origin, depth, **fontSize +
  strokeThickness for critical vs normal** — critical uses `'22px'` vs `'16px'`), stop any
  in-flight tween on the acquired object, re-fire the existing tween config; in `onComplete`
  return to pool via `setActive(false)/setVisible(false)` instead of `destroy()`. Preserve
  ALL durations, counts, sizes, colors, eases, and random ranges exactly. Pass pool refs
  through the existing scene-parameter signature so call sites are unchanged.
- **verify:** `npm run build` succeeds. `npm run smoke` unaffected (no network surface).
  Manual two-tab visual smoke: damage numbers/particles/speech bubbles render identically
  (size, color, float, fade) across many combo hits; confirm no stale visual state (a
  critical "22px" number must never leak its large font onto a subsequent normal hit, and a
  pooled object must never appear at alpha 0). Behavior risk is incomplete reset — checklist
  every mutable visual field on acquire.

### Step 7 — Perf: enemy pooling (recycle instead of destroy)
- **id:** `perf-pool-enemies`
- **risk:** medium
- **files:** `/games/sidewalks-of-rage/src/entities/Enemy.js`,
  `/games/sidewalks-of-rage/src/scenes/GameScene.js` (group + spawn path, lines 269/591)
- **actions:** Convert `this.enemies` to a pooled group; add `Enemy.reset(x, y, target,
  archetypeIndex, difficultyMod)` that re-runs all per-instance constructor init (stats,
  health, facing, tint, label text/visibility, `scheduleSpeech`). On death, deactivate
  (`setActive(false)`, `setVisible(false)`, `body.enable = false`) and return to the group
  instead of `destroy()`; on spawn use `group.get()` + `reset(...)`.
  **Reset MUST clear ALL mutable state:** `health`, `isDying`, `inHitstop`,
  `knockbackUntil`, `lastHitTime`, `lastAttackTime`, `alpha=1`, tint, scale, `body.enable`,
  active animation, and re-show/reposition `nameLabel`. **Cancel prior `once
  ('animationcomplete')` and all stored `delayedCall` TimerEvents** (see Step 8) so a
  recycled enemy never inherits a stale death-fade or speech timer. Keep
  `ENEMY_ARCHETYPES`, all stat math, cooldowns, and tween durations identical.
- **verify:** `npm run build`. `npm run smoke` (enemy sim is client-side; smoke does not
  exercise it, so this is a build + manual gate). Manual long-session two-tab smoke: kill
  many waves, confirm recycled enemies spawn at full health/alpha/correct tint with visible
  labels, never appear pre-dead or invisible-but-alive, and speech bubbles fire at normal
  cadence. **Do Step 6 (lower-risk pooling) before this.** Highest behavior risk of the
  perf set — exhaustive reset coverage is mandatory.

### Step 8 — Bug/perf: Enemy timer + animationcomplete listener hygiene
- **id:** `enemy-listener-hygiene`
- **risk:** medium
- **files:** `/games/sidewalks-of-rage/src/entities/Enemy.js`
- **actions:** (Prerequisite/companion to Step 7.)
  - In `die()` (lines 319-334) clear prior animationcomplete listeners
    (`this.off('animationcomplete')`) before registering the death `once(...)`, OR switch
    to keyed `animationcomplete-<key>` events, so a stale `playAttackAnim` (lines 250-258)
    listener can't intercept the knockdown completion and strand the enemy
    (invisible-but-alive, body disabled, never fades/destroys — the leak in the perf
    analysis bug list).
  - Store the `takeHit` white-flash 120ms `delayedCall` (lines 275-283) and the
    `scheduleSpeech` chained `delayedCall` (lines 347-356) as TimerEvent handles; remove
    them in `die()`/`destroy()`/`reset()`. With pooling (Step 7) these uncancelled timers
    become real correctness bugs (recycled enemy gets a stale tint-restore or speech).
  - Preserve all timing constants and the `if (this.active)` guards' net behavior for live
    enemies (this only changes teardown/recycle correctness, not in-life behavior).
- **verify:** `npm run build`. Manual: kill an enemy mid-attack repeatedly and confirm it
  always fades + destroys/recycles (no stuck invisible enemies); confirm tint-restore never
  fires on a dying/recycled enemy. Run alongside Step 7's manual long-session smoke.

### Step 9 — Perf: dirty-checked depth sorting + cached displayHeight (enemies + labels)
- **id:** `perf-depth-cache`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/src/entities/Enemy.js` (preUpdate, lines 241-247)
- **actions:** Cache `lastDepthY`; only call `this.setDepth(this.y)` when `this.y` changed
  beyond a small epsilon since last frame (keeps the **identical** depth value `this.y`,
  just avoids dirtying the display list every frame). Gate `nameLabel.setDepth(this.depth+1)`
  behind the same depth-changed check. Cache `displayHeight` into an instance field (set in
  constructor and on `reset()`) and reuse for the label offset and depth math instead of the
  per-access getter. **Refresh `lastDepthY` and the cached `displayHeight` on any non-velocity
  reposition** (knockback tween, respawn, reset) to avoid one-frame stale ordering. Keep the
  `-4` / `-displayHeight` offset constants identical.
- **verify:** `npm run build`. Manual: enemies and labels render in the same z-order as
  before (no flicker, correct front/back during overlap and knockback). Behavior-identical
  because depth VALUES are unchanged. Depends on Step 7's `reset()` existing for the cache
  refresh hook (sequence after Step 7).

### Step 10 — Perf: precomputed anim-key maps in Enemy preUpdate
- **id:** `perf-anim-keys`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/src/entities/Enemy.js` (lines 205,229,232,251,255,286,316)
- **actions:** Define frozen module-level maps (`WALK_ANIM`, `HIT_ANIM`, `ATTACK_ANIM`,
  `DOWN_ANIM` each `{ left, right }`) producing byte-identical key strings to today's
  template literals. Index by `this.facing` instead of building strings each frame. Cache
  the current-anim key once per `preUpdate` into a local instead of repeated
  `?.startsWith(...)` reads. Ensure maps cover `'left'` and `'right'` exactly.
- **verify:** `npm run build`. Manual: enemy animations select identically in all four
  directional cases (walk/hit/attack/down, left/right). Strings are identical → no behavior
  change.

### Step 11 — Perf: scalar math + reusable snapshots (allocation removal)
- **id:** `perf-scalar-alloc`
- **risk:** low
- **files:** `/games/sidewalks-of-rage/src/utils/CombatSystem.js` (lines 76-89, 106),
  `/games/sidewalks-of-rage/src/entities/Enemy.js` (289-295),
  `/games/sidewalks-of-rage/src/scenes/GameScene.js` (1508, 714, 1102),
  `/games/sidewalks-of-rage/src/ui/VirtualDPad.js` (248-251)
- **actions:**
  - `applyKnockback` (106): replace `Vector2` with `const dir = Math.sign(target.x -
    attacker.x) || 1;` then tween x by `dir * config.distance` (y is always 0). Reproduces
    the `lengthSq<0.001 -> (1,0)` fallback exactly for the x-only case.
  - `applyHitstop` (76-89): drop the per-call dedup `Set` (player vs enemy are always
    distinct objects); iterate `getTweensOf` arrays in place and pause/resume. If the
    distinct-object invariant could ever change, reuse a single cleared module scratch array
    instead.
  - `Enemy.takeHit` (289-295) and player lunge (`GameScene.js:1508`): compute
    `dx`,`dy`,`len=Math.hypot(dx,dy)`, zero-fallback via `Phaser.Math.Between(-1,1)` for
    both components (preserve the exact RNG calls), else divide by `len`; apply velocity
    directly with no `Vector2`. Keep `knockbackSpeed (220)`, the `160ms` window,
    `attackLungeDistance`, and the `0.35` y-weight unchanged.
  - `setEnemyTargets` (1102): replace `forEach` with an indexed `for` loop (no closure).
    `processPlayerAttackHits` (714): keep the live-array `for..of`, do not introduce
    `.filter()/.slice()` copies; do not mutate the group while iterating.
  - `VirtualDPad.getInputState` (248-251): return a single reusable instance snapshot
    object (copy 6 fields each call) and a shared frozen disabled object; still clear
    `attackJustPressed/jumpJustPressed` on `this.state` as today. **Invariant:** caller
    must read synchronously and not retain across frames (GameScene does — confirmed).
- **verify:** `npm run build`. `npm run smoke` (network unaffected). Manual: knockback
  direction/distance, hitstop pause/resume, lunge, and touch D-pad edge inputs
  (`justPressed` consumed once per frame) behave identically. RNG-driven knockback feel
  identical because the same `Between(-1,1)` calls remain.

---

> **GATE:** Steps 1-11 + 12 should be merged and green on CI before starting Step 13.
> Each of 1-11 is independently shippable/reversible.

### Step 12 — (SEPARATE, SIGNED-OFF) Fix the Phaser 3.90 `tweens.timeline` removal bug
- **id:** `fix-round-banner-timeline`
- **risk:** medium
- **files:** `/games/sidewalks-of-rage/src/scenes/GameScene.js` (showRoundEndBanner, ~976)
- **actions:** This is a **real bug fix that changes behavior** (banner currently throws on
  `ROUND_END`), so it requires explicit sign-off and is NOT part of any behavior-preserving
  step. Replace `this.tweens.timeline({...})` with the Phaser 3.60+ equivalent: either
  `this.tweens.chain({ targets, tweens: [...] })` or an array of sequential `this.tweens.add`
  calls reproducing the same per-segment durations/eases/delays. Keep the stored handle
  (`this.roundEndBannerTween`) and its `?.stop()` teardown so Step 13b (Hud) can move it
  intact. Do this BEFORE the Hud extraction so Hud extracts working code.
- **verify:** New Node-driven manual check: with the dev client open in two tabs, drive a
  round to an extreme (or use a debug trigger) and confirm the round-end banner animates in
  and out without a console exception. `npm run build` + `npm run smoke` (smoke does not
  render the banner, so this is a manual visual gate). Get maintainer sign-off since this is
  an intentional behavior change.

### Step 13 — GameScene decomposition (HIGH RISK) — extract in decompositionOrder
- **id:** `gamescene-decompose`
- **risk:** high
- **files (created):**
  `/games/sidewalks-of-rage/src/factions/FactionTints.js`,
  `/games/sidewalks-of-rage/src/ui/Hud.js`,
  `/games/sidewalks-of-rage/src/network/RemotePlayerManager.js`,
  `/games/sidewalks-of-rage/src/network/NetworkSync.js`,
  `/games/sidewalks-of-rage/src/enemies/EnemyManager.js`,
  `/games/sidewalks-of-rage/src/player/PlayerStatus.js`,
  `/games/sidewalks-of-rage/src/combat/CombatResolver.js`,
  `/games/sidewalks-of-rage/src/player/PlayerController.js`
- **files (modified):** `/games/sidewalks-of-rage/src/scenes/GameScene.js` (becomes a thin
  composition root: preload + create wiring + delegating update()).
- **Cross-cutting footguns to honor in EVERY sub-step (from the scene analysis):**
  - **`this` rebinding:** every moved method's `this.time/tweens/add/cameras/scale/physics`
    becomes `this.scene.*`. The 6th-arg callback context in `physics.add.overlap` must
    become the owning manager instance; overlap callbacks read player/combat state via
    injected refs, not the scene's `this`.
  - **SHUTDOWN teardown:** every module that creates tweens, delayedCalls, recurring timers,
    `scale.on('resize')` listeners, `client.on()` handlers, or sprites MUST register its own
    `events.once(SHUTDOWN, ...)` (copy the `VirtualDPad` model, lines 64-66 + destroy()).
    This FIXES the current partial-teardown leaks (create() lines 117-122) as a structural
    consequence — preserve runtime behavior, only add missing teardown.
  - **Depth formulas are NOT unified:** player uses `y + displayHeight*(1-originY)`
    (lines 111/885/1546); remote uses the same in `setSpriteDepth` (1196); Enemy uses plain
    `setDepth(y)` (Enemy.js:241). Preserve each call site's exact formula.
  - **Physics body magic numbers** (setupPlayer 138-142: `setSize(56,96)`,
    `setOffset((128-56)/2, 128-96)` tied to 128px frame, origin (0.5,1), scale 0.5) must be
    reproduced in the exact origin/scale order. Enemy's `setSize(24,48,true)` center-flag
    convention is separate — don't cross-contaminate.
  - **update()-loop order (1439-1559) is strict:** `dpadState` fetched ONCE at top (1440,
    has consume side effects); pass it INTO `PlayerController.update(delta, dpadState,
    {now})` — never re-fetch. Order: jump-JustDown → movement integrate → attack-JustDown →
    `processPlayerAttackHits(now)` → anim select → clampToBounds (skip while jumping) →
    depth set → label → throttled network send. The `PLAYER_ATTACK` send (1499-1503) fires
    at the same point in the swing-trigger block — inject as an `onAttack(payload)` callback
    so timing is identical.
  - **Shared-by-reference state:** `attackHitEnemies` Set lives in
    `PlayerController.swingState` and is mutated by `CombatResolver.processPlayerAttackHits`
    (727); cleared on swing start (1497). Share the Set identity, never copy.
    `PlayerStatus.isPlayerDead` is read live everywhere (update 1441, overlaps 661/733/762,
    spawn target 591) — expose as the single live source, never copied.

#### 13a — Extract `FactionTints.js` (lowest risk)
- **risk:** low
- **moves from:** `getFactionTint` (1199-1207), `applyFactionTint` (1209-1216).
  `applyPlayerFactionTint`/`setPlayerFaction` STAY (go to PlayerController later); they
  import `getFactionTint`.
- **interface:** `export const FACTION_TINTS = { fauci: 0x3b82f6, rogan: 0xef4444 };`
  `export function getFactionTint(faction): number|null;`
  `export function applyFactionTint(sprite, faction): void;`
- **CRITICAL:** `getFactionTint` returns `null` (not `undefined`) for unknown factions;
  callers rely on `?? fallback` (lines 963, 1047-1048). Keep zero imports (leaf, no cycles).
- **verify:** `npm run build`; `npm run smoke`. Tints render identically (player + remote +
  banner + battle-line).

#### 13b — Extract `Hud.js`
- **risk:** medium
- **moves from:** `setupScoreUI` 282-304, `setupBattleLine` 306-326, `setupRoundEndBanner`
  328-350, `setupKillMessageUI` 352-364, `setupDeathOverlay` 366-400, `showKillMessage`
  909-927, `showDeathOverlay` 929-947, `hideDeathOverlay` 949-954, `showRoundEndBanner`
  956-992, `updateBattleLineUI` 1032-1070, `updateRoundEndBannerLayout` 1072-1083,
  `updateGlobalScoreText` 1085-1092.
- **interface:** `constructor(scene, { getFactionTint, getScore })`; `create(width,height)`;
  `setScore(n)`; `setGlobalScore({fauci,rogan})`; `setBattleLine(position, factionCounts)`;
  `showRoundEndBanner(winner)`; `showKillMessage(playerX, playerY, displayHeight)`;
  `showDeathOverlay({score,totalKills,currentWave})`; `hideDeathOverlay()`.
- **CRITICAL:** Move BOTH `scale.on('resize')` registrations (324, 348) AND their teardown
  into Hud's own SHUTDOWN (currently torn down in create() 119-120 — do not leave halves
  split). Stop `killMessageTween` + `roundEndBannerTween` in Hud SHUTDOWN. Preserve depth
  values (1000/1001/1500/1600/2000) exactly. `showKillMessage` takes player x/y/displayHeight
  as args (don't reference the sprite). `showRoundEndBanner` uses the now-fixed (Step 12)
  chain/array tween — move verbatim.
- **verify:** `npm run build`; `npm run smoke`. Manual two-tab: score/global-score text,
  battle-line bar + resize, kill popup, death overlay, round-end banner all render +
  re-layout on resize identically; restart scene → no leaked resize/tween handlers.

#### 13c — Extract `RemotePlayerManager.js`
- **risk:** medium
- **moves from:** `normalizeFacing` 1191-1193, `setSpriteDepth` 1195-1197,
  `getRemoteLabelText` 1245-1253, `setRemoteLabelTint` 1255-1265, `positionRemoteLabel`
  1267-1274, `syncRemoteLabel` 1276-1288, `upsertRemotePlayer` 1290-1308, `createRemotePlayer`
  1310-1340, `updateRemotePlayer` 1342-1380, `playRemoteAttack` 1382-1422, `removeRemotePlayer`
  1424-1435. Holds the `remotePlayers` Map.
- **interface:** `constructor(scene, { getLocalPlayerId, getFactionTint })`;
  `upsert(playerState)`; `update(playerState)`; `playAttack(playerState)`; `remove(id)`;
  `get map()`; `setSpriteDepth(sprite)`.
- **CRITICAL:** Add destroy-all-sprites+labels + clear Map in SHUTDOWN (this is the ONLY
  added behavior and is safe — currently leaked). `setSpriteDepth` formula (1196) differs
  from Enemy's `setDepth(y)` — keep as-is. `createRemotePlayer` fallback to local player x/y
  when missing (1316-1317) — preserve via a getter/spawn coords. `id===playerId` filter
  (1292,1311) → `getLocalPlayerId` must read live (id arrives async via `PLAYER_ID`). Keep
  the `once('animationcomplete')` in `playRemoteAttack` (1416) on the sprite.
- **verify:** `npm run build`; `npm run smoke` (verifies remote join/move/attack/leave
  broadcast). Manual two-tab: remote sprites/labels create/move/attack/remove with correct
  faction tint + depth; scene restart leaves no orphaned remote sprites.

#### 13d — Extract `NetworkSync.js`
- **risk:** medium
- **moves from:** `setupNetwork` 431-449, `reportKill` 1094-1099, `registerNetworkHandlers`
  1111-1187 (12 message types), throttled send block in update 1549-1558.
- **interface:** `constructor(scene, { player, getFacing, getIsAttacking, hud,
  remotePlayers, setPlayerFaction })`; `connect()`; `tick(now)` (throttled PLAYER_MOVE);
  `sendAttack(payload)`; `reportKill()`; `get playerId()`; `disconnect()`.
- **CRITICAL:** `playerId` read live via getter (used by reportKill 1095, update send-gate
  1549, remote upsert filters 1292/1311). `onOpen` (438-445) reads player x/y/facing/
  isAttacking live via getters. Throttle interval `1000/15` and the `if (sent)` guard (1555)
  copied exactly. `ROUND_STATE` handler calls `hud.setBattleLine` in the same order.
  Single source for `battleLinePosition` (feeds `EnemyManager.getDifficultyModifier`) —
  store on NetworkSync/shared RoundState and inject a getter; do not duplicate. SHUTDOWN:
  disconnect + detach handlers. No protocol change → `check:protocol` stays green.
- **verify:** `npm run build`; `npm run check:protocol`; `npm run smoke` (full handshake +
  move/attack/kill/round-end/global-score flow). Manual two-tab: faction assignment, battle
  line, global score, round end all sync identically.

#### 13e — Extract `EnemyManager.js`
- **risk:** medium-high
- **moves from:** `setupEnemies` 268-280, `getDifficultyModifier` 509-526,
  `getSpawnDelayModifier` 534-539, `scheduleNextEnemySpawn` 541-552, `spawnEnemy` 554-596,
  `advanceWave` 598-603, `setupWaveSystem` 402-425, `showWaveAnnouncement` 605-633,
  `setEnemyTargets` 1101-1107.
- **interface:** `constructor(scene, { player, getPlayerFaction, getBattleLinePosition,
  isPlayerDead, hud, comboTracker, combatResolver })`; `start()`; `getDifficultyModifier()`;
  `getSpawnDelayModifier()`; `scheduleNextEnemySpawn()`; `spawnEnemy()`; `advanceWave()`;
  `showWaveAnnouncement()`; `setTargets(target)`; `get group()`; `registerKill()`.
- **CRITICAL:** `getDifficultyModifier` reads `playerFaction` + `battleLinePosition` via
  injected LIVE getters/closures — never copy. The recurring spawn `delayedCall` must guard
  re-arm against post-SHUTDOWN firing (store the TimerEvent + remove on SHUTDOWN, or check
  `scene.sys.isActive()`) — but **preserve the exact delay math (543-547)**. `spawnEnemy`
  passes `isPlayerDead ? null : player` (591) — read `isPlayerDead` live. Overlap registered
  with correct context so callbacks resolve. `enemiesPerWave`/`currentWave` math (601)
  byte-identical. Note `waveActive` is currently dead state (set, never read) — document,
  do NOT change its semantics. Build EnemyManager AFTER CombatResolver interface is decided
  (it injects `combatResolver`), but overlap callbacks can be wired via 13g's resolver
  instance; sequence 13e before 13g but pass the resolver in once it exists, or wire overlap
  registration in `start()` called after both exist.
- **verify:** `npm run build`; `npm run smoke`. Manual long-session two-tab: spawn cadence,
  difficulty rubber-banding vs battle line, wave announcements, and edge placement identical;
  scene restart → spawn loop stops (no `spawnEnemy` on a torn-down scene).

#### 13f — Extract `PlayerStatus.js`
- **risk:** high
- **moves from:** `setupHealthBar` 226-252, `damagePlayer` 783-831, `triggerPlayerDeath`
  835-866, `respawnPlayer` 868-905, `updateHealthBar` 994-1030.
- **interface:** `constructor(scene, { player, comboTracker, hud, onDeath, onRespawn,
  setEnemyTargets })`; `setupHealthBar()`; `damage(amount, source)`; `triggerDeath()`;
  `respawn()`; `updateHealthBar()`; `get health()`; `get isDead()`; `get maxHealth()`.
  Owns `playerHealth/playerMaxHealth/isPlayerDead/lastPlayerHitTime/playerHitCooldownMs`.
- **CRITICAL:** `isPlayerDead` is the single live source of truth (read by update,
  overlaps, spawn target, setEnemyTargets) — expose via getter, never copy. Death clears
  player attack/jump state (844-849) which physically lives in PlayerController — call into
  it (inject callback). Respawn re-applies faction tint + depth (SAME formula as 111/885) +
  re-targets enemies; preserve the call ORDER (879-890). The 120ms tint-restore delayedCall
  (799-807) and respawn flash (893-904) **can race — preserve as-is** (flagged bug, not
  fixed here). SHUTDOWN: stop knockback/flash tweens + cancel pending tint/respawn
  delayedCalls.
- **verify:** `npm run build`; `npm run smoke`. Manual two-tab: taking damage (tint flash,
  knockback, shake, combo reset), death overlay, respawn invincibility flash + reposition +
  faction-tint restore + enemy retarget all behave identically.

#### 13g — Extract `CombatResolver.js` (most cross-cutting)
- **risk:** high
- **moves from:** `isPlayerAttackActive` 637-649, `canPlayerHitEnemy` 651-658,
  `handlePlayerEnemyOverlap` 660-707, `processPlayerAttackHits` 709-730, `canEnemyHitPlayer`
  732-759, `handleEnemyPlayerOverlap` 761-781.
- **interface:** `constructor(scene, { getSwingState, enemiesGroup, playerStatus,
  comboTracker, hud, onKill, getIsPlayerDead, getIsJumping })`; `isPlayerAttackActive(now)`;
  `canPlayerHitEnemy(player, enemy)`; `handlePlayerEnemyOverlap(player, enemy)`;
  `processPlayerAttackHits(now)`; `canEnemyHitPlayer(player, enemy)`;
  `handleEnemyPlayerOverlap(player, enemy)`.
- **CRITICAL:** Mutates score/totalKills/enemiesKilledThisWave (688-703) which belong to
  Hud/Scene/EnemyManager — call into them (route wave-advance via `onKill`/
  `EnemyManager.registerKill`), do NOT own them. Score formula
  `1 * Math.max(1, Math.floor(comboCount/3))` (689) and shake-intensity formula (685) copied
  exactly. `processPlayerAttackHits` reads/adds to `PlayerController.swingState.attackHitEnemies`
  Set **by reference** (727); the Set is cleared in PlayerController on swing start (1497) —
  share identity, do not copy. `canEnemyHitPlayer` reads isJumping/isAttacking/facing via
  injected live getters. Stateless aside from injected refs.
- **verify:** `npm run build`; `npm run smoke`. Manual two-tab: player→enemy hits
  (hitstop/knockback/particles/damage/combo/score/kill/wave bookkeeping) and enemy→player
  hits (depth tolerance, jump i-frames, cooldown, attacker priority) behave identically;
  per-swing dedupe (no double-hit in one swing) intact.

#### 13h — Extract `PlayerController.js` (last; most entangled)
- **risk:** high
- **moves from:** `setupPlayer` 131-143, `setupPlayerAnimations` 145-182, `setupPlayerState`
  184-224, `clampPlayerToBounds` 453-469, `startJump` 471-495, `applyPlayerFactionTint`
  1218-1229, `setPlayerFaction` 1231-1243, `updatePlayerLabel` 1561-1572, and the player
  slices of `update()` 1447-1547.
- **interface:** `constructor(scene, { width, height })`; `create()`; `update(delta,
  dpadState, { now })`; `clampToBounds()`; `startJump()`; `applyFactionTint()`;
  `setFaction(faction)`; `get sprite()`; `get facing()`; `get isAttacking()`;
  `get isJumping()`; `get swingState()` → `{ isAttacking, attackStartTime,
  attackActiveStartMs, attackActiveEndMs, facing, attackHitEnemies }`; `updateLabel()`.
- **CRITICAL:** Body size/offset magic numbers (138-142) reproduced in exact frame/origin/
  scale order. `update()` ordering preserved; `dpadState` PASSED IN (consumed once at scene
  top, never re-fetched) to keep JustDown/justPressed consume semantics. Depth formula at
  1546 matches create (111) and respawn (885). The `PLAYER_ATTACK` send (1499-1503) fires at
  the same swing-trigger point — injected as `onAttack(payload)` callback so timing is
  identical. `swingState.attackHitEnemies` exposed BY REFERENCE so CombatResolver dedupe
  stays in sync; cleared on swing start (1497). SHUTDOWN: stop `attackTween` + `jumpTween`.
- **verify:** `npm run build`; `npm run smoke`. Manual two-tab: movement, jump (i-frames +
  startY capture), attack windup/active-window, anim selection, bounds clamp (skipped while
  jumping), depth sort, label follow, faction tint, and throttled PLAYER_MOVE/PLAYER_ATTACK
  network sends all behave/feel identically; no dropped edge inputs (single getInputState
  per frame); scene restart leaves no dangling tweens.

#### 13-final — GameScene as composition root
- **risk:** medium
- **actions:** GameScene retains constructor/preload/create wiring and a thin `update()` that
  calls `dpadState = virtualDPad.getInputState()` ONCE, then delegates in the strict order:
  `playerController.update(delta, dpadState, {now})` (which internally runs movement →
  attack-trigger → `combatResolver.processPlayerAttackHits(now)` via callback → anim → clamp
  → depth → label) → `networkSync.tick(now)`. The single `events.once(SHUTDOWN)` in create()
  (117-122) is reduced to only scene-level concerns; every module owns its own teardown.
  Confirm no method still references moved state via the scene's `this`.
- **verify:** `npm run check` (all three gates) green; full manual two-tab regression of
  every system above; repeated scene restart (title → game → title → game) shows zero
  leaked timers/handlers/sprites (the original partial-teardown leak class is closed).

---

## Risk summary (ordered)

| # | id | risk | primary gate |
|---|----|------|--------------|
| 1 | ci-workflow | low | CI run green |
| 2 | readme | low | docs only |
| 3 | bundle-config | low | `npm run build` (phaser chunk) |
| 4 | persistence | low | new `test-persistence.mjs` + smoke |
| 5 | kill-anti-cheat | low | new `test-kill-limit.mjs` + smoke (300ms) |
| 6 | perf-pool-fx | medium | build + manual visual |
| 7 | perf-pool-enemies | medium | build + manual long-session |
| 8 | enemy-listener-hygiene | medium | build + manual mid-attack kill |
| 9 | perf-depth-cache | low | build + manual z-order |
| 10 | perf-anim-keys | low | build + manual anim |
| 11 | perf-scalar-alloc | low | build + smoke + manual feel |
| 12 | fix-round-banner-timeline | medium | manual banner (SIGNED-OFF behavior change) |
| 13 | gamescene-decompose | high | full `npm run check` + manual regression, per sub-step |

## Notes for the implementer
- Constitution touchpoints: I (protocol unchanged — `check:protocol` stays green through all
  steps), II (kill guard is mitigation only; true server-authoritative enemies is out of
  scope), III (KILL_LIMITS + state-file name as centralized named constants; all game-feel
  constants preserved), IV (keyboard+touch parity preserved — VirtualDPad snapshot change must
  not alter edge-input consume semantics), V (no new deps; fs/path built-ins only; YAGNI on
  persistence schema/versioning).
- Stale doc: CLAUDE.md's "Known gap to remediate" note about MESSAGE_TYPES duplication is
  stale — `server/index.js` already imports from `src/network/protocol.js`. Optionally remove
  during Step 2.
- `PLAYER_LEAVE` is defined in protocol but only the ws `close` → `PLAYER_LEFT` path is
  handled; confirm intentional (not a CI blocker).
- Smoke test flake risks to watch on CI: fixed 800ms bind sleep
  (`smoke-multiplayer.mjs:45`) and hardcoded port 8123 — fine for the single-job workflow;
  convert to a readiness poll only if smoke becomes flaky.
- Delete `server/state.json` in CI/smoke runs (or have smoke ignore persisted score) so
  persistence (Step 4) does not leak prior global score into smoke's score assertions.

## Adversarial Review

Reviewer: adversarial subagent (Opus 4.8). Scope: verify the blueprint against the
actual source (server/index.js, vite.config.js, GameScene.js, Enemy.js, CombatSystem.js,
smoke-multiplayer.mjs, package.json, .gitignore) and hunt for ways each step BREAKS the
working game or fails to fix the stated issue. Verdict: APPROVED WITH REQUIRED FIXES.

### Verified-correct claims (no action)
- phaser@3.90.0 is installed (node_modules/phaser/package.json), so `this.tweens.timeline`
  at GameScene.js:976 is a live ROUND_END crash. The `fix-round-banner-timeline` step is
  real and correctly gated as a separate signed-off behavior change. **NOTE:** package.json
  pins phaser `^3.80.1` (not 3.90.0); the installed/resolved version is what crashes, but a
  future clean install could resolve a different 3.x. Pin or document the dependency.
- Player body math `setSize(56,96)` / `setOffset((128-56)/2, 128-96)` (GameScene.js:138-142)
  matches blueprint step (d) exactly.
- Three distinct depth formulas confirmed and correctly preserved: player/`y+dh*(1-oy)`
  (111/885/1546), enemy/`setDepth(this.y)` (Enemy.js:241), remote/`sprite.y+dh*(1-oy)` (1196).
- check-protocol.mjs, constitution.md, contracts/network-protocol.md, and .specify/scratch/
  all exist; README links will resolve. No step modifies src/network/protocol.js, so
  MESSAGE_TYPES stays single-source (Constitution I intact).
- package-lock.json EXISTS, so CI cache-dependency-path is valid (prefer `npm ci` over
  `npm install` for reproducibility).
- `endRound()` flips `roundState.active` false→true synchronously (server/index.js:133-139),
  so the proposed `require roundState.active===true` kill gate never deadlocks.
- `applyKnockback` Math.sign rewrite is behavior-equivalent (original `Vector2(dx,0).normalize()`
  fallback `set(1,0)` == `Math.sign(dx)||1` for all three sign cases).

### REQUIRED FIXES (block as-is)

1. [HIGH] kill-anti-cheat MIN_KILL_INTERVAL_MS=250 BREAKS legitimate AoE/cluster kills.
   `processPlayerAttackHits` (GameScene.js:709-730) loops over ALL enemies in a single frame;
   each landed hit can call `takeHit`→`die()`→`reportKill()`→`client.sendKill()`. A single
   swing landing on multiple low-HP enemies fires N PLAYER_KILL messages in the SAME tick
   (~16ms apart). The 250ms min-interval guard SILENTLY DROPS all but the first, so the
   server battle-line under-counts legitimate multi-kills and desyncs from the client score/
   combo display. This is core to the intended combo fantasy (2-HP Blogger/Karen archetypes
   make 1-HP cluster states common). RECOMMENDATION: drop MIN_KILL_INTERVAL_MS entirely (or
   set it to a small burst-tolerant value like 30-40ms AND allow a same-frame burst), and
   rely on MAX_KILLS_PER_WINDOW as the real throttle. Better: defer the whole rate-limit until
   the deferred enemyId/server-authoritative-enemy work, since with client-authoritative
   enemies a cheater can simply send PLAYER_KILL at exactly the throttle ceiling — the guard
   caps cheat throughput at MAX_KILLS_PER_WINDOW=25/10s (2.5/s) but does NOT prevent the
   exploit (10 kills = one round win in ~4s of spam, still trivial). So the guard is
   mitigation-of-magnitude only, and as specified it harms legit play more than it bounds
   cheating. At minimum, remove the per-kill interval; keep only the window cap.

2. [MED] persistence: globalScore and roundState are declared `const` (server/index.js:13-14).
   loadState() MUST mutate properties in place (globalScore.fauci=..., roundState.active=true),
   never reassign the binding — a `globalScore = loaded` would throw at boot. Spell this out in
   the step so the implementer does not crash startup.

3. [MED] perf-pool-fx: damage-number and speech-bubble Text pools share one pool, but their
   styles DIVERGE. Speech bubbles set `backgroundColor:'#333333aa'` + `padding:{x:4,y:2}`
   (Enemy.js:366-367); damage numbers set NEITHER. The blueprint's reset list enumerates
   fontSize/strokeThickness/tint/alpha/scale/rotation but OMITS backgroundColor and padding.
   A pooled object reused damage→speech→damage will leak a grey background box and padding
   onto plain damage numbers (and vice-versa). RECOMMENDATION: either use SEPARATE pools for
   damage numbers vs speech bubbles, or add setBackgroundColor(null/'#333333aa') + padding
   reset to the acquire path. Also: damage numbers use depth 2000, speech bubbles use
   `this.depth+1` (~enemy.y) — both already in the reset list as "depth", confirm it is
   actually re-applied per acquire.

4. [MED] perf-pool-enemies: vanilla `group.get()` cannot reconstruct an Enemy. Enemy's
   constructor signature is (scene,x,y,target,archetypeIndex,difficultyMod); Phaser's
   `Group.get(x,y,key,frame)` passes none of target/archetype/difficultyMod, and the group
   has no `classType`/factory wired (created as bare `this.physics.add.group()` at
   GameScene.js:269). The pooling step MUST add a custom acquire (find-inactive-or-construct)
   that calls the real constructor on first build and `reset(...)` on reuse — not rely on
   `group.get()`. Also `this.enemies.countActive(true)` (line 560) is the spawn cap and is
   correct for a pool ONLY if dead enemies are setActive(false); verify the death path sets
   active=false BEFORE the next spawn tick or the cap will wedge at currentMax and starve
   spawns.

### SHOULD-FIX (non-blocking but real)

5. [MED] enemy-listener-hygiene + pooling interaction with shared `attackHitEnemies` Set.
   The Set (GameScene.js:209, cleared per swing at :1497) holds enemy REFERENCES. With
   recycling, an enemy returned to the pool and re-acquired within the same ~300ms swing
   window keeps its identity, so a stale Set entry would cause the newly-respawned enemy to
   be skipped by processPlayerAttackHits for the remainder of that swing. Low probability but
   non-zero under heavy spawn churn. Mitigation: clear the enemy from attackHitEnemies inside
   Enemy.reset()/on-recycle, or key the Set by a per-spawn id rather than object identity.

6. [MED] die() stale-listener fix is correct in intent but verify ordering. die() registers
   `this.once('animationcomplete', ...)` (Enemy.js:319) while playAttackAnim ALSO registered
   one (Enemy.js:253). The blueprint's `this.off('animationcomplete')` in die() is the right
   call, but it must run BEFORE die()'s own `once()`, and the takeHit 120ms tint-restore
   delayedCall (Enemy.js:275) must be stored+cancelled in die()/reset() or it will re-tint a
   recycled enemy. Confirm both the attack-complete listener AND the tint-restore timer are
   cleared, plus the scheduleSpeech chained delayedCall (Enemy.js:348).

7. [LOW] perf-scalar-alloc Enemy.takeHit fallback semantics. Current code builds
   `Vector2(dx,dy)`, and on near-zero length sets `(Between(-1,1),Between(-1,1))` THEN
   `.normalize()` (Enemy.js:289-293) — the fallback is normalized to unit length. The
   blueprint says "zero-fallback via Between(-1,1) for both components, else divide by len."
   If the rewrite applies the raw Between values WITHOUT normalizing, the fallback knockback
   magnitude changes (un-normalized vector * knockbackSpeed). To stay byte-identical, the
   fallback branch must also normalize (or hypot+divide the Between values). Same RNG calls,
   but preserve the normalization. (Affects only the degenerate same-position case; rare but
   it IS a feel change.)

8. [LOW] update()/dpadState consume-while-dead semantics. update() fetches
   `this.virtualDPad.getInputState()` at the TOP (GameScene.js:1440) BEFORE the
   `if (this.isPlayerDead) return` early-out (:1441). getInputState clears justPressed flags,
   so flags are consumed every frame even while dead. The decomposition step (e) says "fetch
   dpadState ONCE at scene top, pass into PlayerController.update" — this is correct ONLY if
   the fetch+consume still happens before/independent of the dead-check. If PlayerController
   fetches or the consume moves after the dead early-return, a queued tap survives the death
   window and fires a phantom attack/jump on respawn. Preserve: fetch+consume unconditionally
   each frame, dead-check after.

9. [LOW] perf-depth-cache epsilon. Gating setDepth behind a y-epsilon is safe for z-order,
   but pick epsilon small enough that slow-moving enemies still re-sort relative to each other
   (sub-epsilon-per-frame drift could accumulate). Recommend epsilon <= 0.5px; do NOT skip the
   nameLabel depth update on the frames the body depth DID change.

10. [LOW] CI/smoke: smoke spawns server on fixed PORT 8123 with an 800ms bind sleep
    (smoke-multiplayer.mjs:18,45). Acceptable for a single CI job, but the persistence step
    writes server/state.json relative to the server file dir — the CI job and smoke MUST
    delete state.json before AND after smoke (already flagged in notes) or a persisted score
    from a prior run leaks into the kill-direction/round-end assertions. Make this an explicit
    CI step, not just a note. Also prefer `npm ci` (lockfile present) over `npm install`.

11. [LOW] decomposition SHUTDOWN coverage. Current teardown (GameScene.js:117-122) only
    handles client.disconnect, two resize off()s, and roundEndBannerTween.stop(). It does NOT
    currently stop: the recursive scheduleNextEnemySpawn delayedCall (:548), waveTween,
    attackTween, comboTween/streakTween, the 120ms tint-restore timers, or per-enemy
    scheduleSpeech timers. The decomposition's per-module SHUTDOWN handlers are the RIGHT fix,
    but this means the decomposition is CLOSING a pre-existing leak, i.e. it is NOT purely
    behavior-neutral on scene restart (previously leaked timers could fire into a dead scene).
    That is an improvement, but call it out as an intentional behavior change on restart and
    regression-test title->game->title->game as the step already requires.

### Game-feel preservation
No step, as written, intends to alter tunable constants, durations, eases, RNG call counts,
or update ordering. The two genuine behavior changes are correctly isolated and gated:
(a) fix-round-banner-timeline (signed-off), and (b) the SHUTDOWN teardown closing leaked
timers on restart. The anti-cheat (Fix #1) is the one place where the plan AS-WRITTEN would
silently change observable behavior (dropped legitimate multi-kills) — that is why approval
is conditional on removing MIN_KILL_INTERVAL_MS.

### Bottom line
Safe to implement with the REQUIRED FIXES (#1-#4) applied. #1 is the only item that would
both fail to meaningfully fix the exploit AND harm legitimate play; the rest are correctness/
leak footguns that the verification gates should catch but should be pre-empted in the step
text. The ordering (low-risk shippable steps before the gated high-risk decomposition) is
sound.
