<!-- SPECKIT START -->
# Sidewalks of Rage — Agent Context

Real-time, browser-based, multiplayer 2.5D beat-'em-up brawler.

- **Stack**: Phaser 3 (client, `src/`) + Node `ws` WebSocket server (`server/`), built with Vite.
- **Constitution**: `.specify/memory/constitution.md` (v1.0.0). Key MUSTs — single-source
  network protocol (I), server-authoritative multiplayer (II), centralized game-feel
  constants (III), keyboard/touch input parity (IV), deterministic Vite build / YAGNI (V).
- **Active feature**: `specs/001-core-game-baseline/`
  - Plan: `specs/001-core-game-baseline/plan.md`
  - Spec: `specs/001-core-game-baseline/spec.md`
  - Protocol contract: `specs/001-core-game-baseline/contracts/network-protocol.md`
  - Validation guide: `specs/001-core-game-baseline/quickstart.md`
- **Known gap to remediate**: `MESSAGE_TYPES` is duplicated in `src/network/protocol.js` and
  `server/index.js` (violates Constitution I); server should import the canonical module.

For full technical detail, read the current plan above.
<!-- SPECKIT END -->
