#!/usr/bin/env node
// Headless multiplayer smoke test (quickstart V2 + V5, SC-003/SC-004/SC-006).
// Spawns the WebSocket server on an ephemeral port, connects two clients, and verifies the
// server-authoritative flow end-to-end: join handshake, remote broadcast of move/attack,
// battle-line shift per kill, round end at an extreme, and global-score increment + reset.
// Proves the canonical-protocol refactor (T004-T007) is behavior-neutral.
//
// Usage: node scripts/smoke-multiplayer.mjs

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const PORT = 8123;
const URL = `ws://localhost:${PORT}`;

// Start from clean persisted state so prior runs don't leak score into assertions.
const clearState = () => {
  rmSync(resolve(root, 'server/state.json'), { force: true });
  rmSync(resolve(root, 'server/state.json.tmp'), { force: true });
};
clearState();

const fail = (msg) => { console.error('✗ smoke FAILED:', msg); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name) {
  const ws = new WebSocket(URL);
  ws.received = [];
  ws.on('message', (raw) => {
    try { ws.received.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
  });
  return new Promise((res, rej) => {
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}

const typesOf = (ws) => ws.received.map((m) => m.type);
const last = (ws, type) => [...ws.received].reverse().find((m) => m.type === type);
const send = (ws, type, payload = {}) => ws.send(JSON.stringify({ type, payload }));

const server = spawn('node', ['server/index.js'], {
  cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});

try {
  await sleep(800); // let the server bind

  // --- Client A joins ---
  const a = await connect('A');
  send(a, MESSAGE_TYPES.PLAYER_JOIN, { x: 100, y: 100, facing: 'right', isAttacking: false });
  await sleep(400);

  const aTypes = typesOf(a);
  for (const expected of [MESSAGE_TYPES.PLAYER_ID, MESSAGE_TYPES.FACTION_ASSIGNED, MESSAGE_TYPES.GLOBAL_SCORE, MESSAGE_TYPES.ROUND_STATE]) {
    if (!aTypes.includes(expected)) fail(`A did not receive ${expected} on join (got: ${aTypes.join(', ')})`);
  }
  const faction = last(a, MESSAGE_TYPES.FACTION_ASSIGNED)?.payload?.faction;
  if (faction !== 'fauci' && faction !== 'rogan') fail(`A got invalid faction: ${faction}`);
  const startLine = last(a, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  console.log(`  • A joined as "${faction}", battle line at ${startLine}`);

  // --- Client B joins; A should be told B joined ---
  const b = await connect('B');
  send(b, MESSAGE_TYPES.PLAYER_JOIN, { x: 200, y: 150, facing: 'left', isAttacking: false });
  await sleep(400);
  if (!typesOf(a).includes(MESSAGE_TYPES.PLAYER_JOINED)) fail('A was not notified of B joining (PLAYER_JOINED)');
  console.log('  • B joined; A received PLAYER_JOINED');

  // --- A moves and attacks; B should see both (SC-003) ---
  b.received.length = 0;
  send(a, MESSAGE_TYPES.PLAYER_MOVE, { x: 120, y: 110, facing: 'right' });
  send(a, MESSAGE_TYPES.PLAYER_ATTACK, { x: 120, y: 110, facing: 'right' });
  await sleep(400);
  if (!typesOf(b).includes(MESSAGE_TYPES.PLAYER_MOVE)) fail('B did not receive A PLAYER_MOVE');
  if (!typesOf(b).includes(MESSAGE_TYPES.PLAYER_ATTACK)) fail('B did not receive A PLAYER_ATTACK');
  console.log('  • A move + attack mirrored to B');

  // --- A scores one kill; battle line must shift one step toward A faction (SC-004) ---
  a.received.length = 0;
  send(a, MESSAGE_TYPES.PLAYER_KILL);
  await sleep(300);
  const afterOne = last(a, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  if (typeof afterOne !== 'number') fail('No ROUND_STATE broadcast after a kill');
  const expectedDir = faction === 'fauci' ? 1 : -1;
  if (Math.sign(afterOne - startLine) !== expectedDir) {
    fail(`Battle line moved wrong direction for ${faction}: ${startLine} -> ${afterOne}`);
  }
  console.log(`  • One kill shifted battle line ${startLine} -> ${afterOne} (toward ${faction})`);

  // --- Drive to an extreme; expect ROUND_END + GLOBAL_SCORE + reset to neutral.
  // Send one kill at a time and STOP as soon as a round ends, so we don't push the
  // freshly-reset line back up with extra kills. ---
  a.received.length = 0;
  // ~10 kills end a round; well under the flood cap (60/10s), so spacing only needs to let
  // each ROUND_STATE round-trip before we check for ROUND_END.
  for (let i = 0; i < 30 && !last(a, MESSAGE_TYPES.ROUND_END); i++) {
    send(a, MESSAGE_TYPES.PLAYER_KILL);
    await sleep(80);
  }
  await sleep(300);
  const roundEnd = last(a, MESSAGE_TYPES.ROUND_END);
  if (!roundEnd) fail('Driving the line to an extreme did not produce ROUND_END');
  if (roundEnd.payload?.winner !== faction) fail(`ROUND_END winner ${roundEnd.payload?.winner} != ${faction}`);
  if (!last(a, MESSAGE_TYPES.GLOBAL_SCORE)) fail('No GLOBAL_SCORE broadcast on round end');
  const resetLine = last(a, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  if (resetLine !== 50) fail(`Battle line did not reset to 50 after round end (got ${resetLine})`);
  const score = last(a, MESSAGE_TYPES.GLOBAL_SCORE).payload;
  console.log(`  • Round ended: winner=${roundEnd.payload.winner}, global score fauci=${score.fauci} rogan=${score.rogan}, line reset to ${resetLine}`);

  // --- B disconnects; A should be told (PLAYER_LEFT) ---
  a.received.length = 0;
  b.close();
  await sleep(400);
  if (!typesOf(a).includes(MESSAGE_TYPES.PLAYER_LEFT)) fail('A was not notified of B leaving (PLAYER_LEFT)');
  console.log('  • B disconnected; A received PLAYER_LEFT');

  a.close();
  console.log('✓ multiplayer smoke test passed — server-authoritative flow is behavior-neutral after refactor.');
  process.exit(0);
} catch (err) {
  fail(err.message);
} finally {
  server.kill();
  clearState();
}
