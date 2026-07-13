# BYO20 — Transport Layer Spec

## What This Layer Does

The transport layer is the pipe between the DM's server and all connected clients. It has one job: get messages from A to B, reliably, in the right format, to the right people.

It does not run game logic. It does not know D&D rules. The game engine talks to the transport layer; the transport layer talks to the network. Clean separation, always.

---

## Connection Flow

```
DM opens app
  → Electron spawns server process
  → Server starts Cloudflare Tunnel
  → Tunnel returns a public URL (e.g. xyz.trycloudflare.com)
  → App displays URL + generated invite code

Player opens app → "Join Game"
  → Enters URL + invite code
  → App opens WebSocket connection
  → Server validates invite code
  → Server issues a campaign-scoped player token (stored in Postgres)
  → Server pushes full STATE_SNAPSHOT
  → Player is in
```

### Notes
- Cloudflare Tunnel URL changes on every server restart (free tier). Players need the new URL each session.
- Invite code is separate from the URL. Sharing the URL alone is not enough to join.
- DM can regenerate the invite code at any time. Old code is immediately invalid.

---

## Auth

### Tokens

Two token types exist:

| Token | Issued | Scope | Carries |
|---|---|---|---|
| Host token | On server init, stored locally | Permanent | `role: "host"` |
| Player token | On first invite code auth | Per campaign | `role: "player"` |

### Token Lifetime
- **Per campaign** — tokens persist in Postgres across sessions and server restarts
- On reconnect, players use their token instead of the invite code
- DM can revoke a player token (kick) at any time
- Host token is always valid as long as the server is running

### Reconnect Auth Flow
```
Player reconnects
  → Sends PLAYER_RECONNECT with token
  → Server validates token against DB
  → Valid → push STATE_SNAPSHOT, mark connected
  → Invalid / revoked → reject connection
```

---

## Host vs DM

These are distinct concepts:

| Role | Description |
|---|---|
| **Host** | The human who runs the server. Always a person. Has admin/server controls. |
| **DM** | The game master role. Can be a human or the AI. Runs the game. |

In **Human DM mode**: host and DM are the same person.  
In **AI DM mode**: host retains server admin controls; AI runs all game decisions.

### Host-as-Player
The host can start a server, configure the campaign, then join as a regular player:

```
Host starts server
  → Server generates host token, stored locally
  → Host configures campaign, enables AI DM
  → Host clicks "Join as Player"
  → App connects via WebSocket using host token
  → UI switches to player view
  → Admin panel still accessible as an overlay
  → Server runs in background, AI DM takes over
```

- Host has a full character in the game, just like other players
- Host retains admin controls (pause, kick, end session) regardless of DM mode
- Host cannot interfere with game decisions in AI DM mode — admin powers are server-level only

---

## Campaign Portability / Host Handoff

Campaigns are fully portable. A host can hand a campaign to another player at any time.

### Handoff Flow
```
Current host exports campaign
  → Exports hosted_campaign schema from local Postgres as a dump file
  → Shares file with new host (any method — Discord, USB, etc.)

New host imports campaign
  → Loads dump into their local Postgres
  → Starts server → server generates their own host token
  → Shares new Cloudflare URL with the party

Players reconnect
  → Use same campaign tokens (present in imported DB, still valid)
  → Only need the new URL — nothing else changes

Old host rejoins
  → Uses invite code like a new joiner
  → Gets a player token on the new server
  → Character is already in the DB, picked right back up
```

### Why This Works
Campaign data lives entirely in Postgres. Tokens are stored in the DB. Porting a campaign is just porting a database dump. No platform accounts, no lock-in.

---

## Message Format

Every message — in both directions — uses the same JSON envelope:

```json
{
  "type": "ATTACK_RESULT",
  "id": "uuid-v4",
  "timestamp": 1234567890123,
  "to": ["dm", "player_abc123"],
  "payload": { ... }
}
```

| Field | Description |
|---|---|
| `type` | What kind of message this is |
| `id` | Unique per message, used for deduplication |
| `timestamp` | Server-stamped, canonical ordering |
| `to` | Routing target (see Routing section) |
| `payload` | Content — shape varies per type |

### Why JSON
- Turn-based game, message volume is low (10–20 messages per combat round max)
- Human-readable in devtools — huge during development
- Zero extra tooling or schema files needed
- Native to every WebSocket client

---

## Message Taxonomy

### Client → Server

| Type | Description |
|---|---|
| `PLAYER_ACTION` | Move, attack, cast spell, interact, use item |
| `PLAYER_CHAT` | Out-of-character chat |
| `PLAYER_RECONNECT` | Token-based reconnect request |

### Server → Client — Combat

| Type | Description |
|---|---|
| `COMBAT_START` | Initiative rolled, turn order established |
| `TURN_START` | Whose turn, available actions |
| `ROLL_RESULT` | Dice faces, modifiers, total |
| `ATTACK_RESULT` | Hit or miss, against what AC, full breakdown |
| `DAMAGE_RESULT` | Amount, type, target, HP remaining |
| `SAVING_THROW` | Prompt player to roll, or broadcast result |
| `CONDITION_APPLIED` | Poisoned, stunned, prone, etc. |
| `CONDITION_REMOVED` | Condition lifted |
| `DEATH_SAVE_RESULT` | Success/fail count update |
| `TURN_END` | Turn over |
| `COMBAT_END` | Combat resolved |

### Server → Client — World

| Type | Description |
|---|---|
| `SKILL_CHECK_RESULT` | Perception, stealth, deception, etc. |
| `XP_GRANTED` | XP awarded, to whom |
| `LOOT_GRANTED` | Items awarded |
| `LEVEL_UP` | Character levelled up |
| `REST_RESULT` | HP recovered, spell slots restored |

