# Local AI Art-Generation Pipeline for "Sidewalks of Rage"

**Target hardware:** NVIDIA RTX 3090 (24GB VRAM), 64GB system RAM, Linux.
**Goal:** A fully local, scriptable pipeline that produces drop-in Phaser 3 sprite-sheet/atlas assets matching the game's exact frame sizes, archetypes, and factions.
**Date:** 2026-06 (current). Web access was available for the model/tooling research angles; it was **NOT** available for the asset-manifest angle (that angle was derived from direct source-code inspection, which is more authoritative anyway and was re-verified for this consolidation — see "Verification" below).

---

## 0. Verification of code-facing facts (done for this consolidation)

All five drop-in filenames, their on-disk dimensions, frame sizes, and the enemy facing-swap were re-confirmed against the live source on 2026-06:

- `assets/background.png` = 1536x1024 (opaque)
- `assets/fauci-sheet-fixed.png` = 768x128, loaded with `frameWidth:128, frameHeight:128` -> 6 frames, right-facing
- `assets/fauci-sheet-fixed-left.png` = 768x128, same layout, left-facing
- `assets/enemy1.png` = 960x960, loaded with `frameWidth:240, frameHeight:240` -> 4x4 = 16 frames
- `assets/enemy1-left.png` = 960x960, same grid
- `src/entities/Enemy.js:2-4` confirms the **inverted** mapping: `ENEMY_TEXTURE_RIGHT = 'enemy-sprite-left'` (= `enemy1-left.png`) and `ENEMY_TEXTURE_LEFT = 'enemy-sprite'` (= `enemy1.png`).
- `src/scenes/GameScene.js:80-86` confirms preload keys/files.
- Many other PNGs exist in `assets/` (fauci1..6, enemy.png, teacher.png, *-new.png, enemies.png) but **none are referenced by code** and must be ignored.

These are ground truth and override any generic guidance below.

---

## 1. Recommended Stack (ordered)

1. **ComfyUI** (headless, API-driven on `127.0.0.1:8188`) — the generation backend. Node-graph maps 1:1 to JSON, fastest batch throughput, most VRAM-efficient, only-load-active-components. Run under systemd/tmux: `python main.py --dont-print-server`.
2. **SDXL 1.0 (fp16)** — primary final-render model. ~6-8GB VRAM, deepest stylization LoRA/ControlNet ecosystem, permissive CreativeML OpenRAIL++-M license. Use a Pony/Illustrious/NoobAI SDXL derivative as the workhorse base for its ControlNet/LoRA depth.
3. **ControlNet (OpenPose + scribble/lineart)** — deterministic pose per frame; the backbone of consistent walk/attack/hit/down cycles and left/right facings.
4. **IPAdapter (cubiq ComfyUI_IPAdapter_plus) + FaceID Plus** — training-free identity carry-over for early iteration.
5. **kohya_ss / sd-scripts** — train a per-character LoRA once the design is locked (the strongest consistency lever).
6. **FLUX.2 [klein] 4B (Apache 2.0)** OR an **SDXL Turbo/Lightning LoRA** — fast-draft iteration model.
7. **rembg** — background removal CLI (`isnet-anime` for stylized sprites, `birefnet-general`, `-a` for soft edges).
8. **waifu2x-ncnn-vulkan** (pixel/geometric) or **Real-ESRGAN anime models** (painted) — upscale.
9. **Pillow** — palette-quantize to a single master palette, NEAREST pixelation, `getbbox()` canvas normalization.
10. **PyTexturePacker** — pack to Phaser-compatible TexturePacker JSON-Hash atlas (`this.load.atlas`).

Optional / on-hand: **SD 3.5 Large** (free commercial under $1M revenue; better in-image text/composition), **Qwen-Image / Qwen-Image-Edit 2511** (Apache 2.0; best legible in-image text + surgical instruction edits). **Retro Diffusion** if you want true pixel-grid-native sprites (note: partly cloud/credit-based — see Risks).

---

## 2. Models (primary + fast)

