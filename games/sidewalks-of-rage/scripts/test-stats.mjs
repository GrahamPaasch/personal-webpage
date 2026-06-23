#!/usr/bin/env node
// Verifies the observability HTTP surface (specs/004): GET /stats reflects live concurrency +
// faction counts, GET /health returns ok, and a structured "join" event is logged. Exits 0/1.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const STATE = resolve(root, 'server/state.json');
const PORT = 8126;

const fail = (m) => { console.error('✗ stats test FAILED:', m); cleanup(); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { rmSync(STATE, { force: true }); rmSync(`${STATE}.tmp`, { force: true }); };
const fetchJson = (path) => new Promise((res, rej) => {
  get(`http://localhost:${PORT}${path}`, (r) => {
    let body = ''; r.on('data', (c) => { body += c; });
    r.on('end', () => res({ status: r.statusCode, body }));
  }).on('error', rej);
});

cleanup();
let log = '';
const server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) } });
server.stdout.on('data', (d) => { log += d.toString(); });
try {
  await sleep(800);

  // /health before anyone joins
  const health = await fetchJson('/health');
  if (health.status !== 200 || health.body.trim() !== 'ok') fail(`/health returned ${health.status} "${health.body}"`);

  // /stats with zero players
  const empty = JSON.parse((await fetchJson('/stats')).body);
  if (empty.concurrent !== 0) fail(`expected 0 concurrent before join, got ${empty.concurrent}`);
  for (const k of ['fauci', 'rogan', 'battleLine', 'peakConcurrent', 'totalConnections', 'totalKills', 'uptimeSec']) {
    if (typeof empty[k] !== 'number') fail(`/stats missing numeric field: ${k}`);
  }

  // connect + join, then re-check
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.send(JSON.stringify({ type: MESSAGE_TYPES.PLAYER_JOIN, payload: { x: 0, y: 0, facing: 'right' } }));
  await sleep(400);
  const after = JSON.parse((await fetchJson('/stats')).body);
  if (after.concurrent !== 1) fail(`expected 1 concurrent after join, got ${after.concurrent}`);
  if (after.fauci + after.rogan !== 1) fail(`faction counts should sum to 1, got fauci=${after.fauci} rogan=${after.rogan}`);
  if (after.peakConcurrent < 1) fail(`peakConcurrent should be >=1, got ${after.peakConcurrent}`);
  if (after.totalConnections < 1) fail(`totalConnections should be >=1, got ${after.totalConnections}`);
  if (!/"evt":"join"/.test(log)) fail('no structured "join" event was logged');

  ws.close();
  console.log(`✓ stats test passed — /health ok, /stats reflects concurrency=${after.concurrent}, peak=${after.peakConcurrent}, join event logged.`);
  server.kill();
  cleanup();
  process.exit(0);
} catch (err) {
  fail(err.message);
} finally {
  try { server.kill(); } catch {}
}
