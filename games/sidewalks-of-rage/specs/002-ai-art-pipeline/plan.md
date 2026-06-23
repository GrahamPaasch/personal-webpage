# Implementation Plan: Local AI Art Pipeline

**Branch**: `002-ai-art-pipeline` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md), research in [research.md](./research.md), drop-in targets in
[contracts/asset-manifest.md](./contracts/asset-manifest.md).

## Summary

Stand up a fully-local, scriptable image-generation pipeline on the RTX 3090 that turns a small
set of locked character designs into the five exact drop-in assets the game already loads. The
backbone is **ComfyUI (headless, API-driven) + SDXL + ControlNet (pose) + IPAdapter/LoRA
(identity)**, followed by a CLI/Python post chain (**rembg → upscale → Pillow palette-normalize →
grid assembly**). All inputs (workflow JSON, prompts, master palette, orchestration script) are
checked in so "regenerate all art" is one command. Intended to be implemented on the workstation
via `/speckit-implement` in ultra mode; art-direction curation is human-in-the-loop.

## Technical Context

**Target platform**: Linux + NVIDIA RTX 3090 (24 GB VRAM), 64 GB RAM. Fully local; no cloud.

**Generation backend**: ComfyUI headless on `127.0.0.1:8188`, API-format workflows.

**Primary model**: SDXL 1.0 fp16 (~6–8 GB VRAM) + a Pony/Illustrious/NoobAI SDXL derivative
base + satirical cartoon style LoRA. License: CreativeML OpenRAIL++-M (commercial OK).

**Fast-draft model**: FLUX.2 [klein] 4B (Apache 2.0, ~13 GB) **or** SDXL Turbo/Lightning LoRA.

**Conditioning/consistency**: ControlNet OpenPose+lineart (pose, strength 0.4–0.65, first ~20%
of steps); IPAdapter + FaceID Plus (training-free identity, iteration); kohya_ss character LoRA
(durable identity, production — SDXL rank 32–64, fits 24 GB easily).

**Post-processing**: rembg (`isnet-anime`); waifu2x-ncnn-vulkan or Real-ESRGAN anime; Pillow
(palette quantize to master palette, NEAREST pixelation, `getbbox()` canvas normalization);
grid assembly via Pillow (uniform cells — NOT a trimmed atlas).

**Licensing constraint (hard gate)**: ship only OpenRAIL++-M / Apache-2.0 / SD3.5-community
(<$1M) models. NEVER ship FLUX.1 [dev], FLUX.2 [dev], or FLUX.2 [klein] 9B (non-commercial).

**Storage**: outputs to `games/sidewalks-of-rage/assets/`; pipeline sources under a new
`art-pipeline/` dir (workflows, prompts, palette, scripts). Model weights live on the
workstation, not vendored in the repo.

**Scale/scope**: 3 base designs (player, generic enemy, background) → 5 drop-in files; ~6 player
frames + 16 enemy frames.

## Constitution Check

*GATE: tooling/asset feature; most principles are about the game runtime, applied loosely here.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Single-source protocol | ✅ N/A | No protocol/code change; assets are drop-in. |
| II | Server-authoritative MP | ✅ N/A | No networking involved. |
| III | Centralized constants | ✅ PASS | Tints/scales/frame specs already centralized in code; the manifest mirrors them, doesn't duplicate logic. |
| IV | Input parity | ✅ N/A | No input changes. |
| V | Deterministic build / YAGNI | ✅ PASS (reinforced) | "Regenerate art with one command from checked-in inputs" directly extends the deterministic-build ethos; no new runtime deps (pipeline tooling is dev-only, on the workstation). |

**Gate result**: PASS. This feature adds no game-runtime dependency and changes no game code;
it produces drop-in binaries that match the existing loader contract.

## Project Structure

```text
specs/002-ai-art-pipeline/
├── spec.md, plan.md, research.md
├── contracts/asset-manifest.md      # exact drop-in targets
├── checklists/requirements.md
└── tasks.md                          # /speckit-tasks output

art-pipeline/                         # NEW (created during implement; pipeline sources)
├── workflows/                        # ComfyUI API-format JSON (per asset type)
├── prompts/                          # per-character/style prompt fragments + seeds
├── poses/                            # OpenPose skeletons (idle/walk/attack/hit/down)
├── palette/master-palette.png        # shared quantization palette
├── loras/                            # (workstation-local; gitignored if large)
├── scripts/
│   ├── generate.py                   # ComfyUI API driver (matrix: character×action×frame)
│   ├── postprocess.py                # rembg → upscale → palette → normalize
│   ├── assemble_sheets.py            # Pillow: frames → exact-cell grid sheets
│   └── build_art.py                  # one-command orchestrator (calls the above)
└── README.md                         # setup + run + model/license list

games/sidewalks-of-rage/assets/       # OUTPUT (the 5 drop-in files; existing dir)
```

**Structure Decision**: Keep all generation tooling under a new `art-pipeline/` dir (dev-only,
on the workstation) cleanly separated from the shipped game. The only files that touch the game
are the five binaries written into `assets/`. Large model weights/LoRAs stay workstation-local
(gitignored). This honors Constitution V (game runtime gains no dependency).

## Phases

- **Phase 0 (research)**: complete — see [research.md](./research.md) (models, VRAM, consistency,
  automation, asset mapping; sources cited; one caveat noted to re-verify model release dates).
- **Phase 1 (environment + design lock)**: install ComfyUI + models + post tools; lock the player
  and generic-enemy designs as light/neutral hero renders; build the reusable pose-skeleton
  library + master palette.
- **Phase 2 (per-asset generation)**: generate each frame set with pose ControlNet + identity,
  post-process, assemble exact-cell grids, produce mirrors. Validate drop-in in the game.
- **Phase 3 (reproducibility)**: wire the one-command orchestrator; check in workflows/prompts/
  palette/scripts; document setup + licenses.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|------|-----------|--------------------------------------|
| ComfyUI + ControlNet + LoRA stack | Frame-consistent, pose-controlled sprites need pose conditioning + identity locking | One-shot txt2img can't hold identity/pose across an animation cycle |
| New `art-pipeline/` dir + scripts | Reproducible "one command" regeneration (Constitution V) | Hand-generating in a GUI is not reproducible/auditable |
