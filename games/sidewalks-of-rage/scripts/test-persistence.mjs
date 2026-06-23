#!/usr/bin/env node
// Verifies server state persistence (Step 4): global score + battle line survive a restart.
// Starts a server, drives one kill, stops it, asserts server/state.json was written with
// valid clamped values, then restarts and asserts a fresh client receives the persisted
// GLOBAL_SCORE / ROUND_STATE. Exits 0 on success, 1 on failure.

import { spawn } from 'node:child_process';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const STATE = resolve(root, 'server/state.json');
const PORT = 8124;
const URL = `ws://localhost:${PORT}`;

const fail = (m) => { console.error('✗ persistence test FAILED:', m); cleanup(); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { rmSync(STATE, { force: true }); rmSync(`${STATE}.tmp`, { force: true }); };

function startServer() {
  return spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
}
function connect() {
  const ws = new WebSocket(URL);
  ws.received = [];
  ws.on('message', (raw) => { try { ws.received.push(JSON.parse(raw.toString())); } catch {} });
  return new Promise((res, rej) => { ws.on('open', () => res(ws)); ws.on('error', rej); });
}
const last = (ws, type) => [...ws.received].reverse().find((m) => m.type === type);
const send = (ws, type, payload = {}) => ws.send(JSON.stringify({ type, payload }));

cleanup();
let server = startServer();
try {
  await sleep(800);
  const a = await connect();
  send(a, MESSAGE_TYPES.PLAYER_JOIN, { x: 100, y: 100, facing: 'right', isAttacking: false });
  await sleep(400);
  const faction = last(a, MESSAGE_TYPES.FACTION_ASSIGNED)?.payload?.faction;
  const startLine = last(a, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  send(a, MESSAGE_TYPES.PLAYER_KILL);
  await sleep(300);
  const movedLine = last(a, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  if (movedLine === startLine) fail('kill did not move the battle line before restart');
  a.close();
  await sleep(200);

  // First server stop — state.json must exist with valid values.
  server.kill();
  await sleep(500);
  if (!existsSync(STATE)) fail('state.json was not written');
  const saved = JSON.parse(readFileSync(STATE, 'utf8'));
  const bl = saved?.battleLinePosition;
  if (typeof bl !== 'number' || bl < 0 || bl > 100) fail(`persisted battleLinePosition invalid: ${bl}`);
  if (typeof saved?.globalScore?.fauci !== 'number' || typeof saved?.globalScore?.rogan !== 'number') {
    fail('persisted globalScore missing numeric fauci/rogan');
  }
  if (bl !== movedLine) fail(`persisted line ${bl} != last broadcast ${movedLine}`);

  // Restart — a fresh client must see the persisted battle line.
  server = startServer();
  await sleep(800);
  const b = await connect();
  send(b, MESSAGE_TYPES.PLAYER_JOIN, { x: 100, y: 100, facing: 'right', isAttacking: false });
  await sleep(400);
  const reloadedLine = last(b, MESSAGE_TYPES.ROUND_STATE)?.payload?.battleLine;
  if (reloadedLine !== bl) fail(`reloaded line ${reloadedLine} != persisted ${bl}`);
  b.close();

  console.log(`✓ persistence test passed — line ${startLine}→${movedLine} persisted and reloaded as ${reloadedLine} (faction ${faction}).`);
  server.kill();
  cleanup();
  process.exit(0);
} catch (err) {
  fail(err.message);
} finally {
  try { server.kill(); } catch {}
}
