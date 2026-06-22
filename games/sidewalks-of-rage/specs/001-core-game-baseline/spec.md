# Feature Specification: Core Game Baseline

**Feature Branch**: `001-core-game-baseline`

**Created**: 2026-06-22

**Status**: Draft (reverse-engineered from existing implementation)

**Input**: Reverse-specification of the existing "Sidewalks of Rage" game — a real-time,
browser-based, multiplayer 2.5D beat-'em-up brawler with a satirical "science vs. skeptic"
theme (the `fauci` faction vs. the `rogan` faction). This document captures the current
player-facing behavior as the source of truth so future changes can be spec-driven.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brawl through enemy waves (Priority: P1)

A player opens the game in a browser, starts from the title screen, and controls a Fauci
avatar on a city sidewalk. They move freely on a 2.5D plane, attack with a melee swing,
and defeat continuous waves of approaching enemies while managing their health.

**Why this priority**: This is the irreducible core of the game. Without controllable
movement, attacking, enemies, and health, there is no game. It delivers value entirely on
its own — a single player can enjoy the brawler loop even with no other player connected
and no scoring meta.

**Independent Test**: Launch the game solo, start from the title, and verify the player can
move in all directions, attack, take damage from enemies, defeat enemies, die, and respawn
— a complete playable loop — without relying on multiplayer, rounds, or scoring.

**Acceptance Scenarios**:

1. **Given** the title screen is showing, **When** the player presses Space/Enter or taps,
   **Then** the game transitions into the arena and the player avatar appears.
2. **Given** the player is in the arena, **When** they press a movement input, **Then** the
   avatar moves in that direction on both horizontal and vertical axes and faces the
   direction of horizontal travel.
3. **Given** an enemy is within melee range and in front of the player, **When** the player
   attacks during the active hit window, **Then** the enemy registers a hit with visible
   impact feedback (hit pause, knockback, screen shake) and loses health.
4. **Given** the player's health reaches zero, **When** death is triggered, **Then** a death
   overlay appears and the player respawns at full health after a short delay with brief
   invincibility.
5. **Given** the player is mid-attack or mid-jump, **When** they press movement, **Then**
   movement is suppressed until the action completes.

---

### User Story 2 - Compete in the shared faction battle (Priority: P2)

A player joins a shared arena with other connected players, is assigned to a faction and a
character archetype by the server, and contributes kills that shift a shared battle line.
When the line reaches an extreme, a round is won for a faction and the global score updates.

**Why this priority**: This is the multiplayer meta layer that gives the core loop stakes
and social context. It depends on the core loop (P1) existing but adds the competitive
"why" — collective progress toward a faction win.

**Independent Test**: Connect two clients to the same server, confirm each is assigned a
faction and sees the other player move/attack, then score kills and verify the shared
battle line moves, a round ends at an extreme, and the global faction score increments for
all connected clients.

**Acceptance Scenarios**:

1. **Given** a player enters the arena, **When** the connection is established, **Then** the
   server assigns them a faction and an archetype and informs them of the current global
   score and existing players.
2. **Given** multiple players are connected, **When** one player moves or attacks, **Then**
   all other connected players see that player's updated position/facing and attack.
3. **Given** the battle line is at a neutral midpoint, **When** a player records an enemy
   kill, **Then** the battle line shifts a fixed step toward that player's faction for all
   clients.
4. **Given** the battle line reaches an extreme (fully one faction), **When** the round-end
   condition triggers, **Then** that faction's global score increments, all clients see a
   round-end banner, and the battle line resets to neutral for a new round.
5. **Given** a connected player disconnects, **When** the server detects the drop, **Then**
   all remaining clients remove that player and see updated faction counts.

---

### User Story 3 - Pursue mastery via combos, waves, and difficulty (Priority: P3)

A skilled player chains hits into combos for bonus scoring and streak callouts, progresses
through escalating waves, and experiences difficulty that adapts to how their faction is
doing in the battle.

**Why this priority**: This is the depth/replayability layer. It enriches the core loop but
the game is fully playable without it. It rewards skill and keeps sessions varied.

**Independent Test**: In a solo session, land consecutive hits within the combo window and
verify a combo counter, streak messages, and score multiplier appear; play long enough to
trigger a wave advance; and verify enemy toughness/spawn rate changes as the battle line
shifts.

**Acceptance Scenarios**:

1. **Given** the player lands a hit, **When** they land another hit within the combo window,
   **Then** the combo count increases and, past a threshold, a combo banner is shown.
