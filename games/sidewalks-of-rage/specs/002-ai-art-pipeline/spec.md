# Feature Specification: Local AI Art Pipeline

**Feature Branch**: `002-ai-art-pipeline`

**Created**: 2026-06-23

**Status**: Draft (ready for `/speckit-plan` review → `/speckit-implement` on the RTX workstation)

**Input**: Replace the game's placeholder art with cohesive, satirical, hand-art-quality
sprites and backgrounds, generated **entirely locally** on an NVIDIA RTX 3090 (24 GB VRAM,
64 GB RAM, Linux) by a **reproducible, scripted** pipeline whose outputs drop into the existing
Phaser loader with **zero code changes** (exact filenames, dimensions, frame layouts, and the
inverted enemy facing mapping are honored). Research backing this spec is in
[`research.md`](./research.md); the exact drop-in targets are in
[`contracts/asset-manifest.md`](./contracts/asset-manifest.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replace player + enemy + background with cohesive art (Priority: P1)

As the game's developer, I generate a cohesive set of satirical sprites (player character,
generic enemy, city background) on my local GPU and drop them into `assets/` so the game
visually matches its tone, with no code changes and no cloud services.

**Why this priority**: This is the entire point — turn the prototype's placeholder art into a
finished look. A single cohesive trio (player sheet + enemy sheet + background) is a complete,
shippable visual upgrade on its own.

**Independent Test**: Run the pipeline to produce the five drop-in files at the exact
dimensions in the asset manifest, replace the files in `assets/`, run the game, and confirm the
player animates (idle/walk/attack), enemies animate (walk/attack/hit/down) facing the correct
direction, and the background renders — all with the new art and no console errors.

**Acceptance Scenarios**:

1. **Given** the pipeline has run, **When** the five manifest files are placed in `assets/`,
   **Then** the game loads them with no change to `GameScene.js`/`Enemy.js` preload or animation
   definitions.
2. **Given** the new player sheet, **When** the player idles/walks/attacks and faces left or
   right, **Then** the correct frames play and the character is centered with feet at the
   sprite's bottom edge (origin bottom-center) and fits the existing physics body.
3. **Given** the new enemy sheet, **When** an enemy walks/attacks/takes a hit/dies facing either
   direction, **Then** the correct 4×4 grid frames play and the enemy faces its movement
   direction (honoring the inverted texture mapping).
4. **Given** archetype tints and faction tints, **When** they are applied as runtime multiply
   tints over the base art, **Then** colors read cleanly (because the base art is light/neutral),
   including the white on-hit flash.

---

### User Story 2 - Regenerate all art with one reproducible command (Priority: P2)

As the developer, I can regenerate the entire art set deterministically from checked-in
workflow definitions, prompts, a master palette, and an orchestration script, so art is a
reproducible build artifact rather than hand-managed binaries.

**Why this priority**: Reproducibility makes art iterable and aligns with the project's
deterministic-build principle. It depends on P1's per-asset workflows existing.

**Independent Test**: From a clean checkout (with models present locally), run the single
orchestration command and confirm it regenerates all manifest assets at the correct
specs without manual steps beyond art-direction curation.

**Acceptance Scenarios**:

1. **Given** the checked-in ComfyUI workflow JSON, prompts, master palette, and orchestration
   script, **When** the developer runs one command, **Then** the pipeline generates → cuts out
   → upscales → palette-normalizes → assembles grid sheets for every manifest asset.
2. **Given** a re-run with unchanged inputs and fixed seeds, **When** generation completes,
   **Then** outputs are stable/repeatable (modulo intentional curation), and the assembly step
   always emits exact-dimension grid sheets.
3. **Given** the pipeline, **When** it runs, **Then** it uses only local services (no cloud
   API calls) and only commercially-licensed models.

---

### User Story 3 - Lock character identity across frames and facings (Priority: P3)

As the developer, I keep a character visually identical across all its animation frames and
both facings, so animations don't "shimmer" between frames.

**Why this priority**: Consistency is the hard part of AI sprite work and elevates quality, but
the game is playable with P1's art even if consistency is imperfect; this is a refinement.

**Independent Test**: Generate a full animation cycle for one character and confirm the
character's design/identity is stable frame-to-frame and the left sheet is a faithful mirror of
the right.

**Acceptance Scenarios**:

1. **Given** a locked character design, **When** frames are generated for each pose, **Then**
   identity is held via a trained character LoRA (production) or IPAdapter (iteration) plus
   pose-only ControlNet, with fixed seed and constrained style prompt.
2. **Given** a finished right-facing sheet, **When** the left-facing sheet is produced, **Then**
   it is a horizontal mirror assigned per the manifest's facing mapping.

---

### Edge Cases

- **Wrong FLUX tier**: using a non-commercial FLUX variant for shipped assets is a licensing
  violation — the pipeline MUST default to commercially-safe models.
- **Pre-saturated base art**: if base art isn't light/neutral, runtime multiply tints render
  muddy — treated as a generation defect to re-render, not a code fix.