**PRIMARY (final stylized 2D/game art): SDXL 1.0 fp16 + style LoRAs + ControlNet.**
- VRAM ~6-8GB on the 3090 — huge headroom for ControlNet stacks, multiple LoRAs, upscalers, or a second concurrent model.
- A 1024x1024, 25-30 step image renders in a few seconds. Turbo/Lightning LoRAs drop to 1-4 steps / sub-second.
- Best stylization ecosystem in 2026 because of community fine-tunes; weak native text (fine for art — add text in-engine, which this game already does).
- License: CreativeML OpenRAIL++-M — commercial use of generated images permitted.

**FAST ITERATION (drafts): FLUX.2 [klein] 4B (Apache 2.0, released Jan 2026).**
- ~13GB at full precision (no quant needed on a 3090), 4-step generation in ~1s-few seconds, commercially safe with no license fee.
- Alternative to stay in one ecosystem: SDXL + a Turbo/Lightning LoRA for sub-second drafts, then final-render on full SDXL.
- CAUTION on the FLUX family tiering: the larger FLUX.2 [klein] 9B and FLUX.2 [dev], and FLUX.1 [dev], are under the FLUX **Non-Commercial** License (commercial self-host ~$999/mo via BFL). For commercial game work use the **4B klein** or **FLUX.1 [schnell]** (Apache 2.0) specifically.

**On hand:** SD 3.5 Large (Stability Community License, free commercial <$1M revenue; ~18GB so effectively needs the 24GB card); Qwen-Image / Qwen-Image-Edit (Apache 2.0, ~20B so run quantized GGUF/fp8) for legible in-image text and surgical pose/equipment edits.

---

## 3. Sprite Workflow — making ONE animated character sheet

Worked example: the player sheet `fauci-sheet-fixed.png` (768x128, six 128x128 frames, right-facing; frames 0-2 walk with 0=idle, 3-5 attack).

1. **Lock the design.** Generate a clean single hero render of the lab-coat "science authority" caricature in a light/neutral palette (so runtime blue/red faction tints read cleanly). SDXL + a satirical/bold-outline cartoon style LoRA.
2. **Build a key-pose skeleton library.** Create OpenPose skeletons for the 6 needed poses: idle, walk-A, walk-B, plus 3 attack/punch-swing frames. Reuse these skeletons for every character.
3. **Establish identity.** For first passes use IPAdapter (overall look) + FaceID Plus (identity) from the hero render. Once the design is final, train a **character LoRA** in kohya_ss (10-30 captioned images — turnaround views + action poses; SDXL rank 32-64, LR ~1e-4, 1-3 hrs) for rock-solid consistency at scale.
4. **Generate each frame.** SDXL + character LoRA + OpenPose ControlNet. Apply ControlNet at **strength 0.4-0.65** and **only for the first ~20% of sampling steps** (100% drops quality and overrides style/identity). Hold seed + prompt fixed; vary only the pose skeleton. Use a very specific style prompt to stop drift.
   - Alternatively use img2img at denoise ~0.55 (range 0.3-0.75) off the base sprite to re-pose while preserving identity.
5. **Background removal.** `rembg p` with `isnet-anime` (`-a` for soft hair edges). Prompt for a flat green/magenta background up front to make cutouts near-perfect.
6. **Upscale.** waifu2x-ncnn-vulkan (`--scale 4 --noise-level 0`) for crisp/geometric, or Real-ESRGAN `RealESRGAN_x4plus_anime_6B` for painted.
7. **Normalize + style-lock.** Pillow: `getbbox()` -> crop -> paste onto a uniform 128x128 transparent canvas with **feet at the bottom edge, character horizontally centered** (origin is bottom-center 0.5,1). Then quantize to the shared master palette (`quantize(palette=pal_img, dither=NONE)`) so all sprites share one color set. Place meaningful art in the centered lower portion: ~56px-wide column starting 36px from left, bottom 96px of the 128px frame (top 32px headroom) to match the physics body `setSize(56,96)` offset (36,32).
8. **Left-facing sheet.** Horizontally flip the finished right-facing sheet to produce `fauci-sheet-fixed-left.png` (the engine selects sheets by movement direction; it does not flip in code, so a dedicated mirror file is required).
9. **In-betweens (if smoother cycles wanted).** Generate distinct KEY poses, then add a **single** intermediate frame with RIFE (Practical-RIFE / ComfyUI-Frame-Interpolation), re-quantize/snap to grid, hand-touch artifacts. Avoid AnimateDiff for hard pixel grids.
10. **Pack.** PyTexturePacker (MaxRects, trim, extrude=1, padding) — but for these FIXED single-row/grid layouts the game expects **plain spritesheet grids**, not a trimmed atlas (see Asset Plan note).

