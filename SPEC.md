# Arena Brawl — Two-Player 3D Fighting Game

## 0. Instructions for Implementing Agent

**You are building this game from scratch. Follow these rules strictly.**

### Workflow

1. **Implement in phase order** (Section 15). Complete Phase 1 fully before starting Phase 2, and so on.
2. **Verify after each phase** by running the verification steps listed in that phase. Do NOT proceed to the next phase if verification fails — fix the issue first.
3. **Start in solo mode** (`npm run dev`) for all testing. You only need one browser tab to verify most functionality. Two-tab testing is only needed for Phase 5+ when verifying lobby/matchmaking.
4. **Read the full spec before writing any code.** Many sections reference each other. Understanding the whole picture prevents rework.
5. **When in doubt, refer to the constants** in Section 12.1. Every numeric value you need is defined there. Do not invent your own values.

### Common Pitfalls to Avoid

- **Do NOT duplicate shared code.** `shared/Physics.js`, `shared/Arena.js`, and `shared/constants.js` are imported by both server and client. See Section 12 for how.
- **Do NOT use `setInterval`** for the server game loop. Use the `setTimeout` accumulator pattern in Section 7.6.
- **Do NOT forget MIME types** when serving static files. Without `Content-Type: application/javascript`, ES module imports fail silently. See Section 14.
- **Do NOT process only the latest input per tick.** Edge-triggered inputs (jump, attack) can be lost. Scan ALL queued inputs. See Section 7.6.
- **Do NOT auto-aim the punch.** The hitbox fires in the character's facing direction, which is their movement direction. See Section 8.2.
- **Do NOT let `JSON.parse` crash the server.** Always wrap in try-catch. See Section 9.5.

### Verification Strategy

After each phase, run `npm run dev`, open a browser to `http://localhost:3000`, and check the phase's verification criteria. If you have access to a headless browser or can run the server and check for startup errors, do that. At minimum, ensure `node server/index.js --solo` starts without throwing.

---

## 1. Overview

A real-time two-player browser-based 3D fighting game. Two mario-style humanoid characters fight inside a polygon-shaped arena. Players can run, jump, attack, block, and parry. The server is authoritative to prevent cheating. The frontend uses Three.js for 3D rendering. The backend uses Node.js with WebSockets.

---

## 2. Architecture

### 2.1 High-Level Diagram

```
[Browser A] <──WebSocket──> [Node.js Server] <──WebSocket──> [Browser B]
 (Three.js)                  (Authoritative)                  (Three.js)
```

### 2.2 Server (Authoritative)

- **Runtime**: Node.js (ES modules, no framework needed beyond `ws`)
- **Role**: The server owns the game state. It receives player inputs, simulates physics/collisions, resolves combat, and broadcasts authoritative state to both clients.
- **Tick rate**: 60 Hz server simulation loop (fixed timestep: 16.67ms)
- **Network send rate**: 20 Hz (every 3rd tick, send state snapshot to clients)

### 2.3 Client (Renderer + Input Collector)

- **Renderer**: Three.js (WebGLRenderer)
- **Role**: Sends raw inputs to the server. Receives authoritative state. Renders the scene. Performs client-side prediction and interpolation for smooth visuals.
- **Frame rate**: requestAnimationFrame (uncapped, typically 60 Hz)

### 2.4 Networking Protocol

- **Transport**: WebSocket (binary or JSON — use JSON for v1 simplicity)
- **Client → Server messages**:
  - `{ type: "input", seq: number, keys: InputState }`
  - `{ type: "playAgain" }`
- **Server → Client messages**:
  - `{ type: "state", tick: number, lastProcessedSeq: number, players: PlayerState[], timestamp: number }`
  - `{ type: "event", event: GameEvent }`
  - `{ type: "lobby", status: string, playerId: number }`
- **GameEvent kinds**:
  - `{ kind: "countdown", value: number }`
  - `{ kind: "roundStart" }`
  - `{ kind: "roundEnd", winnerId: number, scores: number[] }`
  - `{ kind: "matchEnd", winnerId: number, scores: number[] }`
  - `{ kind: "hit", attackerId: number, targetId: number, damage: number, attackType: "punch" | "stomp" }`
  - `{ kind: "playAgainWaiting" }` — sent when one player has clicked Play Again
  - `{ kind: "disconnect", playerId: number }`

### 2.5 Input State Shape

```typescript
interface InputState {
  left: boolean;
  right: boolean;
  forward: boolean;
  backward: boolean;
  jump: boolean;    // edge-triggered (true only on the frame the key goes down)
  attack: boolean;  // edge-triggered
  block: boolean;   // held — true while block key/button is held
  cameraYaw: number; // radians — the horizontal angle the player is looking
}
```

Movement directions (forward/backward/left/right) are relative to `cameraYaw`, so the server must resolve them into world-space vectors using the submitted yaw.

---

## 3. Lobby & Match Flow

### 3.1 Connection & Matchmaking

1. Client opens WebSocket to server.
2. Server assigns a `playerId` (0 or 1) and sends `{ type: "lobby", status: "waiting", playerId }`.
3. When two players are connected, server sends `{ type: "lobby", status: "countdown", playerId }` to both.
4. A 3-second countdown begins (server-driven). Server sends `{ type: "event", event: { kind: "countdown", value: 3 } }`, then 2, then 1.
5. Server sends `{ type: "event", event: { kind: "roundStart" } }` and begins accepting inputs.

### 3.1.1 Single-Player / Dev Mode

For development and testing, the server supports a **solo mode** so a single browser tab can play immediately without waiting for a second player:

- **Activation**: Start the server with `npm run dev` (or `node server/index.js --solo`). This sets a `SOLO_MODE` flag.
- **Behavior**: When the first client connects in solo mode, the server immediately creates a game session. Player 2 (the **dummy**) is a server-side bot that spawns at the normal Player 2 position and **does nothing** — no movement, no attacks. It simply stands idle at its spawn point with full HP.
- The dummy player still has full HP and can be hit, knocked back, and KO'd normally. It just never sends any inputs.
- The game flow (countdown, rounds, timer, match end) runs identically to a two-player game.
- This allows testing movement, camera, combat, HUD, and round flow with a single browser tab.
- **No AI**: The dummy does not dodge, attack, or react. It is a stationary punching bag.