- **Inverted enemy facing**: `enemy1.png` is the LEFT texture and `enemy1-left.png` the RIGHT
  texture; mis-assigning makes enemies "moonwalk."
- **Atlas vs grid**: the game uses fixed-grid `load.spritesheet`, not a trimmed atlas — the
  assembly step MUST emit uniform exact-cell grids, not a packed/trimmed atlas.
- **Tiny on-screen size**: sprites render at scale 0.22–0.5; art needs bold silhouettes/outlines
  and minimal fine detail or it turns to mush.
- **Tint-only variants**: there is ONE base enemy and ONE base player; all 5 archetypes and both
  factions are runtime tints — generating per-variant art is out of scope (would need code
  changes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pipeline MUST run entirely on the local RTX 3090 with no cloud/API dependency
  for generation or post-processing.
- **FR-002**: The pipeline MUST use only models whose licenses permit commercial game-asset use
  (e.g., SDXL OpenRAIL++-M, Apache-2.0 models), and MUST NOT use non-commercial model tiers for
  shipped assets.
- **FR-003**: Generated assets MUST match the exact filenames, pixel dimensions, and frame
  layouts the code already expects (see `contracts/asset-manifest.md`) so they are drop-in with
  no code change.
- **FR-004**: The enemy textures MUST honor the inverted facing mapping (`enemy1.png` = left,
  `enemy1-left.png` = right).
- **FR-005**: Character/enemy base art MUST be light-valued/neutral so runtime multiply tints
  (archetype + faction + white hit-flash) read cleanly.
- **FR-006**: Sprite art MUST be on transparent alpha, horizontally centered, with feet at the
  bottom edge (origin bottom-center), and fit within the existing physics body proportions.
- **FR-007**: The pipeline MUST produce uniform fixed-cell grid sheets (player 6×1 @128px; enemy
  4×4 @240px), NOT a trimmed atlas, matching `load.spritesheet`.
- **FR-008**: Identity MUST be held across an animation set via pose-only ControlNet plus a
  trained character LoRA (production) or IPAdapter (iteration), with fixed seed and constrained
  style prompt.
- **FR-009**: Left-facing sheets MUST be produced as horizontal mirrors of the right-facing
  sheet (the engine selects sheets by direction; it does not flip in code).
- **FR-010**: The full art set MUST be regenerable by a single checked-in orchestration command
  from checked-in inputs (workflow JSON, prompts, master palette, packer/assembly config).
- **FR-011**: The pipeline stages (generate → cut out → upscale → palette-normalize → assemble)
  MUST each be scriptable/batchable and individually runnable.
- **FR-012**: The art style MUST be a cohesive satirical editorial-cartoon caricature consistent
  with the game's existing copy and tone.
- **FR-013**: The pipeline MUST quantize all sprites to a shared master palette so the whole cast
  shares one color set.
- **FR-014**: Setup, prompts, seeds, model list/versions, and licenses MUST be documented so the
  environment is reproducible on the target workstation.

### Key Entities

- **Asset**: A drop-in file (sprite sheet or background) with exact name/dimensions/layout/facing.
- **Character design**: The locked visual identity of player or generic enemy (light/neutral).
- **Pose skeleton**: An OpenPose/ControlNet input defining one animation frame's pose, reused
  across characters.
- **Master palette**: The shared color set all sprites are quantized to.
- **Workflow definition**: ComfyUI API-format JSON parameterized per character/action/frame.
- **Orchestration script**: The single entry point chaining all stages over the asset matrix.

## Success Criteria *(mandatory)*

- **SC-001**: After running the pipeline and copying the five files into `assets/`, the game runs
  with the new art and **zero** source changes and no load/console errors.
- **SC-002**: 100% of generated assets match the manifest's exact dimensions and frame layouts.
- **SC-003**: All shipped art is produced by commercially-licensed, fully-local models (no cloud
  calls during generation).
- **SC-004**: The entire art set can be regenerated by a single command from checked-in inputs.
- **SC-005**: Runtime tints (5 archetypes, 2 factions, white hit-flash) render cleanly over the
  base art with no muddiness.
- **SC-006**: A character's identity is visually stable across its full animation cycle and its
  left sheet is a faithful mirror of its right.

## Assumptions

- The target workstation has the RTX 3090, Linux, Python, and capacity to install ComfyUI,
  models, kohya_ss, rembg, an upscaler, and Pillow/PyTexturePacker (per `research.md`).
- Art direction/curation is a human-in-the-loop step (the pipeline automates generation +
  post-processing + assembly, not taste); expect to over-generate and hand-pick per pose.
- Scope is the three existing art surfaces: player sheet (+mirror), generic enemy sheet
  (+mirror), and background. Per-archetype art, Rogan-specific player art, and image-based
  billboards/storefronts are **out of scope** (would require code changes — see manifest).
- Models are downloaded/managed on the workstation; this spec doesn't vendor model weights.