2. **Given** an active combo, **When** the player scores a kill, **Then** the score increases
   by a combo-scaled amount and a streak message may appear for high combos.
3. **Given** the player takes damage or dies, **When** that happens, **Then** the current
   combo resets.
4. **Given** enough enemies have been defeated for the current wave, **When** the wave
   threshold is met, **Then** a new wave is announced and subsequent waves spawn more enemies
   more frequently.
5. **Given** the player's faction is winning the battle line, **When** enemies spawn, **Then**
   enemies are tougher/faster and spawn more often; when losing, enemies are easier and spawn
   less often.

---

### Edge Cases

- **Player dies while enemies are pursuing**: enemies lose their target and idle until the
  player respawns, at which point pursuit resumes.
- **Player jumps over an enemy**: contact during a jump does not deal damage to the player.
- **Backward attack**: an attack does not hit a target behind the player's facing direction
  (beyond a small tolerance).
- **Same enemy hit twice in one swing**: a single attack swing cannot damage the same enemy
  more than once.
- **Player joins mid-round**: the joining player receives the current battle-line state,
  global score, and existing roster, and is faction-balanced into the ongoing round.
- **Round ends with no pause**: a new round begins immediately after a round-end banner;
  the battle line returns to neutral.
- **Touch vs. non-touch device**: on-screen controls appear only on touch-capable devices;
  on others the screen is unobstructed and keyboard is used.
- **Connection cannot be established / drops mid-session**: the single-player brawl loop
  (P1) must remain playable; multiplayer meta degrades gracefully. *(See Assumptions.)*

## Requirements *(mandatory)*

### Functional Requirements

#### Session & Entry
- **FR-001**: The game MUST present a title screen and begin play when the player presses
  Space, Enter, or taps/clicks.
- **FR-002**: On entering the arena, the client MUST attempt to join the shared session and
  the server MUST assign the player a faction and a character archetype.

#### Movement & Controls
- **FR-003**: Players MUST be able to move the avatar on both a horizontal and a vertical
  axis (2.5D lanes), with vertical movement slower than horizontal.
- **FR-004**: The avatar MUST face the direction of its most recent horizontal movement and
  retain that facing when stationary.
- **FR-005**: Players MUST be able to perform a brief jump that prevents enemy contact damage
  for its duration.
- **FR-006**: Players MUST be able to perform a melee attack that has a startup, an active
  hit window, a short forward lunge, and a recovery cooldown; movement and a second attack
  MUST be suppressed during an attack.
- **FR-007**: Every player action (move, jump, attack) MUST be operable via both keyboard and
  on-screen touch controls, feeding a single unified input state (per Constitution IV).
- **FR-008**: On-screen touch controls MUST be revealed only on touch-capable devices and
  hidden otherwise.

#### Combat
- **FR-009**: A melee hit MUST register only when the target is within lane-depth tolerance,
  within forward reach, and in front of the attacker's facing direction.
- **FR-010**: A single attack swing MUST NOT damage the same enemy more than once.
- **FR-011**: A successful hit MUST produce impact feedback: hit pause (hitstop), target
  knockback, screen shake, a damage number, and hit particles.
- **FR-012**: Enemies MUST deal damage to the player on contact, subject to a per-hit cooldown,
  and MUST NOT damage a jumping player or a player who is landing a valid counter-attack.
- **FR-013**: The player MUST have a finite health pool, take knockback and damage when hit,
  die at zero health, and respawn at full health after a short delay with temporary
  invincibility.

#### Enemies & Waves
- **FR-014**: Enemies MUST spawn from screen edges, pursue the player, and play distinct
  movement/attack/hit/death states.
- **FR-015**: There MUST be multiple enemy archetypes that differ in speed, health, and
  attack damage.
- **FR-016**: Enemies MUST occasionally display short themed speech callouts.
- **FR-017**: The number of concurrent enemies and the spawn rate MUST escalate as the player
  advances through waves, subject to a maximum concurrent cap.
- **FR-018**: Enemy difficulty (toughness, speed, attack rate, spawn rate, concurrent cap)
  MUST adapt to the battle-line position: harder when the player's faction is ahead, easier
  when behind.

#### Combo & Scoring
- **FR-019**: The game MUST track consecutive hits landed within a combo time window, display
  a combo indicator past a threshold, and reset the combo when the player takes damage or dies.
- **FR-020**: Kills MUST award a local session score scaled by the current combo, and high
  combos MUST trigger themed streak messages.

#### Multiplayer & Authority
- **FR-021**: The server MUST be the single authority over the player roster, faction
  assignment, character archetype, round state, battle-line position, and cumulative global
  score (per Constitution II).