Add to `package.json` scripts:
```json
"dev": "node server/index.js --solo"
```

### 3.2 Round Structure

- A match consists of **3 rounds** (best of 3).
- Each round ends when one player's HP reaches 0.
- Between rounds: 2-second pause, then a new countdown.
- When a player wins 2 rounds, the match ends with `{ type: "event", event: { kind: "matchEnd", winnerId } }`.

### 3.3 Disconnection & Connection Handling

- If a player disconnects mid-match, the other player wins by default. The server sends `{ type: "event", event: { kind: "disconnect", playerId } }` and then `{ type: "event", event: { kind: "matchEnd", winnerId } }`.
- Server cleans up the game session entirely. Both slots reopen.
- In solo mode, the dummy never disconnects. If the real player disconnects, the session is simply destroyed.
- **Third+ connections**: The server supports only one game session at a time. If a third client connects while a game is in progress, the server sends `{ type: "lobby", status: "full" }` and closes the WebSocket. The client should display "Game in progress — try again later."
- **Heartbeat**: The server sends a WebSocket ping every 5 seconds. If no pong is received within 10 seconds, the connection is considered dead and treated as a disconnection. The `ws` library handles ping/pong natively.
- **Reconnection**: No reconnection support in v1. A dropped connection ends the match.

### 3.4 Play Again Flow

After a match ends:
1. Both clients show the "Match End" screen with a "Play Again" button.
2. When a player clicks "Play Again", the client sends `{ type: "playAgain" }`.
3. If only one player has clicked, the server sends `{ type: "event", event: { kind: "playAgainWaiting" } }` to that player. The client shows "Waiting for opponent..."
4. When both players have clicked "Play Again", the server resets the game session (new match, fresh HP, round 1) and starts a new countdown.
5. If a player disconnects instead of clicking "Play Again", the other player is returned to the waiting state (as if they just connected to an empty lobby).

---

## 4. Arena

### 4.1 Shape & Dimensions

- A regular **octagon** (8-sided polygon) viewed from above.
- The arena is a flat floor with walls around the perimeter.
- **Inscribed circle radius**: 20 units (the distance from center to the midpoint of each wall).
- **Wall height**: 4 units. Players cannot leave the arena.
- **Floor**: flat at Y = 0.

### 4.2 Visual Style

