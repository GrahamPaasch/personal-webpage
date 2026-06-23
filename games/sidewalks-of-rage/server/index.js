import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
// Canonical network protocol — single source of truth shared with the client.
// See specs/001-core-game-baseline/contracts/network-protocol.md (Constitution I, FR-026).
import { MESSAGE_TYPES } from '../src/network/protocol.js';

const port = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port });
const clients = new Set();
const players = new Map();
const socketToPlayerId = new Map();

const globalScore = { fauci: 0, rogan: 0 };
const roundState = { active: true, battleLinePosition: 50 };
const FACTIONS = ['fauci', 'rogan'];
const ROSTER_ARCHETYPES = {
  fauci: [
    'Lab Lecturer',
    'Peer Reviewer',
    'Policy Tutor',
    'Evidence Wrangler',
    'Guideline Editor',
    'Data Coach',
    'Protocol Trainer',
    'Consensus Builder'
  ],
  rogan: [
    'Field Questioner',
    'Skeptic Scout',
    'Research Wanderer',
    'Signal Seeker',
    'Source Doubter',
    'Curiosity Captain',
    'Debate Drifter',
    'Contrarian Runner'
  ]
};
const BATTLE_LINE_STEP = 5;

// Flood mitigation for PLAYER_KILL. Enemies are simulated client-side, so the server cannot
// truly validate a kill it never saw — and crucially, ONE legitimate swing can kill several
// low-HP enemies in the same frame, firing multiple PLAYER_KILL messages microseconds apart.
// So we DO NOT rate-limit per-kill (that would silently drop legitimate multi-kills). Instead
// we cap accepted kills over a rolling window: high enough to never clip real play, low enough
// to bound a runaway/garbage flood (resource + magnitude protection). This is mitigation, NOT
// exploit prevention — a true fix requires server-authoritative enemy simulation, tracked as a
// future feature (see specs/ "server-authoritative enemies").
const KILL_LIMITS = {
  KILL_WINDOW_MS: 10000, // rolling window for the flood cap
  MAX_KILLS_PER_WINDOW: 60 // ~6 kills/sec sustained: above any plausible human rate, bounds floods
};

// File-based persistence so global score / battle line survive a server restart (no DB,
// per Constitution V). Resolved relative to this module (not process.cwd()), so it is stable
// regardless of how the server is launched.
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'state.json');
const STATE_TMP = `${STATE_FILE}.tmp`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeFacing = (facing) => (facing === 'left' ? 'left' : 'right');

const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

// Load persisted state on boot. Never crash boot on a missing/corrupt file — fall back to
// defaults. 'active' is never persisted (a round is always live on boot).
const loadState = () => {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    globalScore.fauci = Math.max(0, Math.floor(toNumber(raw?.globalScore?.fauci, 0)));
    globalScore.rogan = Math.max(0, Math.floor(toNumber(raw?.globalScore?.rogan, 0)));
    roundState.battleLinePosition = clamp(toNumber(raw?.battleLinePosition, 50), 0, 100);
  } catch (error) {
    // Missing or unreadable state file — start fresh.
  }
  roundState.active = true;
};

// Atomic write: stage to a tmp file then rename over the target.
const saveState = () => {
  try {
    const data = JSON.stringify({
      globalScore: { ...globalScore },
      battleLinePosition: roundState.battleLinePosition
    });
    writeFileSync(STATE_TMP, data);
    renameSync(STATE_TMP, STATE_FILE);
  } catch (error) {
    console.error('Failed to persist state:', error);
  }
};

loadState();

const sendMessage = (socket, type, payload = {}) => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify({ type, payload }));
};

const broadcast = (type, payload = {}, excludeSocket = null) => {
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client === excludeSocket) {
      continue;
    }
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
};

const getFactionCounts = () => {
  let fauciPlayers = 0;
  let roganPlayers = 0;
  for (const player of players.values()) {
    if (player.faction === 'fauci') {
      fauciPlayers += 1;
    } else if (player.faction === 'rogan') {
      roganPlayers += 1;
    }
  }
  return { fauciPlayers, roganPlayers };
};

const chooseFaction = () => {
  const { fauciPlayers, roganPlayers } = getFactionCounts();

  // If one team has fewer players, assign to that team for roster balance
  if (fauciPlayers !== roganPlayers) {
    return fauciPlayers < roganPlayers ? 'fauci' : 'rogan';
  }

  // If rosters are equal, assign to the team that is currently losing
  // battleLinePosition > 50 means Fauci is winning, so assign to Rogan
  // battleLinePosition < 50 means Rogan is winning, so assign to Fauci
  if (roundState.battleLinePosition > 50) {
    return 'rogan';
  } else if (roundState.battleLinePosition < 50) {
    return 'fauci';
  }

  // Perfectly tied: random
  return FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
};

const chooseArchetype = (faction) => {
  const roster = ROSTER_ARCHETYPES[faction] || ROSTER_ARCHETYPES.fauci;
  return roster[Math.floor(Math.random() * roster.length)];
};

const roundStatePayload = () => {
  const { fauciPlayers, roganPlayers } = getFactionCounts();
  return {
    battleLine: roundState.battleLinePosition,
    fauciPlayers,
    roganPlayers
  };
};