### Server → Client — Narrative

| Type | Description |
|---|---|
| `NARRATION` | AI narration, streamed token by token |
| `NPC_DIALOGUE` | NPC speech |

### Server → Client — Meta / System

| Type | Description |
|---|---|
| `STATE_SNAPSHOT` | Full game state dump — sent on connect/reconnect |
| `STATE_DELTA` | Periodic sync push (configurable interval, default 5 min) |
| `ACTION_RECEIVED` | Immediate ACK — server received your action, processing |
| `SYSTEM` | Kick, pause, session end, DM notifications |

---

## Routing

Server always decides routing. Players never address each other directly.

### `to` field values

| Value | Meaning |
|---|---|
| `"all"` | Broadcast to every connected client |
| `"dm"` | DM only |
| `"player_abc123"` | Specific player by ID |
| `["dm", "player_abc123"]` | DM + specific player |

### Implementation

Single in-memory map per server process — no pub/sub, no Redis:

```typescript
const connections = new Map<string, WebSocket>()
// player_id → their WebSocket connection

function send(to: string | string[], message: Message) {
  const recipients = to === "all"
    ? [...connections.values()]
    : [to].flat().map(id => connections.get(id))

  recipients.forEach(ws => ws?.send(JSON.stringify(message)))
}
```

### Routing Rules for Non-obvious Cases

| Scenario | `to` |
|---|---|
| Combat damage, condition applied | `"all"` |
| Secret roll (rogue stealth) | `["dm", "rolling_player_id"]` |
| Perception check result | `["dm", "rolling_player_id"]` |
| NPC whisper | `["dm", "target_player_id"]` |
| Fog of war update (shared mode) | `"all"` |
| Fog of war update (individual mode) | `player_id` per player |
| Death saving throws | Configurable — `"all"` or `["dm", "player_id"]` |
| Kick | `"player_id"` being kicked |

---

## Latency Strategy

Transport-level latency is not the problem. WebSockets are persistent — no per-message handshake. Game logic (dice math, damage calc) resolves in microseconds.

**The actual bottleneck is AI narration (2–10 seconds per LLM call).**

### Solutions

**Decouple fast from slow**
```
Player attacks
  → Server resolves combat immediately
  → ATTACK_RESULT, DAMAGE_RESULT, TURN_END fire right away  ← instant
  → AI narration generates in background
  → NARRATION streams token by token as it arrives           ← feels live
```

Players never wait for narration before seeing combat results.

**Immediate ACK**  
Server fires `ACTION_RECEIVED` the moment it receives any player action. Player sees feedback immediately, not silence.

**Streaming narration**  
`NARRATION` messages stream token by token. Players read as it generates.

**Pre-gen pool**  
Common narration scenarios pull from a pre-generated pool — zero LLM latency.

**Dice roll animation**  
Client starts dice spinning animation immediately on action send. Server resolves and responds in well under a second. Animation lands on the real server value. No optimistic updates, no reconciliation, feels instant.

---

## Reconnection

### Grace Period Flow
```
WebSocket drops
  → Server marks player as DISCONNECTED
  → Starts 60-second grace period timer
  → Player reconnects within 60s → STATE_SNAPSHOT push, back in game
  → Grace period expires → mark as ABSENT, notify DM via SYSTEM message
```

### Reconnect always gets a full snapshot
No event replay, no diff tracking. Full `STATE_SNAPSHOT` is always correct and small enough for a turn-based game.

### Mid-Combat Disconnect

If a player disconnects on their turn, behaviour is configurable per campaign (DM sets this):

| Setting | Behaviour |
|---|---|
| `auto_skip` | Turn skips, game continues. **(Default)** |
| `ai_takeover` | AI controls character until player returns. DM notified. |
| `freeze` | Game waits indefinitely. No timeout. |

DM can override this per-incident via the admin panel in the moment.

AI takeover uses the same AI player system already built into the engine — no special transport handling needed.

### Server Restart
Cloudflare Tunnel URL changes on restart. Players need the new URL but their tokens remain valid (stored in Postgres). Effectively a new session — reconnect with token + new URL.

---

## DM Controls

All admin controls are `SYSTEM` type messages. In AI DM mode, these are host controls — they do not affect game decisions.

### Lobby Controls
- Regenerate invite code — invalidates current code immediately
- Kick player — revoke token, close WebSocket, player is out
- Close lobby — no new connections accepted, current players unaffected

### Session Controls
- Pause — server stops processing player actions, all clients receive `SYSTEM: PAUSED`
- Resume
- End session — final `STATE_SNAPSHOT` pushed to all players, connections closed cleanly

### Per-Player Controls
- Mute player chat
- Force reconnect — useful for janky connections
- Override disconnect behaviour — e.g. freeze instead of auto_skip in the moment

---

## AI Players

AI players have no network connection. They are internal to the server process. Their actions are function calls; results broadcast as normal game events. They do not touch the transport layer.

---

## Summary of Decisions

| Decision | Choice |
|---|---|
| Protocol | WebSockets |
| Connectivity | Cloudflare Tunnel |
| Message format | JSON envelopes |
| Token scope | Per campaign |
| Routing | In-memory Map, server-decided |
| Pub/sub | Not needed — single server process |
| Latency approach | Decouple AI from game events, stream narration, dice animation |
| Reconnection | 60s grace period, full snapshot on return |
| Mid-combat disconnect | Configurable: auto_skip (default) / ai_takeover / freeze |
| Host vs DM | Separated — host retains admin in AI DM mode |
| Campaign portability | Full Postgres dump, host handoff supported |