- **Floor**: A tiled stone/concrete texture. Use a repeating grid pattern if no texture loading — a checkerboard of two slightly different grey tones works. Can also be a flat color (#555555) with a grid overlay for v1.
- **Walls**: Slightly darker than floor (#333333), with a subtle border/edge highlight at the top.
- **Sky/Background**: A solid dark gradient or skybox. For v1, use `scene.background = new THREE.Color(0x1a1a2e)`.
- **Lighting**:
  - One `AmbientLight` (intensity 0.4, color white).
  - One `DirectionalLight` from above-and-slightly-behind-camera (intensity 0.8, casting shadows).

### 4.3 Geometry Construction

The octagon vertices are computed as:
```javascript
for (let i = 0; i < 8; i++) {
  const angle = (Math.PI * 2 * i) / 8;
  const x = radius * Math.cos(angle);
  const z = radius * Math.sin(angle);
}
```

The floor is a `ShapeGeometry` from these vertices extruded to a thin slab. The walls are 8 individual `PlaneGeometry` or `BoxGeometry` segments placed along each edge.

---

## 5. Characters

### 5.1 Visual Design (Procedural — No External Models)

Each character is built from primitive Three.js geometries to resemble a simple humanoid (mario-like proportions: big head, short body, stubby limbs).

#### Body Part Hierarchy (all dimensions in world units)

```
Character (Group)
├── Body (BoxGeometry: 0.6 x 0.8 x 0.4)     — torso
├── Head (SphereGeometry: radius 0.3)          — sits on top of body
├── Left Arm (BoxGeometry: 0.2 x 0.6 x 0.2)   — attached to left side of body
├── Right Arm (BoxGeometry: 0.2 x 0.6 x 0.2)  — attached to right side of body
├── Left Leg (BoxGeometry: 0.2 x 0.5 x 0.2)   — below body, left
└── Right Leg (BoxGeometry: 0.2 x 0.5 x 0.2)  — below body, right
```

- **Total character height**: ~2.0 units (legs 0.5 + body 0.8 + head 0.6 diameter + gap).
- **Character collision capsule**: radius 0.4, height 2.0, centered on the character.
- **Player 1 color**: Red (`0xe74c3c`)
- **Player 2 color**: Blue (`0x3498db`)
- Head is a lighter shade of each color. Limbs are slightly darker.
- Use `MeshLambertMaterial` (responds to lighting, cheap to render).

### 5.2 Animations (Procedural — No Animation Files)

All animations are done by rotating/translating body part meshes each frame in code:

| State | Animation |
|-------|-----------|
| **Idle** | Subtle body bob: body Y oscillates ±0.02 units at 2 Hz. Arms hang at sides with slight sway. |
| **Running** | Legs swing forward/backward alternately (rotate around X axis, ±30deg at a rate proportional to speed). Arms swing opposite to legs. Body tilts forward slightly (5deg). |
| **Jumping** | Legs tuck up (rotate knees up 45deg). Arms go up slightly. |
| **Falling** | Legs extend down, arms go out to sides. |
| **Attacking (punch)** | Right arm swings forward rapidly (0 to 90deg in 0.1s, hold 0.05s, return in 0.15s). Total: 0.3s. |
| **Stomping (airborne attack)** | Both legs extend down, body tucks, slight downward acceleration visual. |
| **Blocking** | Arms crossed in front of body (both arms rotate inward ~60deg). Body leans back slightly (5deg). Material tint shifts lighter/whiter. |
| **Parry flash** | On successful parry: brief white emissive flash on the blocker (0.15s). Small spark effect (optional). |
| **Hit/Stagger** | Body leans back 20deg, brief red flash (emissive on material for 0.1s), stumble backward. |
| **KO** | Character falls flat (rotate 90deg around X over 0.5s), lies on ground. |

### 5.3 Eyes & Face (Optional v1 Polish)

- Two small white spheres on the front of the head for eyes.
- Two tiny black spheres inside them for pupils.
- This is optional but strongly recommended as it adds a lot of character.

---

## 6. Camera

### 6.1 Camera Type

- Each client has its own **third-person chase camera** behind their character.
- `PerspectiveCamera`, FOV 60, near 0.1, far 100.

### 6.2 Camera Controls

- **Mouse movement** (with pointer lock) controls the camera yaw (horizontal) and pitch (vertical).
- The camera orbits around the player's character.
- **Yaw**: Full 360-degree rotation. No limits.
- **Pitch**: Clamped between -30deg and +60deg. Pitch = 0 is horizontal. Positive pitch looks down (camera goes higher). Negative pitch looks up (camera goes lower).
- **Camera distance**: 5 units from the character, adjustable by scroll wheel (min 2, max 10).
- **Camera position**: Calculated as:
  ```
  camX = player.x - distance * sin(yaw) * cos(pitch)
  camY = player.y + characterHeight + distance * sin(pitch)
  camZ = player.z - distance * cos(yaw) * cos(pitch)
  ```
- Camera always looks at `(player.x, player.y + characterHeight * 0.75, player.z)`.
- **Wall collision**: If a raycast from the look-at point to the ideal camera position hits arena geometry, move the camera forward to just in front of the hit point (prevent camera going through walls).

### 6.3 Pointer Lock

- On game start (after countdown), request pointer lock on the canvas.
- Show a "Click to Play" overlay if pointer lock is not active.
- ESC exits pointer lock; show a pause overlay with "Click to Resume".

---

## 7. Player Movement & Physics

All physics simulation runs on the **server**. The client performs identical simulation for prediction.

### 7.1 Movement

- **Move speed**: 8 units/second.
- **Movement is relative to camera yaw**: Forward = direction the camera faces (projected onto XZ plane). The server receives `cameraYaw` with each input and resolves directions.
- **Movement vector**: Normalize the combined input direction, multiply by move speed.
- **Acceleration model**: Instant acceleration (no ramp-up). When keys are released, the player's *intentional* XZ velocity drops to 0. However, *knockback* velocity is separate and decays via friction (see Section 7.3). The final XZ velocity is `intentional + knockback`.
- **Character facing**: The character mesh rotates to face the direction of movement (smoothly interpolated, ~10x lerp per second). If the player is stationary, they keep their last facing direction. The character does NOT auto-face the opponent.

### 7.2 Jumping

- **Jump velocity**: 10 units/second upward (initial Y velocity).
- **Gravity**: -25 units/second² (stronger than real gravity for snappy feel).
- **Max jump height**: ~2.0 units.
- **Air control**: Player can steer in the air at 60% of ground move speed.
- **No double jump**: Only one jump allowed; must land before jumping again.
- **Landing**: When Y position ≤ 0 and Y velocity < 0, snap to Y = 0, set Y velocity = 0, set `grounded = true`.

### 7.3 Knockback Velocity & Friction

When a player is hit, they receive a knockback impulse (see Section 8). This is stored as a separate `knockbackVelocity` vector (XZ only). Each tick, knockback velocity decays:

```
knockbackVelocityX *= (1 - KNOCKBACK_FRICTION * dt)
knockbackVelocityZ *= (1 - KNOCKBACK_FRICTION * dt)
```

Where `KNOCKBACK_FRICTION = 8.0` (per second). This means knockback decays to near-zero in ~0.5s. The player's actual XZ position change each tick is `(intentionalVelocity + knockbackVelocity) * dt`. During hitstun the player cannot provide intentional velocity, but knockback still moves them.

### 7.4 Player State Machine

The player is always in exactly one state. Valid transitions:

```
idle ──(move keys)──> running
idle ──(jump)──> jumping
idle ──(attack)──> attacking
idle ──(block)──> blocking
running ──(no move keys)──> idle
running ──(jump)──> jumping
running ──(attack)──> attacking
running ──(block)──> blocking
jumping ──(velocityY < 0)──> falling
jumping ──(attack)──> stomping
falling ──(land)──> idle
falling ──(attack)──> stomping
stomping ──(land, hit)──> jumping  (bounce)
stomping ──(land, miss)──> stompLag
stompLag ──(timer expires)──> idle
attacking ──(timer expires)──> idle (or running if keys held)
blocking ──(release block)──> idle
blocking ──(hit during first 0.15s)──> parry (see Section 8.5)
hitstun ──(timer expires)──> idle (or falling if airborne)
ko ──(round reset)──> idle
```

A player **cannot** jump, attack, or block while in `hitstun`, `attacking`, `stomping`, `stompLag`, or `ko` states. Movement at reduced speed (30%) is allowed during `attacking` recovery phase only.

### 7.5 Collision Detection

#### Player vs. Arena Walls
- Treat the player as a circle (radius 0.4) on the XZ plane.
- For each wall segment (line from vertex A to vertex B), compute the nearest point on the segment to the player center. If distance < player radius, push the player out along the normal.

#### Player vs. Player
- Two circles (radius 0.4 each) on the XZ plane.
- If distance between centers < 0.8, push both apart equally along the axis between them.
- This is a **soft collision**: players can bump each other but not overlap.

### 7.6 Server Simulation Loop

```
Every tick (16.67ms):
  1. Process queued inputs for each player.
     - For held keys (movement, block): use the latest input state.
     - For edge-triggered keys (jump, attack): scan ALL queued inputs since last
       tick; if ANY input had jump=true or attack=true, fire that action.
     - Store the latest seq number processed per player.
  2. Update state machine timers (attack, hitstun, i-frames, stomp lag).
  3. Compute intentional XZ velocity from input + cameraYaw (0 if in hitstun/ko/stompLag).
  4. Decay knockback velocity via friction.
  5. Apply XZ movement: positionX += (intentionalVelX + knockbackVelX) * dt.
     Same for Z.
  6. Apply gravity: velocityY += GRAVITY * dt.
  7. Apply Y movement: positionY += velocityY * dt.
  8. Ground clamp: if positionY <= 0 and velocityY < 0:
     positionY = 0, velocityY = 0, grounded = true.
  9. Player-vs-wall collision resolution.
  10. Player-vs-player collision resolution.
  11. Process attacks and hit detection (see Section 8).
  12. Check HP for round end.
  13. Every 3rd tick: broadcast state to clients (include lastProcessedSeq per player).
```

**Timer implementation**: Do NOT use `setInterval` for the tick loop — it is imprecise on Windows (~15.6ms resolution). Instead, use a `setTimeout`-based recursive loop with `performance.now()` and an accumulator pattern:

```javascript
let lastTime = performance.now();
let accumulator = 0;
function loop() {
  const now = performance.now();
  accumulator += now - lastTime;
  lastTime = now;
  while (accumulator >= TICK_DURATION) {
    tick();
    accumulator -= TICK_DURATION;
  }
  setTimeout(loop, 1); // 1ms setTimeout for tight loop
}
loop();
```

---

## 8. Combat System

### 8.1 Health

- Each player starts each round with **100 HP**.
- HP bar is displayed on the HUD (see section 10).

### 8.2 Attack: Punch

- **Activation**: Press attack button while grounded and not in another action (see state machine, Section 7.4).
- **Windup**: 0.05s. Player cannot move during windup. Hitbox is not active.
- **Active frames**: 0.1s. Hitbox is live. Player cannot move.
- **Recovery**: 0.15s. Player can move at 30% speed. Cannot attack, jump, or block.
- **Total duration**: 0.3s. Player cannot start another attack until recovery ends.
- **Hitbox**: A sphere (radius 0.5) positioned 0.8 units in front of the player's center **in the direction the character is facing** (i.e., the character's `yaw`), at chest height (Y = 0.8). The punch does NOT auto-aim at the opponent — the player must face the right direction.
- **Damage**: 15 HP.
- **Knockback**: The hit player receives a knockback impulse of 6 units/second away from the attacker (XZ plane, direction = vector from attacker to target) + 3 units/second upward (Y velocity).
- **Hit stun**: The hit player enters `hitstun` state for 0.3s (cannot move, jump, attack, or block).

### 8.3 Attack: Stomp (Aerial Attack)

- **Activation**: Press attack button while airborne (not grounded) and not already stomping.
- **Effect**: Player's downward velocity is immediately set to `STOMP_VELOCITY` (-15 units/second, fast drop).
- **Hitbox**: A sphere (radius 0.6) centered at the player's feet (Y = player.positionY).
- **Active**: The stomp hitbox is active from activation until the player lands. It can only hit once per stomp (after hitting, the hitbox deactivates but the fast-fall continues).
- **Damage**: 20 HP.
- **Knockback**: The hit player receives a knockback impulse of 8 units/second outward (XZ), and their Y velocity is set to 0 (they are pressed flat to the ground if airborne, or stay grounded).
- **Hit stun**: 0.5s.
- **Self-bounce**: If the stomp connects, the stomping player bounces upward (Y velocity = `STOMP_BOUNCE_VELOCITY` = 6 units/second). This allows follow-up attacks but NOT an infinite chain (see i-frames below).
- **Miss**: If the stomp misses (player lands without hitting anyone), there is a 0.4s landing lag (`stompLag` state — player cannot act).

### 8.4 Damage Immunity (I-Frames)

- After being hit, a player has **0.8s of invincibility** (i-frames). They flash/blink during this period (toggle visibility every 0.05s on the client).
- The stomp bounce gives ~0.48s of air time (bounce velocity 6, gravity -25: air time = 2 * 6/25 = 0.48s). Since i-frames last 0.8s, the victim is still invincible when the stomper lands, **preventing infinite stomp chains**.

### 8.5 Block & Parry

#### Block
- **Activation**: Hold the block button (right mouse button). Player enters `blocking` state.
- **Restrictions while blocking**: Player cannot move, jump, or attack. They stand in place.
- **Effect**: While blocking, incoming damage is reduced by **50%**. Knockback is reduced by 75%. The player still enters a brief `hitstun` of 0.15s (half the normal hitstun) — this is "block stun."
- **Block animation**: Arms crossed in front of body. A subtle shield-like color tint (lighter/whiter shade of their color) on the character during block.

#### Parry (Perfect Block)
- **Activation**: If a block is active for **less than 0.15s** (`PARRY_WINDOW`) when a hit lands, it counts as a **parry** instead of a regular block.
- **Effect**: The attack is completely negated — **0 damage, 0 knockback**. The **attacker** is stunned instead: they enter `hitstun` for 0.4s (`PARRY_PUNISH_STUN`). The attacker's current attack animation is cancelled.
- **Visual feedback**: A brief white flash/spark effect at the point of contact. A distinct sound cue (if sound is implemented).
- **Risk/reward**: Holding block is safe but you can't move. Parrying is powerful but requires precise timing — if you block too early, you just get a regular (50% reduced) block. If you time it wrong and don't block at all, you take full damage.

### 8.6 Ring-Out Bonus

- Not applicable: arena has walls. Players cannot fall out. (Could be added later by removing walls.)

---

## 9. Networking Details

### 9.1 Client-Side Prediction & Reconciliation

The client runs the same physics code as the server (imported from `shared/Physics.js`):

1. When the player presses a key, immediately simulate the result locally (optimistic update).
2. Send the input to the server with a monotonically increasing sequence number (`seq`).
3. The client keeps a buffer of all unacknowledged inputs: `{ seq, inputState, predictedPosition }`.
4. When an authoritative state arrives from the server, it includes `lastProcessedSeq` — the most recent input seq the server applied for this player.
5. **Reconciliation**: Discard all buffered inputs with `seq <= lastProcessedSeq`. Start from the server's authoritative position. Re-simulate all remaining buffered inputs (those the server hasn't processed yet) to produce a new predicted position.
6. If the reconciled position is close to the current rendered position (< `LERP_THRESHOLD` = 0.1 units), smoothly interpolate toward it (lerp at 10% per frame).
7. If the difference is large (> `SNAP_THRESHOLD` = 2 units — e.g., after a collision correction), snap to the reconciled position immediately.

