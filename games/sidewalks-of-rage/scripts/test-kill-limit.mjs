#!/usr/bin/env node
// Verifies the PLAYER_KILL flood cap (Step 5): a client cannot exceed MAX_KILLS_PER_WINDOW
// accepted kills within KILL_WINDOW_MS. With the cap at 60 and a round ending every 10 kills,
// firing 80 rapid same-faction kills must yield exactly 6 ROUND_END events (60 accepted),
// with the final ~20 kills silently dropped. Exits 0 on success, 1 on failure.
//
// Note: this guards FLOOD magnitude only — it does not (and cannot, with client-side enemies)
// prevent a clever cheater from spamming up to the cap. True validation needs server-side
// enemies. This test just proves the cap engages and does not clip same-frame multi-kills.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const STATE = resolve(root, 'server/state.json');
const PORT = 8125;
const URL = `ws://localhost:${PORT}`;
const CAP = 60; // must match server KILL_LIMITS.MAX_KILLS_PER_WINDOW
const KILLS_PER_ROUND = 10; // 50→extreme at BATTLE_LINE_STEP=5
const EXPECTED_ROUNDS = CAP / KILLS_PER_ROUND;

const fail = (m) => { console.error('✗ kill-limit test FAILED:', m); cleanup(); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { rmSync(STATE, { force: true }); rmSync(`${STATE}.tmp`, { force: true }); };

cleanup();
const server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
try {
  await sleep(800);
  const ws = new WebSocket(URL);
  let roundEnds = 0;
  ws.on('message', (raw) => {
    try { const m = JSON.parse(raw.toString()); if (m.type === MESSAGE_TYPES.ROUND_END) roundEnds += 1; } catch {}
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.send(JSON.stringify({ type: MESSAGE_TYPES.PLAYER_JOIN, payload: { x: 0, y: 0, facing: 'right', isAttacking: false } }));
  await sleep(400);

  // Fire 80 kills as fast as possible (all inside the 10s window).
  for (let i = 0; i < 80; i++) {
    ws.send(JSON.stringify({ type: MESSAGE_TYPES.PLAYER_KILL, payload: {} }));
    await sleep(8);
  }
  await sleep(500);

  if (roundEnds !== EXPECTED_ROUNDS) {
    fail(`expected exactly ${EXPECTED_ROUNDS} ROUND_END events from a ${CAP}-kill cap, got ${roundEnds} (cap not enforced or mis-sized)`);
  }
  ws.close();
  console.log(`✓ kill-limit test passed — 80 rapid kills capped to ${CAP} accepted (${roundEnds} rounds); excess dropped.`);
  server.kill();
  cleanup();
  process.exit(0);
} catch (err) {
  fail(err.message);
} finally {
  try { server.kill(); } catch {}
}