**Enemy sheet** follows the same flow but as a 4x4 / 240x240 grid: row0(0-3)walk, row1(4-7)attack, row2(8-11)hit, row3(12-15)down — and note the facing inversion in step 8.

---

## 4. Consistency Techniques — LoRA vs IPAdapter vs ControlNet

These solve **different** axes; the proven 2026 pattern combines them:

- **ControlNet (OpenPose / scribble)** = controls **pose/geometry**, NOT identity. Use it to make each animation frame and each facing deterministic and repeatable. Mirror the skeleton horizontally for left/right (or flip the finished near-symmetric sprite). Tuning: strength 0.4-0.65, run only the first ~20% of steps.
- **IPAdapter (+ FaceID Plus)** = **training-free identity/style** carry-over ("a 1-image LoRA"). Best for early iteration and one-off variants. Needs a clear reference (face >=512px, even lighting). If faces "burn," drop weight to ~0.7 and CFG to ~6.0.
- **Character LoRA (kohya_ss)** = **strongest, most durable** identity across frames/facings, but requires training (10-30 images, ~1-3 hrs). Graduate to this once the design is locked and you need consistency at scale.

**Recommendation:** ControlNet (pose) + IPAdapter (identity) during design exploration; ControlNet (pose) + trained character LoRA (identity) for production frame generation. Keep clothing/design simple and the style prompt aggressively specific to minimize drift.

Failure modes to watch: style drift across frames (fix: fixed seed + constrained prompt + LoRA), identity "burn" (fix: lower IPAdapter weight/CFG), pose bleeding over style (fix: shorter ControlNet step window), jitter in cycles (fix: uniform-canvas pivot normalization in step 7).

Honest assessment of automation level: turnarounds and full cycles are **NOT one-click** in 2026 — expect to over-generate 10-20 candidates per pose and hand-pick/clean the best. Sprite Sheet Diffusion (arXiv 2412.03685) is the closest research method to "one design + pose sequence -> consistent frames" but is experimental (results listed TBD), useful only for prototyping.

---

## 5. Automation — batch generation + post-process + packing

Single orchestration script (Python with subprocess, or a Makefile), one atlas/spritesheet per character:

1. **Generate (ComfyUI API).** Author the workflow in the GUI once, enable Dev Mode, "Save (API Format)". From Python: load the API-JSON template, patch prompt/seed/checkpoint/ControlNet nodes by numeric node ID, `POST /prompt`, watch `ws://127.0.0.1:8188/ws?clientId=...` for the terminal `executing` message (node==null), then fetch via `GET /history/{prompt_id}` -> `GET /view?filename=&subfolder=&type=`. Loop over the `character x action x frame` matrix with fixed seed + varied pose. Canonical refs: repo `script_examples/websockets_api_example.py`. Higher-level wrappers: ComfyScript, `comfyui-api-client` (PyPI), or ComfyUI-to-Python-Extension for a serverless `.py`.
2. **Cut out (rembg).** `rembg p frames_in/ frames_out/ -a` (or `-w` watch mode). `isnet-anime` for stylized characters.
3. **Upscale.** waifu2x-ncnn-vulkan (pixel) or `python inference_realesrgan.py -n RealESRGAN_x4plus_anime_6B -i in/ -o out/`. Both accept a folder = batchable. Can also fold into the ComfyUI graph as an upscale node.
4. **Palette/pixelate + normalize (Pillow).** downscale NEAREST -> `quantize(palette=master_palette, dither=NONE)` -> upscale NEAREST; `getbbox()` + paste onto fixed canvas for stable pivot. Install libimagequant for clean alpha quantization.
5. **Pack (PyTexturePacker).** `Packer.create(max_width=2048,...); p.pack('frames/','sheet%d')` -> TexturePacker JSON-Hash. Options: trim_mode, extrude (stop bleed), padding, reduce_border_artifacts.
   - **For this game specifically:** the code uses `load.spritesheet` with FIXED frame grids, not `load.atlas`. So either (a) produce a uniform grid PNG (no trimming, exact 128x128 / 240x240 cells) and skip the JSON, OR (b) refactor the code to `load.atlas`. The drop-in path is (a) — assemble frames into the exact grid with Pillow rather than a trimmed atlas.

