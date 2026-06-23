#!/usr/bin/env node
// Protocol single-source-of-truth guard (Constitution I, FR-026).
// Asserts that:
//   1. The canonical MESSAGE_TYPES in src/network/protocol.js contains every type
//      listed in the network-protocol contract.
//   2. server/index.js does NOT declare its own MESSAGE_TYPES literal (it must import
//      the canonical module instead).
// Exits non-zero on any violation so it can run in CI or a pre-commit check.
//
// Usage: node scripts/check-protocol.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// The canonical catalog every component must agree on.
const REQUIRED_TYPES = [
  'PLAYER_JOIN',
  'PLAYER_ID',
  'FACTION_ASSIGNED',
  'GAME_STATE',
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'PLAYER_MOVE',
  'PLAYER_ATTACK',
  'PLAYER_KILL',
  'ROUND_STATE',
  'ROUND_END',
  'GLOBAL_SCORE',
  'PLAYER_LEAVE',
];

const errors = [];

// 1. Canonical module completeness + key/value consistency.
for (const type of REQUIRED_TYPES) {
  if (!(type in MESSAGE_TYPES)) {
    errors.push(`Canonical MESSAGE_TYPES is missing required type: ${type}`);
  } else if (MESSAGE_TYPES[type] !== type) {
    errors.push(`Canonical MESSAGE_TYPES.${type} should equal "${type}" but is "${MESSAGE_TYPES[type]}"`);
  }
}

// 2. Server must not redeclare its own MESSAGE_TYPES literal.
const serverSrc = readFileSync(resolve(root, 'server/index.js'), 'utf8');
if (/(?:const|let|var)\s+MESSAGE_TYPES\s*=/.test(serverSrc)) {
  errors.push('server/index.js declares its own MESSAGE_TYPES literal — it MUST import the canonical module from src/network/protocol.js instead.');
}
if (!/import\s*\{[^}]*\bMESSAGE_TYPES\b[^}]*\}\s*from\s*['"][^'"]*protocol\.js['"]/.test(serverSrc)) {
  errors.push('server/index.js does not import MESSAGE_TYPES from the canonical protocol module.');
}

if (errors.length > 0) {
  console.error('✗ Protocol single-source-of-truth check FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`✓ Protocol single-source-of-truth check passed (${REQUIRED_TYPES.length} message types, single canonical definition).`);
