# STYLE.md — Pixel Opera art, round 2 (spec 40, BRIEF-art2.md)

A concrete style guide for original 16-bit, SNES-era cutscene pixel art, written before drawing and used as the
scoring checklist in every critique round (art2/round-N/). Sources are real craft tutorials, cited inline; where a
rule is our own decision it says so. Nothing here copies a game's assets or a specific character's look.

## 1. Format (hardware-true numbers)

- Screen 256x224, scaled 4x nearest-neighbour; the text box takes y >= 165, so the playable picture is 256x165 and the
  floor must still run under the box. (SNES display modes: 256x224 — https://en.wikipedia.org/wiki/Super_Nintendo_Entertainment_System)
- Background tiles 16x16 (the SNES BGMODE tile option; "Anything over 32x32px seems like overkill for pixel art" —
  Schlitter, Pixelblog 20, https://www.slynyrd.com/blog/2019/8/27/pixelblog-20-top-down-tiles; hardware:
  https://snes.nesdev.org/wiki/Backgrounds). Walls, dado and floor are built from our own 16x16 tiles; furniture is
  drawn as larger objects placed on the tile grid.
- Characters: one fixed frame size, 32x48, feet on the bottom row (hardware sprite sizes 16x32 / 32x32 / 32x64 —
  https://snes.nesdev.org/wiki/Sprites). An SNES sprite palette is 15 colours + transparent
  (https://snes.nesdev.org/wiki/Palettes): each character uses <= 15 colours of the shared 32.
- Proportions: 2.5 heads. Head (hair to chin) 16 px, body 32 px (feet included), total ~46-48 px; shoulders 12-14 px
  wide for an adult, 10 for a youth. "Big-headed, or doll-like features tend to read well" at sprite size
  (Schlitter, Pixelblog 17, https://www.slynyrd.com/blog/2019/5/21/pixelblog-17-human-anatomy). Face layout at 16 px:
  eyes at the head's vertical middle, 2 px tall, with 2 px between them; mouth 1 px below the nose line (Schlitter's
  "eyes halfway between the top of the head and the chin", stylised).
- Everything on the 1x pixel grid: no mixed resolutions, no sub-pixel scaling, nearest-neighbour only.

## 2. Palette: 32 colours in hue-shifted ramps (art2_palette.py, art2/palette.png)

Model: Lospec-style limited palettes such as Endesga 32 (https://lospec.com/palette-list/endesga-32) and Vinik24's
"connected ramps of four shades, all sharing the same shadow" (https://lospec.com/palette-list/vinik24). Ours is
built the Slynyrd way — HSB, hue stepped ~10-20° per swatch, brightness rising, saturation peaking in the middle
("20 is about as high as I go"; "warming as they become brighter" — Pixelblog 1,
https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes) — and the Saint11 way: shadows shift cooler and
less saturated, lights warmer and more saturated; "large low saturation areas with small high saturation details";
avoid "mixing too many different hues in a single image" (Medeiros, article 6,
https://saint11.art/pixel_art_articles/article6).

| ramp | keys (dark → light) | use |
|---|---|---|
| ink | K | the ONE outline / deepest dark everywhere (purple-black, not pure black) |
| skin | 1 2 3 | shadow / mid / light |
| hair | 4 5 | black curls; also black shoes, ceiling strip |
| red | 6 7 8 | Figaro's jacket (shadow is plum-red, light is orange-red) |
| gold | 9 a | braid, brass, candle flame |
| white | b c d | linen, hose, plaster highlight; shadow is blue-grey |
| blue | e f g | Cherubino's coat (navy → sky) |
| wall | h i j | sage plaster (shadow green-blue, light yellow-green) |
| wood | k l m n | furniture, dado, door (red-brown) |
| floor | o p q r | oak boards (ochre); r only inside the window's light |
| glass | s t | window sky, glare |
| plum | u | curtain, upholstery, lips |
| cream | v | paper, candle wax, cornice |

Rules: every ramp has one hue direction (warmer up); no two ramps share a swatch except through K; the floor and
furniture ramps differ in hue (ochre vs red-brown) so furniture separates from the floor without outlines; the wall
is the complement of the red jacket and a different hue from the blue coat so both characters pop against it.

## 3. Light

- One light: top-left, slightly in front (Derek Yu: "a single light source above ... and slightly in front of it, so
  everything on top and/or in front is bright" — https://www.derekyu.com/makegames/pixelart.html; Schlitter: "most
  natural to come from one of the top corners", Pixelblog 3,
  https://www.slynyrd.com/blog/2018/3/14/pixelblog-3-graphical-projections-1; "primary light from the top right or
  left hand side", Pixelblog 6, https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow).
- So: top faces and left faces take the light step; right faces and undersides the shadow step; the mid tone is the
  big flat area. The window sits on the left of the back wall so its floor patch agrees with the light.
- Terminators are sharp, not dithered ("pixel art we favor sharp transitions" — Medeiros, article 4,
  https://saint11.art/pixel_art_articles/article4). Dither only to break a large flat wall, never on sprites.
- Contact shadow under every character and every piece of furniture: a 1-2 px band of the floor's dark step (o)
  directly under the feet / legs, offset to the right; the renderer's ellipse is replaced by this (see §7).

## 4. Shading discipline (cluster rules)

- No pillow shading: never a dark rim all the way round; "shading an object with no clear light source and making a
  generic shadow around the outlines" is the named mistake (Medeiros, article 4). Flat faces stay one colour;
  ramps only across curved surfaces and only in the ramp's direction.
- Clusters: "as few clusters as I can and to avoid one-pixel clusters by all means" (Medeiros, article 2,
  https://saint11.art/pixel_art_articles/article2). No orphan pixels except deliberate texture (an eye glint, a
  button). Diagonal-only contact is a weak connection; avoid it.
- No banding: never three parallel bands following an outline; compress bands into smaller areas (article 5,
  https://saint11.art/pixel_art_articles/article5).
- No jaggies: on a curve the step lengths change monotonically (1,1,2,3,5... toward horizontal) — "the number of
  pixels in each step" grows as the curve approaches horizontal (article 2); never 1-2-1-2.
- Anti-aliasing: only inside a sprite (never on its outer edge, because the background varies — Derek Yu), and only
  where a step is longer than 1x1; "an horizontal slope should have an horizontal anti-alias" (article 5).
- Textures (Pixelblog 2, https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture): "A good texture may only need
  a few simple clusters"; leave "empty areas where the texture is implied"; "Avoid emphasizing the outlines of the
  bricks"; tile clusters should "overlap the edges and loop around the tile to help hide the seams" (Pixelblog 20).

## 5. Outlines: selective (sel-out)

- Base: a 1 px K outline on the outside of every sprite, so it reads against any floor or wall. Then sel-out: replace
  K with the surface's dark step where the outline faces the light (top and left), keep K where it faces away and
  where the figure meets the ground; use the shadow step, not K, to separate parts inside the figure (Derek Yu:
  "Selout means replacing a lot of the black outline with lighter colors ... Lighter colours go toward the light";
  darker shades "for segmentation"). Keep K where the figure meets the ground.
- Furniture against the wall: the same, but the top edge may lose its outline entirely where it is lit.
- Inside a sprite, parts of the same colour (e.g. a white sleeve over a white shirt) are separated by the ramp's
  shadow step, never by a second black line (no "double" lines).
- Line craft (Sam Keddy, "Pixel Art Outlines", https://lospec.com/articles/pixel-art-outlines/): one-pixel lines
  whose segments "only connect diagonally"; a diagonal is "made up of identical line segments"; on a circle the
  longest segments sit at top, bottom, left and right and shrink toward the 45° points (5,2,2,1,1 — never 5,2,1,2,1);
  no outline "where an object touches another", e.g. feet on the ground, a hand on a held thing; add an internal
  line only where contrast is too low, "such as between the head and neck".
- Sprite size convention: a top-down character is 1 tile wide by 2 tall and "the head usually takes up a third to
  half of the total sprite"; walk cycle 4 frames, side view "reflected for right and left" (Schlitter, Pixelblog 22,
  https://www.slynyrd.com/blog/2019/10/21/pixelblog-22-top-down-character-sprites). Ours is 2 tiles wide by 3 tall
  because these are cutscene actors, not map walkers.

## 6. Readability at 1x

- Silhouette test: filled black, each character must be recognisable and distinguishable from the other
  (posture, head shape, width). "good pixel art eliminates all unnecessary detail" (article 4); draw key features
  bigger than life (eyes, mouth, hat).
- Figaro: stocky; wide stance, chin up, hand on hip; round white hair-net over black curls; short red jacket with
  gold braid; cream breeches, white hose, buckled shoes. 15 colours.
- Cherubino: slight, 2 px shorter (44 px); shoulders in, feet together; chestnut hair in a long bob with a ribbon;
  navy page's coat with gold buttons, white cravat and cuffs; white hose; same shoes. 15 colours.
- Faces: 2 px eyes with a 1 px K pupil and a 1 px white, mouth 2 px wide; expression lives in eyebrows and mouth.
- Check by desaturating and by flipping (Derek Yu's final check).

## 7. Room: 3/4 top-down ("RPG") projection

- Back wall drawn frontal; floor seen from ~45° above so each object shows a front face and a foreshortened top
  face; "uniformity takes priority over realism", "don't mix viewpoints" (Pixelblog 3). Side walls are not shown.
- Planes (y in the 224 frame): ceiling shadow strip 0-7; cornice 8-15; wall 16-111 (6 tiles); dado/skirting
  104-119; floor 120-223 (feet range 136-160 above the text box). Wall height ≈ 2 character heights: a tall room.
- Everything stands on the floor plane: furniture against the wall has its feet at or below y 120, its front face
  vertical, its top face ≤ 1/3 of its height. Characters' feet are on the floor (y ≥ 128), never on the wall.
- Door on the right of the back wall (Cherubino is marched out to the right); window on the left; between them the
  furniture of Act I (the big armchair, a chest, a small table, a mirror / portrait, the measuring rod, a guitar).
- Textures without noise: floorboards = 16 px wide boards, a 1 px dark seam, 2-3 grain clusters per board in the
  shade step, boards offset by half a tile per row; wall = flat mid plaster with a sparse damask motif in the light
  step every 32 px; dado = flat panels with light top/left and dark bottom/right edges (chamfer), no gradient.
- Window light: a parallelogram on the floor from the window's foot, going down-right, in r over q; a 1 px q edge.
- Grounding: a 1 px band of o (floor dark) under every object and character; characters also get a 2 px K line at
  the heel, so they sit *in* the floor rather than on it.

## 8. Animation (cutscene staging, not combat)

- Walk: 4 frames per direction (contact, pass, contact, pass) with a 1 px bob on the pass frames and the arms
  swinging opposite to the legs; 10 fps. Idle: the base frame plus a 2-frame breath (shoulders down 1 px) at ~1 Hz.
- Gestures (Figaro): point (arm out, finger), sweep (arm across, palm open), present (both arms open), bow (two
  steps: half, full). Cherubino: flinch (shoulders up, arms in, head back), shy (head down). Each 2-3 frames, 7 fps.
- Right = mirrored left; costumes are kept symmetric so the mirror lies only about the hairnet knot.

## 9. The checklist used each round (score 0-2 each; target 2 on all)

1. Palette: only the 32 colours, ramps hue-shifted, ≤15 per character.
2. Light: top-left on every object and sprite; no object lit from the right.
3. Clusters: no orphan pixels, no 1-2-1-2 jaggies, no banding, no pillow shading.
4. Sel-out applied; outlines K only on the dark side and against the ground.
5. Silhouettes: the two characters distinguishable as black shapes at 1x.
6. Proportions: 2.5 heads, 32x48 frame, feet on the bottom row, head 16 px.
7. Perspective: wall frontal, floor plane, front+top faces on furniture, nothing floating.
8. Grounding: contact shadow under every character and object; window light on the floor.
9. Texture: boards and wall read as material at 1x without noise.
10. Scale: a door ≈ 1.5 characters tall, a chair seat at knee height, a table at hip height.
