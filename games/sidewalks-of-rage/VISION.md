# Sidewalks of Rage — Vision & Roadmap

## Vision

A **massively-multiplayer, Streets-of-Rage-style side-scrolling beat-'em-up** where:

- The world is a long, **scrolling** brawler stage — large play area, many characters on screen,
  animated backgrounds, interactive environment.
- **Thousands of players worldwide play concurrently, 24/7.** Each player is randomly assigned to
  control one character on one of two factions — science (`fauci`) vs skeptic (`rogan`).
- The whole game is one giant **tug-of-war**: every local fight feeds a shared battle line. The
  winning side is progressively **disadvantaged** and the losing side **advantaged** (dynamic
  rubber-band), keeping the global war perpetually contested.
- Monetized via **in-world advertising** — the satirical billboards are the ad inventory.

## What already exists (the foundation)

- **Server-authoritative tug-of-war battle line + rubber-band difficulty** — the core meta loop —
  in `server/index.js`. This is the heart of the vision, already working.
- Real-time multiplayer (join / move / attack / kill, faction assignment) over WebSocket — small scale.
- **Polished pixel art**: animated player + enemy sheets, neon-conspiracy background.
- Combat feel (hitstop / knockback / combo), centralized tunables, persistence, CI, headless
  tests, single-source protocol. (Formal description: `specs/001-core-game-baseline`.)

## The honest scale reframe

Thousands of players **cannot share one screen** — bandwidth and rendering make it impossible, and
the current "broadcast every move to everyone" netcode (O(N²)) tops out around a few dozen players.
The vision is reached a different way:

- **Zones / shards:** many concurrent playable stages, each with a manageable number of co-located
  players.
- **One global battle line:** every zone's kills feed a single worldwide tug-of-war — the meta the
  players are really fighting over.
- **Interest management:** each client only receives nearby state.
- **Regional servers** for latency; a datastore for the global meta + persistence.

This keeps the vision fully intact (massive, global, 24/7, one shared war) while being technically real.

## Roadmap

### Phase 1 — Side-scrolling stage  *(now — laptop, no GPU)*
Turn the fixed single-screen arena into a scrolling Streets-of-Rage stage: wider-than-screen world,
camera follows the player, scrolling/parallax background, HUD pinned to the camera, world-relative
enemy spawning, interactive environment objects.
**Exit:** you can traverse a long stage, the camera scrolls, enemies spawn around you, the HUD stays
put, and combat/feel are unchanged. **Risk:** medium (reworks camera/spawn/clamp); verify by running
locally.

### Phase 2 — Art expansion  *(AI PC — RTX 3090)*
Fill the art gaps in the established pixel style: distinct enemy archetypes, a Rogan player variant,
bosses / new enemies, and more & longer scrolling backgrounds.
**Tool:** Stable Diffusion + a pixel-art LoRA (spec `002`, reframed as **additive**, not replacement).
**Risk:** low-medium; iterate visually on the AI PC.

### Phase 3 — Scale-out netcode  *(the big lift)*
Hundreds → thousands concurrent worldwide on one global battle line: interest management, zones/shards,
authoritative server simulation, persistence (DB), regional servers, reconnection. Likely a netcode
**rebuild** — the current naive broadcast is replaced.
**Exit:** load-tested to a target concurrency per zone; the global line aggregates across zones.
**Risk:** high; weeks–months; real hosting cost. Gets its own spec when committed.

### Phase 4 — Ops & monetization
Run it 24/7 and earn: hosting/scaling, monitoring, anti-cheat hardening (true server-authoritative
enemies — see `specs/001` FR-021 note), real ad serving into the billboards, analytics.
**Risk:** ongoing infra + business.

## Phase → spec mapping

| Phase | Spec |
|-------|------|
| 0 — baseline (done) | `specs/001-core-game-baseline` |
| 1 — scrolling stage | new spec (in progress) |
| 2 — art expansion | `specs/002-ai-art-pipeline` (reframe to additive) |
| cross-cutting — decomposition (enables all phases) | `specs/003-gamescene-hardening` |
| 3 — netcode, 4 — ops/ads | future specs |

## Constitution ties

Server-authoritative multiplayer (Principle II) becomes **mission-critical** at scale; a
scalability / interest-management principle will likely be added to the constitution at Phase 3.
All other principles hold and are reinforced by this direction.

## Right now

Building **Phase 1** (scrolling stage) on the laptop. **Phase 2** art waits for the AI PC.
**Phase 3** (true MMO scale) is the deliberate, expensive lift — planned, not hand-waved.