### 9.2 Opponent Interpolation

The opponent's position is not predicted — it is interpolated between the two most recent server snapshots:
1. Buffer at least 2 snapshots.
2. Render the opponent at a position interpolated between snapshot N-1 and snapshot N, based on elapsed time since snapshot N-1 arrived.
3. This introduces ~50ms of visual latency for the opponent, which is acceptable.

### 9.3 Server State Snapshot Shape

```typescript
interface PlayerState {
  id: number;           // 0 or 1
  x: number;
  y: number;
  z: number;
  yaw: number;          // character facing direction (radians, direction of movement)
  velocityY: number;
  knockbackX: number;   // current knockback velocity
  knockbackZ: number;
  hp: number;
  grounded: boolean;
  state: "idle" | "running" | "jumping" | "falling" | "attacking" | "stomping" | "stompLag" | "blocking" | "hitstun" | "ko";
  stateTimer: number;   // remaining time in current state (0 if indefinite, e.g., idle/running)
  iframesRemaining: number; // remaining i-frame time (0 if not invincible)
}
```

### 9.4 Latency Considerations

- The server timestamps each state snapshot with `performance.now()`. This is primarily useful for the client to calculate interpolation timing (Section 9.2), not for cross-machine clock sync.
- For v1, no lag compensation for hit detection — the server uses current positions. This means high-latency players will need to "lead" their attacks slightly. Acceptable for a LAN/local network prototype.

