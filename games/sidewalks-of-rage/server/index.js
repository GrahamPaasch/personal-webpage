import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port });
const clients = new Set();
const players = new Map();
const socketToPlayerId = new Map();

const MESSAGE_TYPES = {
  PLAYER_JOIN: 'PLAYER_JOIN',
  PLAYER_MOVE: 'PLAYER_MOVE',
  PLAYER_ATTACK: 'PLAYER_ATTACK',
  PLAYER_KILL: 'PLAYER_KILL',
  PLAYER_ID: 'PLAYER_ID',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  GAME_STATE: 'GAME_STATE',
  FACTION_ASSIGNED: 'FACTION_ASSIGNED',
  ROUND_STATE: 'ROUND_STATE',
  ROUND_END: 'ROUND_END',
  GLOBAL_SCORE: 'GLOBAL_SCORE'
};

const globalScore = { fauci: 0, rogan: 0 };
const roundState = { active: true, battleLinePosition: 50 };
const FACTIONS = ['fauci', 'rogan'];
const BATTLE_LINE_STEP = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeFacing = (facing) => (facing === 'left' ? 'left' : 'right');

const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

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
  return fauciPlayers <= roganPlayers ? 'fauci' : 'rogan';
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
      const player = {
        id: playerId,
        x: toNumber(payload.x, 0),
        y: toNumber(payload.y, 0),
        facing: normalizeFacing(payload.facing),
        isAttacking: Boolean(payload.isAttacking),
        faction
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
