# Contract: Drop-in Asset Manifest

The single source of truth for what the pipeline must produce. Values verified against the live
source (`src/scenes/GameScene.js` preload ~80-87; `src/entities/Enemy.js:2-12`). Generated files
go in `games/sidewalks-of-rage/assets/`; served at `/sidewalks-of-rage/assets/<file>`.

## Files (exact, drop-in — no code change)

| # | File | Size (px) | Layout | Facing | Animations (frame ranges) |
|---|------|-----------|--------|--------|---------------------------|
| 1 | `background.png` | 1536×1024 | single image, **opaque** | n/a | Static satirical city sidewalk. Walkable strip in bottom ~13% (player clamped y 0.87–0.97); skyline/storefronts above. Stretched to viewport (depth -100). |
| 2 | `fauci-sheet-fixed.png` | 768×128 | 6×1 grid, 128×128 cells | **RIGHT** | 0–2 walk (0 = idle) @8fps loop; 3–5 attack @12fps once |
| 3 | `fauci-sheet-fixed-left.png` | 768×128 | 6×1 grid, 128×128 cells | **LEFT** (mirror of #2) | same ranges |
| 4 | `enemy1.png` | 960×960 | 4×4 grid, 240×240 cells, row-major | **LEFT** (used as `ENEMY_TEXTURE_LEFT`) | row0 0–3 walk @8 loop; row1 4–7 attack @10 once; row2 8–11 hit @10 once; row3 12–15 down @8 once |
| 5 | `enemy1-left.png` | 960×960 | 4×4 grid, 240×240 cells | **RIGHT** (used as `ENEMY_TEXTURE_RIGHT`; mirror of #4) | same ranges |

## CRITICAL invariants

- **Inverted enemy facing**: `enemy1.png` is the **LEFT** texture; `enemy1-left.png` is the
  **RIGHT** texture (`Enemy.js:2-4`). Draw one, mirror for the other, assign per this mapping or
  enemies moonwalk.
- **Fixed grids, not atlas**: the code uses `load.spritesheet` with these exact cell sizes — emit
  uniform grids, never a trimmed/packed atlas.
- **Origin bottom-center**: sprites centered horizontally, feet on the bottom cell edge.
- **Light/neutral base values**: all coloring variety is runtime multiply-tint; pre-saturated
  art renders muddy.
- **Player physics fit**: meaningful art in the centered lower portion of each 128px cell —
  ~56px-wide column starting ~36px from left, bottom 96px (top ~32px headroom) to match the body
  `setSize(56,96)` / offset (36,32).

## Runtime tints (NOT separate art — one base each)

**Enemy archetypes** (one generic enemy base, tint + scale only):
| Archetype | Tint | Scale |
|-----------|------|-------|
| Truther | none (raw) | 0.25 |
| Blogger | 0xaaddff | 0.22 |
| Influencer | 0xffaacc | 0.28 |
| Podcaster | 0xffdd88 | 0.26 |
| Karen | 0xff8888 | 0.23 |

**Player factions** (one neutral lab-coat caricature, tint only): Fauci 0x3b82f6 (blue),
Rogan 0xef4444 (red). Remote players reuse the same `fauci-right` texture + `fauci-*` anims.
On-hit flash multiplies white (0xffffff) then restores.

## Style

Satirical Newgrounds/editorial-cartoon caricature matching in-game copy ("Trust the science!",
"WAKE UP SHEEPLE!"). On-screen sizes are tiny (player ~64px, enemies ~50–67px) → bold
silhouettes, heavy outlines, minimal fine detail.

## Out of scope (would require code changes — flag before doing)

Per-archetype distinct enemy art; true Rogan-specific player art; billboards/storefronts as
image assets (currently drawn as Phaser rectangles). Only `background.png` exists as scene art.