### 9.5 Message Validation & Robustness

- **JSON parsing**: All `ws.on('message')` handlers MUST wrap `JSON.parse()` in a try-catch. Malformed messages are silently ignored (do not crash the server).
- **Input validation**: Verify that incoming input messages have the expected fields and types. Ignore messages with missing or invalid fields. Do not trust `cameraYaw` to be a finite number — clamp or reject `NaN`/`Infinity`.
- **Input queue limit**: The server buffers incoming inputs per player between ticks. If more than `MAX_INPUT_QUEUE` (10) inputs are queued for a single player in one tick, discard the oldest inputs and keep only the most recent 10. This prevents lag-spike teleportation.
- **Rate limiting**: No explicit rate limiting in v1 (the input queue limit serves as a soft cap). If a client floods the server, the excess inputs are simply dropped.

---

## 10. HUD & UI

All UI is rendered as HTML/CSS overlays on top of the Three.js canvas. Do NOT use Three.js sprites for HUD elements.

### 10.1 In-Game HUD

```
┌──────────────────────────────────────────┐
│ [P1 HP BAR ██████████░░] [P2 HP BAR ███████████░] │
│  Player 1: 70 HP              Player 2: 85 HP     │
│                                                     │
│                                                     │
│                    (game view)                      │
│                                                     │
│                                                     │
│              Round 1    0:47                        │
└──────────────────────────────────────────┘
```

- **HP Bars**: Positioned at top-left (P1, red) and top-right (P2, blue). Width: 30% of screen each. Height: 20px. Background: dark grey. Fill: player color. Animate fill width smoothly when HP changes.
- **Round indicator**: Centered below HP bars. Shows "Round 1", "Round 2", "Round 3". Small dots or icons indicating rounds won.
- **Timer**: Centered. Counts down from **90 seconds** per round. If timer expires, the player with more HP wins the round. If tied, the round is a draw and doesn't count (redo). After `MAX_DRAWS` (3) consecutive draws, the next draw is decided by sudden death: both players are set to 1 HP and the round restarts with 30 seconds. The round counter display stays the same during a redo.

### 10.2 Screens

| Screen | Trigger | Content |
|--------|---------|---------|
| **Title** | Page load | "ARENA BRAWL" title, "Connecting..." status |
| **Waiting** | Connected, no opponent | "Waiting for opponent..." with animated dots |
| **Countdown** | Both connected | Large "3", "2", "1", "FIGHT!" centered on screen |
| **Pause** | Pointer lock lost | "PAUSED — Click to Resume" |
| **Round End** | HP reaches 0 or timer | "Player X wins the round!" for 2s |
| **Match End** | Player wins 2 rounds | "Player X WINS!" with final score. "Play Again" button (requeues both players). |

### 10.3 Styling

- Font: Any monospace or bold sans-serif web-safe font (`'Segoe UI', Arial, sans-serif`).
- Color scheme: Dark background overlays with white/colored text.
- HP bars have a thin white border.
- All overlays use `position: absolute` over the canvas.

---

## 11. Controls

### 11.1 Keyboard & Mouse

| Action | Binding |
|--------|---------|
| Move forward | W |
| Move backward | S |
| Move left | A |
| Move right | D |
| Jump | Space |
| Attack (punch/stomp) | Left mouse button |
| Block / Parry | Right mouse button (hold) |
| Camera look | Mouse movement (pointer locked) |
| Camera zoom | Scroll wheel |

### 11.2 Input Handling

- Use `keydown`/`keyup` events to track held keys. Use `mousedown`/`mouseup` for mouse buttons.
- Jump and attack are **edge-triggered**: only fire on the frame the key/button transitions from up to down. Block is **held** — true while the right mouse button is held, false when released.
- Send input state to server **once per client frame** via `requestAnimationFrame`. Each message has a monotonically increasing `seq` number. On a 60fps display this is ~60 messages/second, which is fine for JSON over WebSocket on a LAN. If the client runs at a higher framerate (e.g., 144fps), inputs are still sent every frame — the server queues and processes them.
- `cameraYaw` is derived from accumulated mouse deltaX. `cameraPitch` from deltaY. These are maintained on the client; only `cameraYaw` is sent to the server (pitch does not affect gameplay, only camera angle).
- **Context menu prevention**: The client must call `event.preventDefault()` on the `contextmenu` event on the canvas to prevent the browser context menu from appearing on right-click (block button).

---

## 12. Project Structure

