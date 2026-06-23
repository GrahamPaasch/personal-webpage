---
description: "Task list for Local AI Art Pipeline (002)"
---

# Tasks: Local AI Art Pipeline

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[contracts/asset-manifest.md](./contracts/asset-manifest.md)

**Run on**: the RTX 3090 workstation (Linux), via `/speckit-implement` in ultra mode.

**Tests**: verification is in-game visual + a dimension/layout check on outputs (no unit-test
framework). The drop-in check is the acceptance gate.

**Path note**: pipeline sources under `art-pipeline/`; outputs into `games/sidewalks-of-rage/assets/`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (workstation environment)

- [ ] T001 Install ComfyUI headless + start on 127.0.0.1:8188 (systemd/tmux); confirm API reachable
- [ ] T002 [P] Install SDXL 1.0 base + a Pony/Illustrious/NoobAI SDXL derivative + a satirical cartoon style LoRA; record exact model files + licenses in art-pipeline/README.md
- [ ] T003 [P] Install ControlNet (OpenPose + lineart) models and the ComfyUI ControlNet + IPAdapter_plus (cubiq) nodes
- [ ] T004 [P] Install post-processing tools: rembg, waifu2x-ncnn-vulkan (or Real-ESRGAN anime), Pillow (+libimagequant), PyTexturePacker
- [ ] T005 [P] Install kohya_ss / sd-scripts for character LoRA training (optional until designs lock)
- [ ] T006 Create art-pipeline/ skeleton (workflows/, prompts/, poses/, palette/, scripts/, README.md) and a .gitignore entry for large local model/LoRA weights
- [ ] T007 LICENSE GATE: confirm every model selected for shipped assets is commercially licensed (SDXL OpenRAIL++-M / Apache-2.0 / SD3.5 <$1M); document and EXCLUDE non-commercial FLUX tiers (FR-002)

**Checkpoint**: generation backend + post tools installed; licenses cleared.

## Phase 2: Foundational (designs, poses, palette)

- [ ] T008 Lock the PLAYER design: generate a clean light/neutral lab-coat "science authority" caricature hero render (bold outline, tiny-size-readable silhouette) per contracts style (FR-005, FR-012)
- [ ] T009 Lock the GENERIC ENEMY design: one light-gray "conspiracy crank / mob protester" caricature that serves all 5 archetypes via tint (FR-005, asset-manifest tint table)
- [ ] T010 [P] Build the reusable OpenPose skeleton library: idle, walk-A, walk-B (player); walk×4, attack×4, hit×4, down×4 (enemy 4×4) in art-pipeline/poses/ (FR-008)
- [ ] T011 [P] Define the master palette (art-pipeline/palette/master-palette.png) so all sprites quantize to one shared color set (FR-013)
- [ ] T012 Author the ComfyUI API-format workflow JSON (SDXL + pose ControlNet @0.4–0.65 first ~20% steps + IPAdapter/LoRA identity, fixed seed) in art-pipeline/workflows/ (FR-008)
- [ ] T013 (Optional, production-quality) Train a character LoRA per locked design in kohya_ss (10–30 captioned images) for durable cross-frame identity (FR-008)

**Checkpoint**: designs locked, poses + palette + workflow ready.

## Phase 3: User Story 1 — generate the five drop-in assets (P1) 🎯 MVP

- [ ] T014 [US1] Generate `background.png` (1536×1024, opaque) — satirical city sidewalk, walkable strip in bottom ~13% (asset-manifest #1)
- [ ] T015 [US1] Generate player frames 0–5 (idle/walk×2, attack×3) via workflow; over-generate and curate per pose
- [ ] T016 [US1] Post-process player frames: rembg cutout → upscale → palette-quantize → `getbbox()` normalize onto 128×128 cells (centered, feet at bottom, fit 56×96 body region) (FR-006, FR-007)
- [ ] T017 [US1] Assemble `fauci-sheet-fixed.png` (768×128, 6×1 grid, RIGHT) with assemble_sheets.py (exact cells, no trim) (FR-007)
- [ ] T018 [US1] Produce `fauci-sheet-fixed-left.png` as a horizontal mirror of #2 (FR-009)
- [ ] T019 [US1] Generate enemy frames for the 4×4 grid (walk 0–3, attack 4–7, hit 8–11, down 12–15); curate per pose
- [ ] T020 [US1] Post-process + assemble `enemy1.png` (960×960, 4×4 @240px) as the **LEFT** texture (asset-manifest inverted mapping, FR-004)
- [ ] T021 [US1] Produce `enemy1-left.png` as the mirror, assigned as the **RIGHT** texture (FR-004, FR-009)
- [ ] T022 [US1] DROP-IN VALIDATION: copy the 5 files into assets/, run the game, verify player + enemy animate correctly in both facings, background renders, archetype/faction tints + white hit-flash read cleanly, and there are NO code changes or console errors (SC-001, SC-002, SC-004-runtime, SC-005)

**Checkpoint**: the game looks finished with cohesive new art (MVP).

## Phase 4: User Story 2 — one-command reproducibility (P2)

- [ ] T023 [US2] Implement art-pipeline/scripts/generate.py: ComfyUI API driver iterating the character×action×frame matrix (patch nodes by ID, POST /prompt, await via ws, fetch via /history+/view) (FR-010, FR-011)
- [ ] T024 [P] [US2] Implement postprocess.py (rembg → upscale → palette → normalize, batch/folder) (FR-011)
- [ ] T025 [P] [US2] Implement assemble_sheets.py (frames → exact uniform grid sheets + mirrors) (FR-007)
- [ ] T026 [US2] Implement build_art.py one-command orchestrator chaining generate → postprocess → assemble for all manifest assets (FR-010)
- [ ] T027 [US2] Check in workflows/prompts/poses/palette/scripts; verify a clean re-run with fixed seeds reproduces the asset set (SC-004)

**Checkpoint**: `python art-pipeline/scripts/build_art.py` regenerates all art.

## Phase 5: User Story 3 — identity consistency (P3)

- [ ] T028 [US3] Validate cross-frame identity for each character (fixed seed + constrained prompt + LoRA/IPAdapter); re-generate drifting frames (SC-006)
- [ ] T029 [US3] Verify each left sheet is a faithful mirror of its right sheet and facing assignments match the manifest (SC-006, FR-004/009)

## Phase 6: Polish & docs

- [ ] T030 [P] Write art-pipeline/README.md: setup, model list + licenses, how to run, per-asset notes (FR-014)
- [ ] T031 [P] Re-verify the research.md model caveats (FLUX.2 klein date, sd-scripts version, VRAM figures) against current sources before relying on them
- [ ] T032 Optionally tune in-engine: if archetypes need real visual distinction (not just tint), flag the code change (out of current scope per manifest)

---

## Dependencies & Execution Order

- Phase 1 (setup) → Phase 2 (designs/poses/palette/workflow) → Phase 3 (assets, MVP).
- Phase 4 (reproducibility) depends on Phase 3's per-asset steps existing.
- Phase 5 (consistency) refines Phase 3 output.
- US1 alone delivers the visual upgrade (MVP); US2/US3 add reproducibility/quality.

## Notes

- Human-in-the-loop curation dominates wall-clock: over-generate ~10–20 candidates per pose and
  hand-pick. The pipeline automates generation + post + assembly, not art direction.
- HARD licensing gate (T007): never ship non-commercial FLUX tiers.
- The game needs NO code change for these assets; keep it that way (FR-003). Anything requiring
  code (per-archetype art, image billboards) is explicitly out of scope.
