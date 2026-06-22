# Contract: Network Protocol (canonical)

This is the **single source of truth** for the client⇄server message catalog (FR-026,
Constitution I). The canonical definition lives in code at `src/network/protocol.js`
(`MESSAGE_TYPES`); the server (`server/index.js`) MUST import it rather than redeclaring it.
This document describes the contract those constants represent.

**Transport**: WebSocket. **Envelope**: every message is JSON `{ "type": <MESSAGE_TYPE>,
"payload": <object> }`. **URL**: client derives `ws`/`wss` from page protocol and uses the
current hostname on the server port (default 8080).

## Message catalog

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `PLAYER_JOIN` | Client → Server | `{ x, y, facing, isAttacking }` | Announce arrival; server assigns id, faction, archetype |
| `PLAYER_ID` | Server → joining client | `{ id }` | Deliver the assigned unique player id |
| `FACTION_ASSIGNED` | Server → joining client | `{ faction }` | Tell the player their team (`fauci`/`rogan`) |
| `GAME_STATE` | Server → joining client | `{ players: [...] }` | Snapshot of all currently-connected players |
| `PLAYER_JOINED` | Server → others | `{ id, x, y, facing, isAttacking, faction, archetype }` | Notify existing players of a new arrival |
| `PLAYER_LEFT` | Server → others | `{ id }` | Notify that a player disconnected |
| `PLAYER_MOVE` | Client → Server → others | `{ id, x, y, facing }` | Periodic position/facing update (~15×/sec) |
| `PLAYER_ATTACK` | Client → Server → others | `{ id, x, y, facing }` | Attack swing; server sets isAttacking, clears after timeout |
| `PLAYER_KILL` | Client → Server | `{}` | Player defeated an enemy; shifts battle line toward their faction |
| `ROUND_STATE` | Server → all | `{ battleLine, fauciPlayers, roganPlayers }` | Current battle-line position and per-faction counts |
| `ROUND_END` | Server → all | `{ winner }` | A faction reached an extreme; round resolved |
| `GLOBAL_SCORE` | Server → all (or one) | `{ fauci, rogan }` | Cumulative round wins per faction |
| `PLAYER_LEAVE` | (reserved) | — | Present in the catalog; disconnect is handled via socket close |

## Authority rules (Constitution II)

- The server is the sole authority for: `id`, `faction`, `archetype`, battle-line `position`,
  round `active`/`winner`, and `GLOBAL_SCORE`. Clients MUST render these as received.
- Clients send only intent: `PLAYER_JOIN`, `PLAYER_MOVE`, `PLAYER_ATTACK`, `PLAYER_KILL`.
- Clients MUST NOT locally decide kills' effect on the shared line, faction assignment, or
  score — those are server outcomes broadcast back.

## Single-source-of-truth rule (Constitution I)

- `MESSAGE_TYPES` is defined exactly once (`src/network/protocol.js`).
- `server/index.js` imports it; it MUST NOT contain a second literal copy.
- Adding, renaming, or removing a message type, or changing a payload's fields/semantics,
  MUST update the canonical module first and be applied to both sender and receiver in the
  same change.

## Round / battle-line semantics

- Each `PLAYER_KILL` shifts the battle line one fixed `step` toward the killer's faction
  (`fauci` → toward 100, `rogan` → toward 0), clamped to [0, 100].
- Reaching 0 → `ROUND_END { winner: "rogan" }`; reaching 100 → `ROUND_END { winner: "fauci" }`.
- On round end the server increments `GLOBAL_SCORE[winner]`, broadcasts `ROUND_END` and
  `GLOBAL_SCORE`, resets the line to 50, and continues immediately (no pause).

## Contract test (validates the single source of truth)

A minimal Node check (no test framework required) asserts the server does not redeclare the
catalog and uses the canonical keys:

1. Import `MESSAGE_TYPES` from `src/network/protocol.js`.
2. Assert it contains every type listed in the catalog above.
3. Assert (by inspection / a guard) that `server/index.js` imports the canonical module rather
   than defining its own `MESSAGE_TYPES` literal.

This is the one behavioral-risk guard called out in `research.md` (R1/R4).
