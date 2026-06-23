#!/usr/bin/env node
// Vector/procedural ENEMY generator (prototype). One generic "conspiracy crank" caricature
// (tinfoil hat, shouting, shaking fist) posed across the 4x4 / 240px grid the game expects:
//   row0 walk(0-3), row1 attack(4-7), row2 hit(8-11), row3 down(12-15).
// Light base + dark outline so the 5 archetype MULTIPLY tints read. Rasterized via sharp.
//
//   node art-pipeline/svg/gen-enemy.mjs   ->  assets/enemy1-ai-preview.png + assets/_preview-enemy.png

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../../assets');
const replace = process.argv.includes('--replace');

const C = {
  outline: '#20242e', shirt: '#e2e4e8', shirtShade: '#cdd0d6',
  skin: '#ecd2bc', foil: '#dfe2e7', foilHi: '#f4f6f9', mouth: '#3a1f16', shoe: '#c6cad1',
};
const limb = (x1, y1, x2, y2, w, fill) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.outline}" stroke-width="${w + 5}" stroke-linecap="round"/>` +
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round"/>`;
const fist = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="${C.skin}" stroke="${C.outline}" stroke-width="3"/>`;

// standing crank rig. cfg: feetL,feetR,handL,handR:[x,y]; lean; bob
function crank(cfg) {
  const cx = 120;
  const shoulderY = 110 + (cfg.bob || 0), hipY = 152 + (cfg.bob || 0), headCY = 74 + (cfg.bob || 0), headR = 26;
  const [flx, fly] = cfg.feetL, [frx, fry] = cfg.feetR, [hlx, hly] = cfg.handL, [hrx, hry] = cfg.handR;
  const lean = cfg.lean || 0;
  return `
    ${limb(cx - 9, hipY, flx, fly, 11, C.shirtShade)}
    ${limb(cx + 9, hipY, frx, fry, 11, C.shirtShade)}
    <ellipse cx="${flx}" cy="${fly + 3}" rx="14" ry="6" fill="${C.shoe}" stroke="${C.outline}" stroke-width="3"/>
    <ellipse cx="${frx}" cy="${fry + 3}" rx="14" ry="6" fill="${C.shoe}" stroke="${C.outline}" stroke-width="3"/>
    <g transform="rotate(${lean} ${cx} ${hipY})">
      <path d="M ${cx - 20} ${shoulderY} Q ${cx} ${shoulderY - 8} ${cx + 20} ${shoulderY} L ${cx + 16} ${hipY + 6} L ${cx - 16} ${hipY + 6} Z"
        fill="${C.shirt}" stroke="${C.outline}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- head -->
      <circle cx="${cx}" cy="${headCY}" r="${headR}" fill="${C.skin}" stroke="${C.outline}" stroke-width="3.5"/>
      <!-- angry brows + eyes (facing right) -->
      <line x1="${cx + 2}" y1="${headCY - 8}" x2="${cx + 14}" y2="${headCY - 4}" stroke="${C.outline}" stroke-width="3"/>
      <circle cx="${cx + 9}" cy="${headCY - 1}" r="3" fill="${C.outline}"/>
      <!-- shouting mouth -->
      <ellipse cx="${cx + 8}" cy="${headCY + 11}" rx="7" ry="6" fill="${C.mouth}"/>
      <!-- tinfoil hat -->
      <path d="M ${cx - 24} ${headCY - 18} Q ${cx} ${headCY - 52} ${cx + 24} ${headCY - 18} Q ${cx} ${headCY - 30} ${cx - 24} ${headCY - 18} Z"
        fill="${C.foil}" stroke="${C.outline}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M ${cx + 2} ${headCY - 40} L ${cx + 8} ${headCY - 30} L ${cx - 2} ${headCY - 28} Z" fill="${C.foilHi}" stroke="${C.outline}" stroke-width="1.5"/>
      <line x1="${cx}" y1="${headCY - 50}" x2="${cx + 6}" y2="${headCY - 60}" stroke="${C.outline}" stroke-width="2.5"/>
      <circle cx="${cx + 6}" cy="${headCY - 61}" r="3" fill="${C.foilHi}" stroke="${C.outline}" stroke-width="1.5"/>
      <!-- arms -->
      ${limb(cx - 16, shoulderY + 4, hlx, hly, 9, C.shirt)}${fist(hlx, hly)}
      ${limb(cx + 16, shoulderY + 4, hrx, hry, 9, C.shirt)}${fist(hrx, hry)}
    </g>`;
}

const G = 240, cx = 120;
// 16 poses. down(12-15) reuse the rig under a knockdown rotation+drop.
const STAND = [
  // walk 0-3
  { feetL: [98, 226], feetR: [142, 226], handL: [96, 150], handR: [150, 96], lean: 2 },
  { feetL: [112, 222], feetR: [128, 224], handL: [100, 140], handR: [156, 104], lean: 0, bob: -3 },
  { feetL: [142, 226], feetR: [98, 226], handL: [104, 150], handR: [150, 92], lean: 2 },
  { feetL: [128, 224], feetR: [112, 222], handL: [98, 142], handR: [158, 100], lean: 0, bob: -3 },
  // attack 4-7 (fist thrust right)
  { feetL: [96, 226], feetR: [150, 226], handL: [104, 152], handR: [168, 120], lean: 6 },
  { feetL: [92, 226], feetR: [160, 226], handL: [108, 150], handR: [196, 112], lean: 10 },
  { feetL: [96, 226], feetR: [150, 226], handL: [104, 152], handR: [180, 118], lean: 7 },
  { feetL: [100, 226], feetR: [142, 226], handL: [100, 150], handR: [150, 100], lean: 3 },
  // hit 8-11 (recoil back / left)
  { feetL: [104, 226], feetR: [140, 224], handL: [80, 110], handR: [150, 86], lean: -10 },
  { feetL: [108, 224], feetR: [146, 222], handL: [74, 100], handR: [144, 80], lean: -16 },
  { feetL: [112, 226], feetR: [148, 224], handL: [80, 108], handR: [150, 88], lean: -12 },
  { feetL: [106, 226], feetR: [142, 226], handL: [88, 130], handR: [150, 96], lean: -6 },
];
const cell = (i, inner) => `<g transform="translate(${(i % 4) * G} ${Math.floor(i / 4) * G})">${inner}</g>`;
let cells = '';
STAND.forEach((cfg, i) => { cells += cell(i, crank(cfg)); });
// down 12-15: progressive knockdown (rotate around a low pivot + drop)
const downRot = [-22, -55, -82, -82];
const downDrop = [6, 26, 52, 54];
downRot.forEach((rot, k) => {
  const i = 12 + k;
  const base = crank({ feetL: [104, 226], feetR: [140, 226], handL: [86, 150], handR: [150, 120], lean: 0 });
  cells += cell(i, `<g transform="translate(0 ${downDrop[k]}) rotate(${rot} ${cx} 210)">${base}</g>`);
});
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 960 960">${cells}</svg>`;