const broadcastRoundState = () => {
  broadcast(MESSAGE_TYPES.ROUND_STATE, roundStatePayload());
};

const sendGlobalScore = (socket) => {
  sendMessage(socket, MESSAGE_TYPES.GLOBAL_SCORE, { ...globalScore });
};

const broadcastGlobalScore = () => {
  broadcast(MESSAGE_TYPES.GLOBAL_SCORE, { ...globalScore });
};

const endRound = (winner) => {
  if (!FACTIONS.includes(winner)) {
    return;
  }

  roundState.active = false;
  globalScore[winner] += 1;
  broadcast(MESSAGE_TYPES.ROUND_END, { winner });
  broadcastGlobalScore();

  roundState.battleLinePosition = 50;
  roundState.active = true;
  broadcastRoundState();
  saveState();
};

const applyKillToBattleLine = (faction) => {
  if (!FACTIONS.includes(faction)) {
    return;
  }

  const delta = faction === 'fauci' ? BATTLE_LINE_STEP : -BATTLE_LINE_STEP;
  roundState.battleLinePosition = clamp(roundState.battleLinePosition + delta, 0, 100);

  if (roundState.battleLinePosition === 0 || roundState.battleLinePosition === 100) {
    const winner = roundState.battleLinePosition === 100 ? 'fauci' : 'rogan';
    endRound(winner);
    return;
  }

  broadcastRoundState();
  saveState();
};

wss.on('connection', (socket) => {
  clients.add(socket);

  socket.on('message', (data) => {
    let parsed = null;
    try {
      parsed = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (!parsed || !parsed.type) {
      return;
    }

    const { type, payload = {} } = parsed;

    if (type === MESSAGE_TYPES.PLAYER_JOIN) {
      if (socketToPlayerId.has(socket)) {
        return;
      }

      const playerId = randomUUID();
      const faction = chooseFaction();
      const archetype = chooseArchetype(faction);
      const player = {
        id: playerId,
        x: toNumber(payload.x, 0),
        y: toNumber(payload.y, 0),
        facing: normalizeFacing(payload.facing),
        isAttacking: Boolean(payload.isAttacking),
        faction,
        archetype,
        killTimes: []
      };

      players.set(playerId, player);
      socketToPlayerId.set(socket, playerId);

      sendMessage(socket, MESSAGE_TYPES.PLAYER_ID, { id: playerId });
      sendMessage(socket, MESSAGE_TYPES.FACTION_ASSIGNED, { faction });
      sendGlobalScore(socket);
      const existingPlayers = Array.from(players.values()).filter((entry) => entry.id !== playerId);
      sendMessage(socket, MESSAGE_TYPES.GAME_STATE, { players: existingPlayers });
      broadcast(MESSAGE_TYPES.PLAYER_JOINED, player, socket);
      broadcastRoundState();
      return;
    }

    const playerId = socketToPlayerId.get(socket);
    if (!playerId) {
      return;
    }

    const player = players.get(playerId);
    if (!player) {
      return;
    }

    if (type === MESSAGE_TYPES.PLAYER_MOVE) {
      player.x = toNumber(payload.x, player.x);
      player.y = toNumber(payload.y, player.y);
      player.facing = normalizeFacing(payload.facing || player.facing);

      broadcast(MESSAGE_TYPES.PLAYER_MOVE, {
        id: playerId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        faction: player.faction
      });
      return;
    }

    if (type === MESSAGE_TYPES.PLAYER_ATTACK) {
      if (typeof payload.x !== 'undefined') {
        player.x = toNumber(payload.x, player.x);
      }
      if (typeof payload.y !== 'undefined') {
        player.y = toNumber(payload.y, player.y);
      }
      if (payload.facing) {
        player.facing = normalizeFacing(payload.facing);
      }
      player.isAttacking = true;

      broadcast(MESSAGE_TYPES.PLAYER_ATTACK, {
        id: playerId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        faction: player.faction
      });

      setTimeout(() => {
        const current = players.get(playerId);
        if (current) {
          current.isAttacking = false;
        }
      }, 200);
    }

    if (type === MESSAGE_TYPES.PLAYER_KILL) {
      // Flood cap only (see KILL_LIMITS): never per-kill throttle, so legitimate same-frame
      // multi-kills all count. Rejected kills are silently dropped — no broadcast, no disconnect.
      if (!roundState.active) {
        return;
      }
      const now = Date.now();
      player.killTimes = player.killTimes.filter((t) => now - t < KILL_LIMITS.KILL_WINDOW_MS);
      if (player.killTimes.length >= KILL_LIMITS.MAX_KILLS_PER_WINDOW) {
        return;
      }
      player.killTimes.push(now);
      applyKillToBattleLine(player.faction);
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    const playerId = socketToPlayerId.get(socket);
    if (playerId) {
      socketToPlayerId.delete(socket);
      players.delete(playerId);
      broadcast(MESSAGE_TYPES.PLAYER_LEFT, { id: playerId }, socket);
      broadcastRoundState();
    }
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log(`WebSocket server listening on ws://localhost:${port}`);
