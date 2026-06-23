#!/usr/bin/env node
// Vector/procedural background generator (prototype): authors a satirical dusk city-sidewalk
// SVG and rasterizes it to a drop-in PNG via sharp. Deterministic (seeded), so re-runs are
// identical. Palette matches the game's CityBackground.js so it looks native.
//
//   node art-pipeline/svg/gen-background.mjs            -> assets/background-ai-preview.png
//   node art-pipeline/svg/gen-background.mjs --replace  -> overwrite assets/background.png
//
// sharp resolves from the parent website's node_modules (this game dir is nested under it).
// This is a DEV-ONLY prototype tool; it adds no runtime dependency to the game.

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const W = 1536;
const H = 1024;
const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../../assets');
const replace = process.argv.includes('--replace');
const outPath = resolve(assets, replace ? 'background.png' : 'background-ai-preview.png');

// Seeded PRNG (mulberry32) so the composition is fixed/reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260623);
const ri = (a, b) => Math.floor(a + rand() * (b - a + 1));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sidewalkH = Math.round(H * 0.3); // 307
const horizonY = H - sidewalkH; // 717

// ── Building rows (silhouettes) with scattered warm windows on the near row ──
function buildingRow({ baseY, minW, maxW, minH, maxH, fill, gapMin, gapMax, windows }) {
  let s = '';
  let x = -ri(0, Math.round(maxW * 0.5));
  while (x < W) {
    const w = ri(minW, maxW);
    const h = ri(minH, maxH);
    const y = baseY - h;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
    if (windows) {
      for (let wy = y + 14; wy < baseY - 10; wy += 22) {
        for (let wx = x + 8; wx < x + w - 10; wx += 18) {
          if (rand() < 0.45) {
            const lit = rand() < 0.7 ? '#ffd98a' : '#7fb0ff';
            s += `<rect x="${wx}" y="${wy}" width="7" height="11" fill="${lit}" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`;
          }
        }
      }
    }
    x += w + ri(gapMin, gapMax);
  }
  return s;
}

// ── A satirical rooftop billboard on two posts ──
function billboard(cx, topY, w, h, panel, textColor, label) {
  const x = cx - w / 2;
  const postY = topY + h;
  const postH = horizonY - 120 - postY;
  // Fit the label to the panel width (account for bold glyph width + letter-spacing).
  const fs = Math.min(Math.round(h * 0.42), Math.floor((w - 34) / (label.length * 0.7)));
  return `
    <rect x="${cx - w * 0.32}" y="${postY}" width="6" height="${Math.max(0, postH)}" fill="#0a0e18"/>
    <rect x="${cx + w * 0.32 - 6}" y="${postY}" width="6" height="${Math.max(0, postH)}" fill="#0a0e18"/>
    <rect x="${x}" y="${topY}" width="${w}" height="${h}" fill="${panel}" stroke="#0a0e18" stroke-width="4" rx="3"/>
    <rect x="${x + 4}" y="${topY + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
    <text x="${cx}" y="${topY + h / 2}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
      font-size="${fs}" fill="${textColor}" text-anchor="middle" dominant-baseline="central"
      letter-spacing="1">${esc(label)}</text>`;
}