const sheetPng = await sharp(Buffer.from(sheetSvg)).png().toBuffer();
const meta = await sharp(sheetPng).metadata();
writeFileSync(resolve(assets, replace ? 'enemy1.png' : 'enemy1-ai-preview.png'), sheetPng);
console.log(`✓ enemy sheet ${meta.width}x${meta.height} (${(sheetPng.length / 1024).toFixed(0)} kB)`);

// contact preview: raw + 2 archetype tints, scaled to fit
const tintStrip = async (tint) => {
  let img = sharp(sheetPng);
  if (tint) img = img.tint(tint);
  return img.resize(480, 480, { kernel: 'nearest' }).png().toBuffer();
};
const raw = await tintStrip(null);
const pink = await tintStrip({ r: 255, g: 170, b: 204 }); // Influencer
const red = await tintStrip({ r: 255, g: 136, b: 136 });  // Karen
const lbl = (t, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26"><rect width="100%" height="100%" fill="#1b1f29"/><text x="8" y="18" font-family="DejaVu Sans, Arial" font-size="14" fill="#cfd6e2">${t}</text></svg>`);
const preview = await sharp({ create: { width: 480 * 3 + 20, height: 480 + 26, channels: 4, background: '#3a3f4b' } })
  .composite([
    { input: lbl('RAW (walk / attack / hit / down)', 480), top: 0, left: 0 },
    { input: lbl('Influencer tint', 480), top: 0, left: 490 },
    { input: lbl('Karen tint', 480), top: 0, left: 980 },
    { input: raw, top: 26, left: 0 },
    { input: pink, top: 26, left: 490 },
    { input: red, top: 26, left: 980 },
  ]).png().toBuffer();
writeFileSync(resolve(assets, '_preview-enemy.png'), preview);
console.log('✓ contact sheet assets/_preview-enemy.png');
if (meta.width !== 960 || meta.height !== 960) { console.error('✗ sheet dim mismatch'); process.exit(1); }
