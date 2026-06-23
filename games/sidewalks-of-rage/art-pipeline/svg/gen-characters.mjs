#!/usr/bin/env node
// Vector/procedural CHARACTER generator (prototype). Draws a posed caricature per frame as
// SVG (light fills + bold dark outlines so the runtime faction/archetype MULTIPLY tint reads
// cleanly) and rasterizes drop-in sprite sheets via sharp. Also emits a tinted contact-sheet
// preview so the look can be judged in-context.
//
//   node art-pipeline/svg/gen-characters.mjs
//
// Outputs (preview only; does not overwrite the real sheets unless --replace):
//   assets/fauci-sheet-ai-preview.png        (768x128, 6 frames, RIGHT)
//   assets/_preview-player.png               (contact sheet: raw + blue + red tint)

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../../assets');
const replace = process.argv.includes('--replace');

const C = {
  outline: '#20242e',
  coat: '#eef0f4', coatShade: '#d7dae2',
  skin: '#f1d3b8',
  hair: '#cfd3da',
  glass: '#e7eef3', plunger: '#c9d2da', needle: '#aab2bb',
  shoe: '#c2c7d0',
};

// thick cartoon limb = dark outline stroke under a lighter fill stroke (round caps)
const limb = (x1, y1, x2, y2, w, fill) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.outline}" stroke-width="${w + 4}" stroke-linecap="round"/>` +
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round"/>`;

// giant syringe pointing right, hand at (hx,hy), tipX = needle tip x (reach)
function syringe(hx, hy, tipX) {
  const barrelLen = Math.max(18, tipX - hx - 18);
  const bx = hx - 6, by = hy - 7, bh = 14;
  return `
    <rect x="${bx - 8}" y="${by + 3}" width="9" height="8" fill="${C.plunger}" stroke="${C.outline}" stroke-width="2"/>
    <rect x="${bx}" y="${by}" width="${barrelLen}" height="${bh}" rx="2" fill="${C.glass}" stroke="${C.outline}" stroke-width="2.5"/>
    <rect x="${bx + barrelLen}" y="${by + 3}" width="6" height="8" fill="${C.plunger}" stroke="${C.outline}" stroke-width="2"/>
    <line x1="${bx + barrelLen + 6}" y1="${hy}" x2="${tipX}" y2="${hy}" stroke="${C.outline}" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="${bx + barrelLen + 6}" y1="${hy}" x2="${tipX}" y2="${hy}" stroke="${C.needle}" stroke-width="1.6" stroke-linecap="round"/>`;
}

// one 128x128 player cell. cfg: { feetL,feetR:[x,y], hand:[x,y], tip, lean }
function playerCell(cfg) {
  const cx = 64;
  const hipY = 86, shoulderY = 52, headCY = 38, headR = 15;
  const lean = cfg.lean || 0; // degrees, pivot at hip
  const [flx, fly] = cfg.feetL, [frx, fry] = cfg.feetR;
  const [hx, hy] = cfg.hand;
  const body = `
    <g transform="rotate(${lean} ${cx} ${hipY})">
      <!-- coat (flared trapezoid) -->
      <path d="M ${cx - 13} ${shoulderY} L ${cx + 13} ${shoulderY} L ${cx + 20} 100 L ${cx - 20} 100 Z"
        fill="${C.coat}" stroke="${C.outline}" stroke-width="3" stroke-linejoin="round"/>
      <line x1="${cx}" y1="${shoulderY + 2}" x2="${cx}" y2="98" stroke="${C.coatShade}" stroke-width="2"/>
      <!-- neck + head -->
      <rect x="${cx - 5}" y="${shoulderY - 8}" width="10" height="10" fill="${C.skin}" stroke="${C.outline}" stroke-width="2"/>
      <circle cx="${cx}" cy="${headCY}" r="${headR}" fill="${C.skin}" stroke="${C.outline}" stroke-width="3"/>
      <path d="M ${cx - headR} ${headCY - 2} A ${headR} ${headR} 0 0 1 ${cx + headR} ${headCY - 2} L ${cx + headR} ${headCY - 6} Q ${cx} ${headCY - 20} ${cx - headR} ${headCY - 6} Z" fill="${C.hair}" stroke="${C.outline}" stroke-width="2"/>
      <!-- glasses (facing right) -->
      <circle cx="${cx + 2}" cy="${headCY + 1}" r="4.5" fill="#fff" stroke="${C.outline}" stroke-width="2"/>
      <circle cx="${cx + 12}" cy="${headCY + 1}" r="4.5" fill="#fff" stroke="${C.outline}" stroke-width="2"/>
      <line x1="${cx + 6.5}" y1="${headCY + 1}" x2="${cx + 7.5}" y2="${headCY + 1}" stroke="${C.outline}" stroke-width="2"/>
      <!-- back arm -->
      ${limb(cx - 8, shoulderY + 2, cx - 16, 80, 7, C.coat)}
    </g>`;
  // legs (not leaned, so feet stay planted)
  const legs =
    limb(cx - 6, hipY, flx, fly, 8, C.coatShade) +
    limb(cx + 6, hipY, frx, fry, 8, C.coatShade) +
    `<ellipse cx="${flx}" cy="${fly + 2}" rx="9" ry="4.5" fill="${C.shoe}" stroke="${C.outline}" stroke-width="2"/>` +
    `<ellipse cx="${frx}" cy="${fry + 2}" rx="9" ry="4.5" fill="${C.shoe}" stroke="${C.outline}" stroke-width="2"/>`;
  // front arm reaches toward the hand position, then syringe
  const frontArm = limb(cx + 8, shoulderY + 4, hx, hy, 7, C.coat);
  return `${legs}${body}${frontArm}${syringe(hx, hy, cfg.tip)}`;
}