Only stateful service is ComfyUI on :8188; stages 2-5 are pure CLI/Python. Check the workflow JSON, master palette PNG, packer config, and orchestration script into the repo so "regenerate all art" is one command (aligns with the project constitution's deterministic-build principle).

---

## 6. Asset Plan — concrete manifest tied to the actual game

Generate with these EXACT filenames into `/home/gpaasch/personal-webpage/games/sidewalks-of-rage/assets/`. Served path is `/sidewalks-of-rage/assets/<file>`. All sprite art on transparent alpha, feet at bottom edge, origin bottom-center, **light/neutral palette for clean runtime multiply-tint**.

| # | File | Size | Layout | Facing | Frames / anim ranges |
|---|------|------|--------|--------|----------------------|
| 1 | `background.png` | 1536x1024 | single static image, OPAQUE | n/a | Satirical city sidewalk. Walkable strip in **bottom ~13%** (player clamped y 0.87-0.97); skyline/storefronts up top. Stretched to viewport (depth -100). |
| 2 | `fauci-sheet-fixed.png` | 768x128 | 6x (128x128), single row | **RIGHT** | 0-2 walk (0=idle) @8fps loop; 3-5 attack @12fps once |
| 3 | `fauci-sheet-fixed-left.png` | 768x128 | 6x (128x128), single row | **LEFT** (mirror of #2) | same ranges |
| 4 | `enemy1.png` | 960x960 | 4x4 grid (240x240), row-major | **LEFT** (used as `ENEMY_TEXTURE_LEFT`) | row0 0-3 walk @8 loop; row1 4-7 attack @10 once; row2 8-11 hit @10 once; row3 12-15 down @8 once |
| 5 | `enemy1-left.png` | 960x960 | 4x4 grid (240x240) | **RIGHT** (used as `ENEMY_TEXTURE_RIGHT`; mirror of #4) | same ranges |

**Critical facing inversion (don't get this wrong):** for the enemy pair the naming is inverted relative to facing — `enemy1.png` is the LEFT texture and `enemy1-left.png` is the RIGHT texture (`Enemy.js:2-4`). Draw one sheet, mirror for the other, but assign per that mapping or enemies will moonwalk.

**Archetypes are TINT-ONLY (1 base enemy design serves all 5).** Do NOT make 5 enemy sheets. One generic light-gray "internet conspiracy crank / mob protester" base; the 5 archetypes differ only by `setTint` + floating label + per-archetype scale:
- Truther: tint null (raw art), scale 0.25
- Blogger: 0xaaddff light blue, scale 0.22
- Influencer: 0xffaacc pink, scale 0.28
- Podcaster: 0xffdd88 amber, scale 0.26
- Karen: 0xff8888 red, scale 0.23

**Player factions are ALSO tint-only on the same fauci sheet.** Fauci = 0x3b82f6 (blue), Rogan = 0xef4444 (red). One light/neutral lab-coat caricature serves both. Remote/multiplayer players reuse the same `fauci-right` texture + `fauci-*` anims.

Because all coloring variety is multiply-tint over pale pastels/faction colors, **the base art MUST be light-valued/grayish, not pre-saturated**, or tints read muddy. On-hit flash multiplies white (0xffffff) then restores.

**On-screen sizes are tiny:** player renders at scale 0.5 (~64px); enemies at 0.22-0.28 (~50-67px). Demand high-contrast silhouettes, bold outlines, minimal fine detail. Style = satirical Newgrounds/editorial-cartoon caricature, matching in-game copy ("Trust the science!", "WAKE UP SHEEPLE!", "BIRDS AREN'T REAL!").

**Out of current scope (would need code changes, flag before doing):** per-archetype distinct enemy art, true Rogan-specific player art, billboards/storefronts as image assets (currently drawn as Phaser rects/UI). Only `background.png` exists as scene art.

---

## 7. VRAM Notes (what fits in 24GB, quantization)

On the 3090 you generally do **NOT** quantize SDXL or FLUX.2 [klein] 4B — run full:
- **SDXL fp16:** ~6-8GB. Massive headroom for ControlNet + multiple LoRAs + upscalers, or a second model.
- **FLUX.2 [klein] 4B:** ~13GB at full precision. Fits comfortably.
- **FLUX.1 [dev]:** fp16/bf16 ~23.8GB (tight, fits), fp8 ~11.9GB, GGUF Q8 ~12GB (~99% identical to fp16), Q5 ~7.5GB, Q4 ~6GB. Run Q8/fp8 to keep room for LoRA/ControlNet. CFG ~3.0-3.8. (Non-commercial license — avoid for shipping.)
- **FLUX.1 [schnell]:** same VRAM class, 1-4 steps, CFG 1.0, Apache 2.0.
- **SD 3.5 Large (~8B):** ~18GB — effectively needs the 24GB card; little official quant path. SD 3.5 Medium (~2.5B) is far lighter.
- **Qwen-Image / Qwen-Image-Edit (~20B):** run quantized GGUF/fp8 on 24GB.

**Quantization guidance:** prefer GGUF **Q8** for near-lossless (~half VRAM); fp8 for slightly faster; Q5/Q4 only on smaller cards. With 64GB system RAM you have ample room for ComfyUI model offload/hot-swap between models.

**LoRA training fits easily:** SDXL LoRA ~12GB min (16GB comfortable); FLUX LoRA now runs in 16GB (down to 4-8GB) via kohya fused-backward-pass (sd-scripts v0.9.0, Jan 2025). 24GB is ample.

---

## 8. Risks

**Licensing**
- Safe-to-ship combo: SDXL (OpenRAIL++-M), FLUX.2 klein 4B / FLUX.1 schnell / Qwen-Image (Apache 2.0), SD 3.5 (Stability Community License, free <$1M revenue).
- **DANGER:** FLUX.1 [dev], FLUX.2 [dev], FLUX.2 [klein] 9B are NON-commercial — selling/shipping game assets requires BFL's ~$999/mo self-host license. Easy to use the wrong FLUX tier by accident.
- **Retro Diffusion** (best pixel-grid-native option incl. RD-Animation) is partly cloud/credit-based (hosted/Replicate/Aseprite) — verify cost/license before relying on it for a "fully local" pipeline. Open local alternative: Pixel Art Diffusion XL (Civitai).
- Cloud edit models (Nano Banana / Pro) give the best out-of-box serialized identity but break the strictly-local requirement — API dependency.

**Consistency failure modes**
- Turnarounds/cycles are not one-click; over-generate 10-20 and hand-pick (time cost, below).
- Style drift, identity burn, pose-over-style bleed, cycle jitter — mitigations in Section 4.
- Sprite Sheet Diffusion is experimental (results TBD); validate before depending on it.
- Tint assumption: if base art isn't light/neutral, the multiply-tints render muddy — re-render rather than fight in code.

**Time cost**
- LoRA training 1-3 hrs/character. Per-character frame set: generation is fast but curation/hand-cleanup of 10-20 candidates per pose dominates wall-clock. Expect meaningful manual finishing per sheet — the pipeline automates generation+post+packing, not art direction/QC.

**Web-access caveat to re-verify**
- The **asset-manifest angle had no web access**; it was sourced from direct code inspection and re-verified for this consolidation (Section 0), so it is reliable. The model/tooling angles had web access; VRAM figures and release dates (esp. FLUX.2 klein Jan 2026, sd-scripts v0.9.0) are worth a quick re-check against the linked sources before purchase/commit decisions.

---

## Sources

Models / VRAM:
- https://localaimaster.com/blog/best-local-image-models-compared
- https://willitrunai.com/blog/flux-vs-sdxl-vs-sd35-comparison
- https://magai.co/stable-diffusion-xl-1-0/
- https://venturebeat.com/technology/black-forest-labs-launches-open-source-flux-2-klein-to-generate-ai-images-in
- https://github.com/black-forest-labs/flux2
- https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/blob/main/LICENSE.md
- https://bfl.ai/licensing
- https://insiderllm.com/guides/flux-locally-complete-guide/
- https://localaimaster.com/blog/flux-vram-requirements-by-gpu
- https://www.glukhov.org/post/2025/11/quantized-flux-1-dev-with-gguf/
- https://apatero.com/blog/flux-gguf-quantization-8gb-vram-guide-2026
- https://stability.ai/news/introducing-stable-diffusion-3-5
- https://stability.ai/license
- https://huggingface.co/stabilityai/stable-diffusion-3.5-large
- https://github.com/QwenLM/Qwen-Image
- https://huggingface.co/prithivMLmods/Qwen-Image-2512-Pixel-Art-LoRA

Sprite consistency / training / conditioning:
- https://www.apatero.com/blog/comfyui-controlnet-pose-guide-2026
- https://apatero.com/blog/ai-character-turnaround-sheet-generation-guide-2026
- https://tgecrypto365.medium.com/how-to-create-consistent-characters-comfyui-the-2025-step-by-step-workflow-ipadapter-76edbfca0baf
- https://localaimaster.com/blog/image-lora-training-local-guide
- https://sanj.dev/post/lora-training-2025-ultimate-guide/
- https://www.apatero.com/blog/kohya-ss-lora-training-complete-guide-2025
- https://github.com/cubiq/ComfyUI_IPAdapter_plus
- https://www.runcomfy.com/comfyui-workflows/create-consistent-characters-in-comfyui-with-ipadapter-faceid-plus
- https://retrodiffusion.ai/
- https://civitai.com/models/277680/pixel-art-diffusion-xl
- https://arxiv.org/abs/2412.03685
- https://github.com/chenganhsieh/Sprite-Sheet-Diffusion
- https://github.com/hzwer/Practical-RIFE
- https://www.runcomfy.com/comfyui-nodes/ComfyUI-Frame-Interpolation/RIFE-VFI
- https://medium.com/diffusion-doodles/qwen-image-edit-vs-flux-1-kontext-vs-nano-banana-93fba1348a77

Automation / Phaser packing:
- https://gigagpu.com/comfyui-vs-forge-vs-a1111-production/
- https://apatero.com/blog/comfyui-batch-processing-workflow-automation-2026
- https://docs.comfy.org/development/comfyui-server/api-examples
- https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py
- https://github.com/Chaoses-Ib/ComfyScript
- https://pypi.org/project/comfyui-api-client/
- https://github.com/danielgatis/rembg
- https://github.com/xinntao/Real-ESRGAN
- https://www.alibaba.com/product-insights/ai-anime-upscaling-for-retro-games-waifu2x-ncnn-vulkan-vs-real-esrgan-for-preserving-pixel-art-integrity.html
- https://www.bomberbot.com/python/unlocking-the-power-of-python-pils-image-quantize-method/
- https://github.com/wo1fsea/PyTexturePacker
- https://pypi.org/project/PyTexturePacker/
- https://github.com/secnot/rectpack
- https://phaser.io/news/2020/02/free-texture-packer
- https://airum82.medium.com/working-with-texture-atlases-in-phaser-3-25c4df9a747a
- https://docs.phaser.io/phaser/concepts/textures

Asset manifest (code inspection, re-verified 2026-06):
- /home/gpaasch/personal-webpage/games/sidewalks-of-rage/src/scenes/GameScene.js (preload 80-87; player anims 131-182; faction tints 1199-1229; remote players 1321-1324; bg 125-129; clamps 464-466, 569-570; messages 19-69)
- /home/gpaasch/personal-webpage/games/sidewalks-of-rage/src/entities/Enemy.js (texture swap 2-4; constants 5-6; grid comment 8-12; archetypes 14-20; speech 22-48; body/origin 88-95; anims 128-184; hit flash 274-283)
- /home/gpaasch/personal-webpage/games/sidewalks-of-rage/vite.config.js (BASE_URL)
