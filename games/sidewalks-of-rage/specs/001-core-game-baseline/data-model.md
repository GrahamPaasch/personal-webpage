# Phase 1 Data Model: Core Game Baseline

All state is in-memory (no persistence). This model describes the runtime entities, their
fields, relationships, and state transitions as they exist across the client and the
authoritative server. Field names are conceptual; exact property names live in code.

## Authority legend

- **S** = server-authoritative (clients render server-confirmed values)
- **C** = client-local (each client owns its own; not shared)
- **C→S** = client-owned intent sent to the server, which rebroadcasts

## Entity: Player

Represents one participant. The local player is controlled by input; remote players are
mirrored from server broadcasts.

| Field | Authority | Description |
|-------|-----------|-------------|
| id | S | Unique player id assigned on join (UUID) |
| faction | S | `fauci` or `rogan`; assigned by server (load-balanced) |
| archetype | S | Display character chosen from the faction roster |
| x, y | C→S | Position on the 2.5D plane |
| facing | C→S | `left` or `right`; set by last horizontal movement |
| isAttacking | C→S | True during an attack swing (server clears after a timeout) |
| health | C | Local player health (0–max); not shared |
| score | C | Local session kill score (combo-scaled); not shared |
| comboState | C | Current combo count + last-hit time; not shared |
| isJumping | C | True during a jump (grants contact-damage immunity) |
| isDead | C | True between death and respawn |

**Relationships**: belongs to one Faction; the local Player drives combat against Enemies and
emits kill intents that affect the shared Battle Line.

**State transitions (local player)**:
`alive` → (health ≤ 0) → `dead` → (respawn delay elapses) → `alive` (full health, brief
invincibility). `idle/walking` → (attack input, if not jumping/attacking) → `attacking` →
(attack duration + recovery) → `idle/walking`. `grounded` → (jump input) → `jumping` →
(jump duration) → `grounded`.

## Entity: Faction

A team. Exactly two exist.

| Field | Authority | Description |
|-------|-----------|-------------|
| key | S | `fauci` or `rogan` |
| roster | S | Set of archetype names available to assign |
| color | C | Display tint for team identity |
| pushDirection | — | Conceptual: `fauci` pushes battle line up (toward 100), `rogan` down (toward 0) |

**Relationships**: has many Players; influences Battle Line direction; accumulates Global
Score round wins.

## Entity: Enemy

AI opponent. Client-local (enemy simulation runs on each client).

| Field | Authority | Description |
|-------|-----------|-------------|
| archetype | C | One of: Truther, Blogger, Influencer, Podcaster, Karen |
| speed | C | Movement speed (archetype base × difficulty modifier) |
| health | C | Hit points (archetype base × difficulty modifier) |
| attackDamage | C | Damage dealt to player on contact (× difficulty modifier) |
| x, y, facing | C | Position and facing |
| aiState | C | `idle` / `chasing` / `attacking` / `hit (knockback)` / `dying` |
| target | C | The local player, or null while the player is dead |

**State transitions**: `chasing` ⇄ `idle` (target present/absent) → `attacking` (on contact)
→ `hit` (on taking a hit; knockback window) → `chasing`; any → `dying` (health ≤ 0) → removed.

## Entity: Battle Line

Shared dominance meter. Single instance per server.

| Field | Authority | Description |
|-------|-----------|-------------|
| position | S | Integer 0–100; neutral start = 50 |
| step | S | Fixed amount each kill shifts the line (toward killer's faction) |

**Invariants**: clamped to [0, 100]. Reaching 0 → Rogan round win; reaching 100 → Fauci round
win. Drives the client-side difficulty modifier (further from neutral in the player's favor →
harder enemies).

**Transitions**: `neutral/contested` → (player kill) → shift by `step` toward that faction →
(reaches extreme) → triggers Round end → reset to 50.

## Entity: Round

A unit of competitive play. Single active instance per server.

| Field | Authority | Description |
|-------|-----------|-------------|
| active | S | Whether a round is in progress |
| winner | S | Faction that reached the extreme (on round end) |

**Transitions**: `active` → (battle line hits 0 or 100) → `ended(winner)` → increment Global
Score → reset Battle Line to 50 → `active` (continuous, no pause).

## Entity: Global Score

Cumulative round-win tally. Single instance per server.

| Field | Authority | Description |
|-------|-----------|-------------|
| fauci | S | Count of rounds won by the fauci faction |
| rogan | S | Count of rounds won by the rogan faction |

## Entity: Wave

Client-local progression unit governing enemy pressure.

| Field | Authority | Description |
|-------|-----------|-------------|
| currentWave | C | Increments as enough enemies are defeated |
| enemiesPerWave | C | Threshold to advance; grows with wave number |
| concurrentCap | C | Max simultaneous enemies; grows with wave, capped |

**Transitions**: `wave N` → (defeated count ≥ threshold) → announce + `wave N+1` (higher
threshold, higher spawn rate and cap).

## Entity: Network Message

A typed client⇄server message belonging to **one canonical protocol** (see
`contracts/network-protocol.md`). Shape: `{ type, payload }`. The full message catalog,
direction, and payloads are defined in the contract document — this entity exists to enforce
that the catalog has a single source of truth (FR-026 / Constitution I).