// ── A lit storefront just above the sidewalk, with an awning + sign ──
function storefront(x, w, awning, label) {
  const h = 96;
  const y = horizonY - h;
  let win = '';
  for (let wx = x + 12; wx < x + w - 16; wx += 26) {
    win += `<rect x="${wx}" y="${y + 34}" width="16" height="40" fill="#ffd98a" opacity="0.5"/>`;
  }
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#242424" stroke="#3f3f3f" stroke-width="2"/>
    ${win}
    <rect x="${x - 4}" y="${y + 18}" width="${w + 8}" height="18" fill="${awning}"/>
    <text x="${x + w / 2}" y="${y + 12}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold"
      font-size="15" fill="#e6e6e6" text-anchor="middle" dominant-baseline="central" letter-spacing="1">${esc(label)}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1a3a"/>
      <stop offset="0.55" stop-color="#241043"/>
      <stop offset="1" stop-color="#2c0b3d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="1" r="0.8">
      <stop offset="0" stop-color="#5a2a5e" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#5a2a5e" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
  <rect x="0" y="${horizonY - 360}" width="${W}" height="420" fill="url(#glow)"/>

  <!-- moon + stars -->
  <ellipse cx="1230" cy="170" rx="70" ry="64" fill="#f3ead0" opacity="0.92"/>
  <ellipse cx="1208" cy="156" rx="22" ry="20" fill="#241043" opacity="0.25"/>
  ${Array.from({ length: 60 }, () => `<circle cx="${ri(0, W)}" cy="${ri(0, horizonY - 240)}" r="${rand() < 0.85 ? 1.5 : 2.5}" fill="#fff" opacity="${(0.2 + rand() * 0.6).toFixed(2)}"/>`).join('')}

  <!-- far skyline -->
  ${buildingRow({ baseY: horizonY + 16, minW: 54, maxW: 120, minH: 180, maxH: 430, fill: '#141a2a', gapMin: 6, gapMax: 18, windows: false })}
  <!-- near skyline (with lit windows) -->
  ${buildingRow({ baseY: horizonY + 55, minW: 90, maxW: 200, minH: 260, maxH: 560, fill: '#0b0f1c', gapMin: 10, gapMax: 26, windows: true })}

  <!-- satirical billboards -->
  ${billboard(330, 250, 300, 92, '#b23b3b', '#ffffff', 'RAW MILK DEPOT')}
  ${billboard(800, 200, 430, 96, '#e6c34c', '#1a1208', 'ASK YOUR DOCTOR')}
  ${billboard(1180, 300, 300, 88, '#3b6fb2', '#ffffff', 'BUY MY COURSE')}

  <!-- storefronts along the street -->
  ${storefront(70, 230, '#3b82f6', 'VITAMIN BARN')}
  ${storefront(360, 250, '#ef4444', 'PODCAST STUDIO')}
  ${storefront(660, 220, '#4dd6a6', 'CROSSFIT & CRYSTALS')}
  ${storefront(950, 230, '#f2c94c', 'THE HERB SHOP')}
  ${storefront(1250, 220, '#b06fd6', 'GOLD & BUNKERS')}

  <!-- sidewalk -->
  <rect x="0" y="${horizonY}" width="${W}" height="${sidewalkH}" fill="#2a2a2a"/>
  <rect x="0" y="${horizonY}" width="${W}" height="${Math.round(sidewalkH * 0.38)}" fill="#3a3a3a"/>
  <line x1="0" y1="${horizonY + Math.round(sidewalkH * 0.38)}" x2="${W}" y2="${horizonY + Math.round(sidewalkH * 0.38)}" stroke="#555" stroke-width="2" opacity="0.8"/>
  ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * (W / 12)}" y1="${horizonY + Math.round(sidewalkH * 0.38)}" x2="${i * (W / 12)}" y2="${H}" stroke="#1f1f1f" stroke-width="2" opacity="0.6"/>`).join('')}
  <ellipse cx="430" cy="${H - 70}" rx="34" ry="10" fill="#1c1c1c"/>
  <ellipse cx="1080" cy="${H - 50}" rx="34" ry="10" fill="#1c1c1c"/>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
const meta = await sharp(png).metadata();
const { writeFileSync } = await import('node:fs');
writeFileSync(outPath, png);
console.log(`✓ wrote ${outPath}`);
console.log(`  dimensions: ${meta.width}x${meta.height} (${meta.format}), ${(png.length / 1024).toFixed(0)} kB`);
if (meta.width !== W || meta.height !== H) {
  console.error(`✗ dimension mismatch — expected ${W}x${H}`);
  process.exit(1);
}
