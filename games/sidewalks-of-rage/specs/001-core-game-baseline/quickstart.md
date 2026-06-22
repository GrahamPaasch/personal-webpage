# Quickstart & Validation: Core Game Baseline

A runnable guide to start the game and validate the spec's acceptance criteria. Run all
commands from the game project root: `games/sidewalks-of-rage/`.

## Prerequisites

- Node.js 18+ (16.7+ hard floor; server uses `crypto.randomUUID`)
- `npm install` completed in `games/sidewalks-of-rage/`
- Two browser windows/devices available for multiplayer checks

## Run

```bash
# Terminal 1 — authoritative WebSocket server (default port 8080, override with PORT)
npm run server

# Terminal 2 — Vite dev server for the client
npm run dev
```

Open the printed local URL in a browser. For production-style output: `npm run build`
(emits to `../../public/sidewalks-of-rage/`), then `npm run preview`.

## Validation scenarios (mapped to spec acceptance criteria)

### V1 — Core brawl loop (User Story P1)
1. From the title screen, press Space / Enter / tap → arena loads, avatar appears. *(US1-AC1)*
2. Move with WASD/arrows → avatar moves on both axes; vertical feels slower than horizontal;
   avatar faces last horizontal direction. *(US1-AC2, FR-003/004)*
3. Approach an enemy and press Space in front of it during the swing → enemy takes a hit with
   hit-pause, knockback, and screen shake; its health drops. *(US1-AC3, FR-009/011)*
4. Let enemies reduce health to 0 → death overlay shows; after the delay the player respawns
   at full health with brief invincibility. *(US1-AC4, FR-013)*
5. Hold an attack or jump and press movement → movement is suppressed until it ends.
   *(US1-AC5, FR-006)*

### V2 — Shared faction battle (User Story P2)
1. Open a second client → it is assigned a faction + archetype and learns current global score
   and existing players. *(US2-AC1, FR-002/021)*
2. Move/attack in one client → the other client reflects that player's position/facing/attack
   sub-second. *(US2-AC2, SC-003)*
3. Score kills → the battle line shifts one fixed step toward the killer's faction on **all**
   clients. *(US2-AC3, FR-023)*
4. Drive the line to an extreme → round ends, winning faction's global score increments
   everywhere, a round-end banner shows, line resets to 50. *(US2-AC4, FR-024)*
5. Close one client → remaining clients remove that player and update faction counts.
   *(US2-AC5, FR-025)*

### V3 — Mastery: combos, waves, difficulty (User Story P3)
1. Land consecutive hits within the combo window → combo counter and (past threshold) banner
   appear; kills award combo-scaled score; high combos show streak messages. *(US3-AC1/2,
   FR-019/020)*
2. Take damage or die → combo resets. *(US3-AC3)*
3. Defeat enough enemies → a new wave is announced; later waves spawn more enemies faster.
   *(US3-AC4, FR-017)*
4. Push the battle line in your faction's favor → enemies get tougher/faster and spawn more;
   push it against you → easier/fewer. *(US3-AC5, FR-018)*

### V4 — Input parity (SC-002, FR-007/008)
1. Complete V1 steps 1–3 using **keyboard only**.
2. On a touch device (or emulated touch), confirm the virtual D-pad + jump/attack buttons
   appear and complete the same actions using **touch only**, with identical effect.
3. On a non-touch device, confirm touch controls are hidden.

### V5 — Canonical protocol (FR-026, Constitution I) — the one behavioral-risk guard
After the protocol-consolidation task is implemented:

```bash
# Expect: NO second MESSAGE_TYPES literal in the server (it should import the canonical module)
grep -n "MESSAGE_TYPES" server/index.js
grep -n "import .* protocol.js" server/index.js   # expect an import of the canonical module
```

Then re-run V2 end-to-end to confirm join/move/attack/kill/round/score flow is unchanged
(no behavioral difference for players). *(SC-006)*

## Expected outcome

All V1–V4 scenarios pass against the current build (baseline behavior), and V5 passes once the
protocol is consolidated to a single source. Any deviation is a finding for `/speckit-tasks`
or a spec amendment.