```
garheck/
├── package.json
├── server/
│   ├── index.js            — HTTP server + WebSocket setup + lobby
│   ├── Game.js             — Game session: manages two players, rounds, timer
│   ├── Player.js           — Player state + input processing
│   └── Combat.js           — Attack hitboxes, damage, knockback, i-frames, block/parry
├── client/
│   ├── index.html          — Page shell, canvas, HUD overlay divs, import map
│   ├── css/
│   │   └── style.css       — HUD and overlay styling
│   └── js/
│       ├── main.js         — Entry point: init Three.js, connect WebSocket, game loop
│       ├── Renderer.js     — Three.js scene setup, arena mesh, lighting
│       ├── Character.js    — Build character mesh hierarchy, procedural animations
│       ├── Camera.js       — Third-person camera logic, pointer lock, wall collision
│       ├── Input.js        — Keyboard/mouse capture, input state management
│       ├── Network.js      — WebSocket connection, send inputs, receive state
│       ├── Prediction.js   — Client-side prediction + reconciliation (uses shared/Physics.js)
│       └── HUD.js          — Update HP bars, timer, round display
└── shared/
    ├── constants.js        — Shared constants (speeds, gravity, dimensions, tick rates)
    ├── Physics.js          — Movement, gravity, collision resolution (used by BOTH server and client)
    └── Arena.js            — Arena geometry data (vertices, wall segments for collision)
```

**Important: Shared code accessibility.** The server must serve BOTH `client/` and `shared/` directories via HTTP. The `shared/` directory is served at the URL path `/shared/` (e.g., `http://localhost:3000/shared/constants.js`). This allows the browser to import shared modules. The server imports them directly via file path (`import ... from '../shared/constants.js'`).

**Physics.js is shared, not duplicated.** There is a single `shared/Physics.js` that both the server and the client import. This guarantees prediction uses identical physics logic. Do NOT create separate physics files for server and client.

**Import map in index.html.** The client HTML must include an import map to resolve the `three` bare specifier:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.162.0/build/three.module.js"
  }
}
</script>
```

Client JS files then use `import * as THREE from 'three'` and `import { TICK_RATE } from '/shared/constants.js'` (absolute URL paths).

### 12.1 Shared Constants File

```javascript
// shared/constants.js
export const TICK_RATE = 60;
export const TICK_DURATION = 1000 / TICK_RATE;       // 16.67ms
export const SEND_RATE = 20;
export const SEND_INTERVAL = TICK_RATE / SEND_RATE;  // every 3 ticks
export const SERVER_PORT = 3000;

export const ARENA_RADIUS = 20;
export const ARENA_SIDES = 8;
export const ARENA_WALL_HEIGHT = 4;

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 2.0;
export const PLAYER_MOVE_SPEED = 8;
export const PLAYER_JUMP_VELOCITY = 10;
export const GRAVITY = -25;
export const AIR_CONTROL_FACTOR = 0.6;
export const KNOCKBACK_FRICTION = 8.0;       // per second decay rate for knockback velocity

export const PLAYER_MAX_HP = 100;
export const PUNCH_DAMAGE = 15;
export const PUNCH_WINDUP = 0.05;
export const PUNCH_ACTIVE = 0.1;
export const PUNCH_RECOVERY = 0.15;
export const PUNCH_RANGE = 0.8;
export const PUNCH_HITBOX_RADIUS = 0.5;
export const PUNCH_KNOCKBACK_XZ = 6;
export const PUNCH_KNOCKBACK_Y = 3;
export const PUNCH_HITSTUN = 0.3;

export const STOMP_VELOCITY = -15;
export const STOMP_DAMAGE = 20;
export const STOMP_HITBOX_RADIUS = 0.6;
export const STOMP_KNOCKBACK_XZ = 8;
export const STOMP_HITSTUN = 0.5;
export const STOMP_BOUNCE_VELOCITY = 6;
export const STOMP_MISS_LAG = 0.4;

export const BLOCK_DAMAGE_MULTIPLIER = 0.5;  // 50% damage when blocking
export const BLOCK_KNOCKBACK_MULTIPLIER = 0.25; // 25% knockback when blocking
export const BLOCK_STUN = 0.15;              // block stun duration
export const PARRY_WINDOW = 0.15;            // seconds after block starts where parry is active
export const PARRY_PUNISH_STUN = 0.4;        // hitstun applied to attacker on parry

export const IFRAMES_DURATION = 0.8;

export const ROUND_TIME = 90;
export const ROUNDS_TO_WIN = 2;
export const MAX_DRAWS = 3;                  // max consecutive draws before sudden death
export const COUNTDOWN_SECONDS = 3;
export const BETWEEN_ROUNDS_PAUSE = 2;

export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100;
export const CAMERA_DEFAULT_DISTANCE = 5;
export const CAMERA_MIN_DISTANCE = 2;
export const CAMERA_MAX_DISTANCE = 10;
export const CAMERA_MIN_PITCH = -Math.PI / 6;  // -30 deg (looking slightly up)
export const CAMERA_MAX_PITCH = Math.PI / 3;    // +60 deg (looking down)

export const SNAP_THRESHOLD = 2.0;
export const LERP_THRESHOLD = 0.1;
export const LERP_FACTOR = 0.1;