// 6 frames: 0 idle, 1-2 walk, 3-5 attack (windup, thrust, recover)
const FRAMES = [
  { feetL: [55, 123], feetR: [73, 123], hand: [84, 64], tip: 104, lean: 0 },   // idle
  { feetL: [48, 120], feetR: [80, 124], hand: [82, 66], tip: 100, lean: 0 },   // walk A
  { feetL: [78, 124], feetR: [52, 119], hand: [86, 62], tip: 106, lean: 0 },   // walk B
  { feetL: [50, 123], feetR: [74, 123], hand: [70, 50], tip: 78, lean: -8 },   // windup (drawn back)
  { feetL: [44, 124], feetR: [86, 124], hand: [104, 60], tip: 126, lean: 8 },  // thrust (full reach)
  { feetL: [52, 123], feetR: [78, 123], hand: [92, 60], tip: 112, lean: 3 },   // recover
];

const cells = FRAMES.map((cfg, i) => `<g transform="translate(${i * 128} 0)">${playerCell(cfg)}</g>`).join('');
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="128" viewBox="0 0 768 128">${cells}</svg>`;

const sheetPng = await sharp(Buffer.from(sheetSvg)).png().toBuffer();
const meta = await sharp(sheetPng).metadata();
writeFileSync(resolve(assets, replace ? 'fauci-sheet-fixed.png' : 'fauci-sheet-ai-preview.png'), sheetPng);
console.log(`✓ player sheet ${meta.width}x${meta.height} (${(sheetPng.length / 1024).toFixed(0)} kB)`);

// ── contact sheet: raw + blue-tint + red-tint over a mid-gray backdrop (2x scale) ──
const scale = 2;
const strip = async (tint) => {
  let img = sharp(sheetPng);
  if (tint) img = img.tint(tint);
  return img.resize(768 * scale, 128 * scale, { kernel: 'nearest' }).png().toBuffer();
};
const raw = await strip(null);
const blue = await strip({ r: 59, g: 130, b: 246 });
const red = await strip({ r: 239, g: 68, b: 68 });
const labelSvg = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${768 * scale}" height="28"><rect width="100%" height="100%" fill="#1b1f29"/><text x="10" y="19" font-family="DejaVu Sans, Arial" font-size="15" fill="#cfd6e2">${t}</text></svg>`);
const lblH = 28, stripH = 128 * scale, w = 768 * scale;
const preview = await sharp({ create: { width: w, height: (stripH + lblH) * 3, channels: 4, background: '#3a3f4b' } })
  .composite([
    { input: labelSvg('RAW (light base — tints in-game)'), top: 0, left: 0 },
    { input: raw, top: lblH, left: 0 },
    { input: labelSvg('FAUCI tint (blue)'), top: stripH + lblH, left: 0 },
    { input: blue, top: stripH + lblH * 2, left: 0 },
    { input: labelSvg('ROGAN tint (red)'), top: (stripH + lblH) * 2, left: 0 },
    { input: red, top: (stripH + lblH) * 2 + lblH, left: 0 },
  ])
  .png().toBuffer();
writeFileSync(resolve(assets, '_preview-player.png'), preview);
console.log(`✓ contact sheet assets/_preview-player.png`);
if (meta.width !== 768 || meta.height !== 128) { console.error('✗ sheet dim mismatch'); process.exit(1); }