- **FR-022**: Clients MUST send only intent — join, periodic position/facing updates, attack,
  and kill notifications — and MUST render shared state as confirmed by the server.
- **FR-023**: Each enemy kill reported by a player MUST shift the shared battle line one fixed
  step toward that player's faction, clamped to the valid range.
- **FR-024**: When the battle line reaches either extreme, the server MUST end the round,
  increment the winning faction's global score, broadcast the result, and reset the battle
  line to neutral for a continuous next round.
- **FR-025**: All connected clients MUST be kept consistent on player join, player leave,
  movement, attack, battle-line/round state, and global score.
- **FR-026**: The network message contract MUST be defined once as a single canonical
  protocol shared by client and server (per Constitution I). *(Current state: the message-type
  table is duplicated across client and server; see Assumptions / known gap.)*

#### Presentation
- **FR-027**: The arena MUST render a city-skyline environment (sky, layered buildings,
  billboards, storefronts, sidewalk).
- **FR-028**: The HUD MUST display the player's health, local session score, global faction
  score, the battle-line state with per-faction player counts, wave announcements, combo and
  streak text, kill messages, a death overlay, and round-end banners.

### Key Entities *(include if feature involves data)*

- **Player**: A participant avatar. Attributes: identity, faction, archetype, position,
  facing, health, attacking state, local score, combo state. Local player is controlled;
  remote players are mirrored from server state.
- **Faction**: One of two teams (`fauci`, `rogan`). Determines team color, roster of
  archetypes, and which direction a kill pushes the battle line.
- **Enemy**: An AI opponent. Attributes: archetype, speed, health, attack damage, position,
  facing, AI state (idle/chase/attack/hit/dying).
- **Battle Line**: A shared 0–100 value (neutral 50) representing faction dominance; extremes
  end a round.
- **Round**: A unit of competitive play that ends when the battle line reaches an extreme;
  rounds are continuous.
- **Global Score**: Cumulative count of round wins per faction across the session.
- **Network Message**: A typed client⇄server message belonging to one canonical protocol
  contract (join, id, joined, left, game-state, move, attack, kill, faction-assigned,
  round-state, round-end, global-score).
- **Wave**: A progression unit that raises enemy count and spawn frequency as it increases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new player can go from the title screen to actively fighting enemies in under
  10 seconds with no instructions beyond the on-screen prompts.
- **SC-002**: 100% of player actions (move on both axes, jump, attack) are performable using
  keyboard alone and using touch controls alone, with identical in-game effect.
- **SC-003**: In a session with at least two connected players, a remote player's movement
  and attacks are reflected on other clients within a fraction of a second under normal
  conditions, with no client showing a divergent battle-line or global-score value.
- **SC-004**: Every enemy kill moves the shared battle line by exactly one fixed step toward
  the killer's faction, and a round resolves to a winner precisely when the line reaches an
  extreme — verifiable as a fixed number of net kills from neutral to victory.
- **SC-005**: A player who dies always returns to play at full health after the respawn delay;
  the game has no terminal "game over" state and play can continue indefinitely.
- **SC-006**: Defining the protocol message set in exactly one place produces no behavioral
  change for players, and client and server cannot disagree on message names (single source
  of truth verified).
- **SC-007**: Sustained combos visibly increase scoring per kill and surface streak feedback,
  and combos always reset when the player is damaged or dies.

## Assumptions

- **Existing implementation is the source of truth**: Where this spec and the current code
  differ in detail, the observed code behavior is authoritative; this document records intent
  derived from it.
- **Known protocol gap (Constitution I)**: The message-type table is presently duplicated
  between client and server. FR-026 states the intended single-source-of-truth contract; the
  remediation itself is expected to be planned/tasked, not assumed already done.
- **Player is always controllable as the science (`fauci`) avatar locally** while faction
  assignment governs team color, scoring direction, and difficulty bias.
- **Continuous play**: There is intentionally no hard lose/game-over condition; rounds and
  waves continue indefinitely.
- **Static environment**: The city background is decorative and non-scrolling; it does not
  affect gameplay collisions.
- **Graceful degradation without a server**: The single-player brawl loop should remain
  playable if the multiplayer connection is unavailable; the precise fallback behavior is a
  candidate for clarification during planning.
- **Specific tuning values** (speeds, ranges, timings, step sizes, caps) live in the code as
  centralized constants (Constitution III) and are treated as implementation detail rather
  than fixed spec contract, except where a requirement names a qualitative relationship
  (e.g., vertical slower than horizontal).