export const MAX_INPUT_QUEUE = 10;           // max queued inputs per player per tick
```

---

## 13. Spawn & Reset

### 13.1 Spawn Positions

- **Player 1**: Position `(-8, 0, 0)`, facing toward center (yaw = `Math.PI / 2`). Camera yaw also starts at `Math.PI / 2` (looking in the +X direction toward center).
- **Player 2**: Position `(8, 0, 0)`, facing toward center (yaw = `-Math.PI / 2`). Camera yaw starts at `-Math.PI / 2` (looking in the -X direction toward center).

**Yaw convention**: `yaw = 0` means facing +Z. Yaw increases counter-clockwise when viewed from above. So `yaw = Math.PI / 2` faces +X, `yaw = Math.PI` faces -Z, `yaw = -Math.PI / 2` faces -X.

### 13.2 Round Reset

On each new round:
1. Reset both players to spawn positions.
2. Reset HP to 100.
3. Reset all attack timers, hitstun, i-frames.
4. Reset the round timer to 90s.
5. Run countdown sequence before accepting inputs.

---

## 14. Static File Serving

- The Node.js server serves static files via HTTP using raw `http` + `fs.readFile` (no express, no extra dependencies).
- **URL routing**:
  - `/` → serves `client/index.html`
  - `/css/*`, `/js/*` → serves from `client/css/`, `client/js/`
  - `/shared/*` → serves from `shared/`
  - All other paths → 404
- **MIME types**: The server MUST set the `Content-Type` header correctly based on file extension. At minimum:
  - `.html` → `text/html`
  - `.css` → `text/css`
  - `.js` → `application/javascript` (required — browsers reject ES module imports without this)
- **Port**: `process.env.PORT || 3000`.
- The WebSocket server runs on the same HTTP server (same port).

### 14.1 Dependencies

```json
{
  "name": "arena-brawl",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js --solo"
  },
  "dependencies": {
    "ws": "^8.16.0"
  }
}
```

- Three.js is loaded on the client via CDN using the import map defined in `index.html` (see Section 12). Use `https://unpkg.com/three@0.162.0/build/three.module.js`. If unpkg is unavailable, `https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js` is an alternative.

---

## 15. Implementation Order (Suggested Phases)

### Phase 1: Foundation

**Build:**
1. Create `package.json` (Section 14.1).
2. Create `shared/constants.js` (Section 12.1 — copy the full constants block).
3. Create `shared/Arena.js` — export a function that computes octagon vertices and wall segments from `ARENA_RADIUS` and `ARENA_SIDES`.
4. Create `server/index.js` — HTTP server serving static files with correct MIME types (Section 14), plus WebSocket server that accepts connections, assigns player IDs, and implements solo mode via `--solo` flag (Section 3.1.1).
5. Create `client/index.html` — page shell with canvas, HUD overlay divs, import map for Three.js (Section 12), and a `<script type="module" src="/js/main.js">`.
6. Create `client/css/style.css` — basic full-screen canvas, overlay positioning.
7. Create `client/js/main.js` — connects to WebSocket, logs lobby messages to console, shows "Waiting..." or "Connected" text on screen.
8. Create `client/js/Network.js` — WebSocket wrapper: connect, send input messages, register callbacks for server messages.

**Verify:**
- `npm install && node server/index.js --solo` starts without errors.
- Opening `http://localhost:3000` in a browser loads the page without console errors.
- The browser connects via WebSocket and receives a lobby message with `playerId: 0`.
- In solo mode, the server logs that a game session has started (or sends a countdown event).

### Phase 2: Rendering

**Build:**
1. Create `client/js/Renderer.js` — Three.js scene setup: WebGLRenderer filling the window, scene, lighting (Section 4.2). Build the octagonal arena floor and walls using shared `Arena.js` for geometry data.
2. Create `client/js/Character.js` — build the character mesh hierarchy (Section 5.1): body, head, arms, legs as a Three.js Group. Function to create a character with a given color. Add eyes (Section 5.3).
3. Create `client/js/Camera.js` — third-person camera (Section 6): pointer lock request, mouse movement tracking for yaw/pitch, scroll wheel for distance, camera position calculation from the formula in Section 6.2. Include pointer lock overlay ("Click to Play" / "Paused").
4. Update `client/js/main.js` — initialize renderer, create two characters at spawn positions, set up camera, run a render loop via `requestAnimationFrame`.

**Verify:**
- Opening the page shows the octagonal arena with walls and two colored characters (red and blue) at their spawn positions.
- Clicking the canvas activates pointer lock. Mouse movement orbits the camera. Scroll wheel zooms.
- ESC exits pointer lock and shows the pause overlay. Clicking resumes.
- The scene has visible lighting and shadows.

### Phase 3: Movement

**Build:**
1. Create `client/js/Input.js` — keyboard and mouse input capture (Section 11). Track held keys, edge-trigger jump/attack, track block hold state. Expose current `InputState`. Prevent context menu on right-click.
2. Create `shared/Physics.js` — the core physics simulation step (Section 7). Takes a player state and input, returns updated state. Includes: movement from input+cameraYaw, gravity, ground clamping, knockback friction decay. Also includes wall collision (using Arena.js) and player-vs-player collision. This is a pure function with no Three.js dependency.
3. Create `server/Player.js` — server-side player state. Stores position, velocity, knockback, HP, state machine state, input queue. Methods to queue input, process inputs (with edge-trigger scanning per Section 7.6), and get serializable state.
4. Create `server/Game.js` — game session. Holds two Players, runs the tick loop (Section 7.6 with `setTimeout` accumulator), calls Physics.js each tick, broadcasts state at SEND_RATE. Implements solo mode (dummy player with no inputs).
5. Update `server/index.js` — create a Game when two players connect (or one in solo mode). Route incoming WebSocket input messages to the correct Player's input queue.
6. Create `client/js/Prediction.js` — client-side prediction and reconciliation (Section 9.1). Buffer unacknowledged inputs, re-simulate on server state arrival. Opponent interpolation (Section 9.2).
7. Update `client/js/main.js` — send inputs every frame, receive state snapshots, update character positions via prediction (own) and interpolation (opponent). Character mesh rotates to face movement direction.

**Verify (use solo mode):**
- WASD moves the player character around the arena. Movement feels immediate (prediction working).
- Space makes the character jump. Character goes up and comes back down.
- Character cannot walk through arena walls — they slide along them.
- Character cannot overlap with the dummy opponent (collision pushes apart).
- The dummy opponent is visible at its spawn position and doesn't move.
- Open browser dev tools Network tab: WebSocket messages are flowing (inputs out, state snapshots in).

### Phase 4: Combat

**Build:**
1. Create `server/Combat.js` — hit detection and damage resolution (Section 8). Punch hitbox: sphere in facing direction, checks distance to opponent. Stomp hitbox: sphere at feet. Block/parry logic: check if target is blocking, check parry window. Apply damage (with block multiplier if applicable), knockback impulse, hitstun. Apply i-frames after hit. Parry: negate damage, stun attacker. Stomp bounce on hit, stompLag on miss.
2. Update `server/Player.js` — add state machine (Section 7.4) with all transitions. Add timers for attack phases (windup/active/recovery), hitstun, i-frames, stompLag, block start time (for parry window). Movement restrictions per state.
3. Update `server/Game.js` — call Combat.js during tick step 11. Emit hit events.
4. Update `client/js/Character.js` — add procedural attack animation (right arm swing for punch), stomp pose, block pose (arms crossed), hit stagger, i-frame blinking (toggle mesh visibility). Parry flash (white emissive burst).
5. Update `client/js/main.js` — trigger animations based on player state received from server. Handle hit events for visual feedback.

**Verify (use solo mode):**
- Walk up to the dummy and left-click: punch animation plays, dummy takes 15 damage (visible in console log or temporary on-screen debug text).
- Punch while facing away from the dummy: miss, no damage.
- Jump and left-click: stomp animation, fast-fall, dummy takes 20 damage if hit.
- Stomp the dummy: player bounces upward after hit.
- Miss the stomp (land next to dummy): player is stuck in stompLag briefly.
- Hold right-click then punch the dummy: blocked, reduced damage.
- After being hit, the dummy blinks (i-frames visible).
- Knockback moves the dummy noticeably when hit, and the push decays over ~0.5s.

### Phase 5: Game Flow

**Build:**
1. Update `server/Game.js` — implement full match flow: lobby waiting state, countdown sequence (3-2-1-FIGHT, Section 3.1), round timer (90s countdown), round end on KO or timeout (Section 3.2), between-round pause, match end on 2 wins, draw handling (Section 10.1). Emit all GameEvent kinds. Handle disconnection (Section 3.3). Handle 3rd+ connections. Heartbeat pings. Play Again flow (Section 3.4).
2. Create `client/js/HUD.js` — HP bars, round indicator, timer (Section 10.1). Overlay screens: title, waiting, countdown, pause, round end, match end with Play Again button (Section 10.2). All HTML/CSS overlays, not Three.js.
3. Update `client/js/main.js` — wire up HUD to incoming server events. Show/hide overlays based on game state. Send `playAgain` message when button clicked.
4. Update `client/js/Network.js` — handle all event kinds, lobby status "full".

**Verify (use solo mode):**
- On connect: countdown "3, 2, 1, FIGHT!" appears then disappears.
- HP bars visible at top of screen, update when hitting the dummy.
- Timer counts down from 90.
- KO the dummy: "Player 1 wins the round!" appears, then next round starts after pause.
- Win 2 rounds: "Player 1 WINS!" with final score appears.
- Play Again button resets the match.

**Verify (two tabs, normal mode):**
- First tab shows "Waiting for opponent..."
- Second tab connects, countdown starts for both.
- Both players can move and fight independently.
- Closing one tab shows disconnect message to the other, who wins.
- A third tab gets "Game in progress" and is rejected.

### Phase 6: Polish

**Build:**
1. Update `client/js/Character.js` — full procedural animations (Section 5.2): idle bob, running leg/arm swing, jump tuck, fall spread, KO collapse.
2. Update `client/js/Camera.js` — wall collision via raycast (Section 6.2). If camera would be inside a wall, pull it forward.
3. Optionally: simple particle effect on hit (Three.js Points or small spheres that fly outward and fade, created on `hit` events).
4. Final pass: ensure all test checklist items in Section 17 pass.

**Verify:**
- Character animates while running (legs and arms swing).
- Character has idle animation when standing still.
- Camera doesn't clip through arena walls.
- Full testing checklist (Section 17) passes.

---

## 16. Key Constraints & Rules for Implementation

1. **Server is authoritative**: Never trust the client for position, HP, or hit detection. The client only sends inputs.
2. **No external 3D models**: All characters and arena geometry are built procedurally from Three.js primitives (Box, Sphere, Plane, Shape).
3. **No external textures required**: Use solid colors and procedural materials. Textures are optional polish.
4. **No build step**: The client uses native ES modules with an import map (see Section 12). Three.js is loaded from CDN. No webpack, no bundler.
5. **Single `npm install` + `npm start`**: That's all it should take to run. `npm run dev` starts solo mode for single-player testing.
6. **Works on localhost**: Two browser tabs on the same machine should be able to play against each other.
7. **Fixed timestep on server**: The server loop must use a `setTimeout`-based accumulator pattern with `performance.now()` (see Section 7.6). Do NOT use `setInterval`.
8. **Edge-triggered inputs**: Jump and attack should not repeat when held. The server must scan ALL queued inputs for edge triggers, not just the latest (see Section 7.6).
9. **Shared code is truly shared**: `shared/constants.js`, `shared/Physics.js`, and `shared/Arena.js` are single files imported by both server and client. Do NOT duplicate them. The server must serve the `shared/` directory at `/shared/` (see Section 14).
10. **JSON messages**: Use JSON for WebSocket messages in v1. Binary optimization can come later.
11. **Never crash on bad input**: Wrap all JSON parsing in try-catch. Validate message structure before processing. See Section 9.5.

---

## 17. Testing Checklist

After implementation, verify the following:

- [ ] `npm install && npm start` works with no errors.
- [ ] `npm run dev` starts in solo mode (single-player with dummy opponent).
- [ ] In solo mode, opening one browser tab immediately starts the countdown (no waiting).
- [ ] The dummy opponent stands at spawn, can be punched and stomped, and takes damage normally.
- [ ] Opening `http://localhost:3000` (normal mode) in a browser shows the title/waiting screen.
- [ ] Opening a second tab connects and triggers the countdown.
- [ ] Both players can move with WASD and jump with Space.
- [ ] Camera follows the player and can be rotated with the mouse.
- [ ] Punching (left click on ground) damages the opponent when in range and facing them.
- [ ] Punching while facing away from the opponent misses (hitbox is directional).
- [ ] Stomping (left click in air) does more damage and bounces the attacker.
- [ ] Stomping cannot chain infinitely (i-frames protect the victim).
- [ ] Blocking (right click hold) reduces incoming damage by 50%.
- [ ] Parrying (right click timed within 0.15s of a hit) negates damage and stuns the attacker.
- [ ] HP bars update correctly.
- [ ] When HP reaches 0, the round ends and the next round starts.
- [ ] After 2 round wins, the match ends with a winner screen.
- [ ] Timer counts down and round ends when it expires.
- [ ] Closing one tab causes the other player to win by default.
- [ ] Two players cannot overlap (collision pushes them apart).
- [ ] Players cannot walk through arena walls.
- [ ] Movement feels smooth and responsive (client-side prediction working).
- [ ] Opponent movement looks smooth (interpolation working).
- [ ] A third browser tab gets a "Game in progress" message and is disconnected.
- [ ] Knockback moves the hit player noticeably and decays over ~0.5s (not instant stop).
- [ ] Right-clicking does not open the browser context menu during gameplay.
