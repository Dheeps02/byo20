# BYO20 — AI Layer Spec v1.0.0

> **Status:** Complete. All AI layer subsystems designed and specced.

> **Note:** All designs in this document are subject to change during implementation as understanding of multi-agent orchestration patterns and LLM provider capabilities evolves.

---

## Overview

The AI layer is the intelligence layer of BYO20. In AI DM mode, it replaces the human Dungeon Master entirely — running the campaign, voicing NPCs, narrating events, generating quests, advancing the world. In human DM mode, it provides narration and NPC dialogue only; the human drives all story decisions.

The AI layer sits between the game engine (which owns all D&D rules and deterministic mechanics) and the transport layer (which delivers output to clients). It never touches dice math, damage calculation, or rules resolution — the game engine owns those. It never touches WebSockets directly — transport owns that. It owns everything in between: story, prose, world state, and character.

```
Game Engine → [targeted event hooks] → AI Layer → [structured output] → Game Engine
                                                 → [prose stream]     → Transport → Clients
```

---

## Subsystems

```
AI Layer
├── Event Evaluator        (deterministic gate — no LLM cost)
├── Orchestrator           (context assembly + specialist routing)
├── Specialist Agents
│   ├── DM Specialist      (world decisions, generation, adjudication)
│   ├── NPC Specialist     (in-character dialogue, per-NPC scoped context)
│   └── Narration Specialist (prose output, streaming)
├── Output Validator       (Zod schema validation on all structured JSON output)
├── Skill Files            (prompt documents injected per task)
├── MCP Tools              (deterministic read/write operations)
├── Smart Narration Tier   (pre-gen pool + cheap model + frontier model)
├── World Gen              (staged campaign creation pipeline)
└── LLM Adapter            (Vercel AI SDK — provider-agnostic)
```

---

## LLM Adapter

### Provider Support

All LLM calls go through the **Vercel AI SDK** — a TypeScript library bundled inside the Electron app at build time. It provides a unified interface across all supported providers. No third-party routing service; the SDK runs locally inside the app process.

Supported providers:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- Ollama (local models — no API key required)

### API Key Storage

The DM/host enters their API key once at campaign setup. Keys are stored using Electron's `safeStorage` API — the OS encrypts the key (macOS Keychain, Windows Credential Manager, Linux Secret Service), and the encrypted blob is persisted in Postgres. The key is decrypted in memory only when an LLM call is made and never written to disk in plaintext.

```
DM enters API key
  → safeStorage.encryptString(key)
  → encrypted blob stored in campaigns.api_key_blob (Postgres)
  → on LLM call: safeStorage.decryptString(blob) → passed to Vercel AI SDK
```

### App Updates

The Vercel AI SDK is bundled at build time. When a provider updates their API in a breaking way, Vercel updates the SDK and BYO20 ships a new release. `electron-updater` handles auto-updates silently in the background — users stay current without manual action.

### Interface

The LLM adapter exposes a single internal interface the orchestrator calls:

```typescript
interface ILLMAdapter {
  complete(request: LLMRequest): Promise<LLMResponse>
  stream(request: LLMRequest): AsyncIterable<LLMToken>
}

type LLMRequest = {
  provider: 'anthropic' | 'openai' | 'google' | 'ollama'
  model: string
  system: string        // assembled by orchestrator
  messages: Message[]
  tools?: MCPTool[]     // MCP tools available for this call
  max_tokens: number
}
```

---

## Event Evaluator

The Event Evaluator is the gate between the game engine and the AI layer. It is **fully deterministic — zero LLM cost**. It reads game state and decides whether an AI invocation is needed at all, and if so, at what tier.

### How It Receives Events

The game engine emits targeted events via Node.js `EventEmitter`. "Targeted" means the engine only fires AI-specific events for things it already knows require potential AI handling — not every game event passes through here.

```typescript
// Game engine side — explicit hooks, not broadcast
aiEmitter.emit('combat_ended', { encounterId, defeated, partyState })
aiEmitter.emit('npc_addressed', { npcId, playerId, dialogue })
aiEmitter.emit('improvised_action', { playerId, description })
aiEmitter.emit('quest_node_gap', { questId, nodeId, outcome })
aiEmitter.emit('rest_interrupted', { restType, round })
// etc.
```

The evaluator registers listeners on these events and makes a fast decision before any specialist is invoked.

### Evaluation Logic

```
Event received
  → read current game state (Redis — fast)
  → read recent event_log tail (last 5–10 entries)
  → score event against context factors:
      - game phase (combat vs exploration)
      - HP levels across party (tension proxy)
      - how recently narration was last generated
      - whether this is a routine or novel event
      - quest state (active quest node? terminal node hit?)
  → output: EvaluationResult
```

```typescript
type EvaluationResult = {
  tier: 'skip' | 'narration:pool' | 'narration:cheap' | 'narration:frontier' | 'full'
  reason: string   // for logging/debugging
}
```

- `skip` — no AI response needed. Routine mechanical events with no narrative weight.
- `narration:pool` — pull from pre-generated pool, zero LLM cost.
- `narration:cheap` — cheap model narration only (no DM specialist).
- `narration:frontier` — frontier model narration only (high-drama moments).
- `full` — orchestrator invocation. DM specialist + possible narration chain.

The evaluator does NOT decide which specialist to invoke or which skill file to use — that is orchestrator responsibility. The evaluator only decides the tier.

### What Always Gets `full`

Some events unconditionally escalate to full orchestrator invocation regardless of scoring:
- `quest_node_gap` — dynamic quest node needed, no deterministic path
- `improvised_action` — outside the 12 standard actions, requires adjudication
- `dm_adjudication` — spell with freeform effect (e.g. Wish's Reshape Reality)
- `villain_agenda_check` — world clock crossed a scheduled agenda event threshold
- First encounter of a session (always narrated at frontier tier)

---

## Orchestrator

The orchestrator is the coordinator. It receives an `EvaluationResult` from the event evaluator, assembles the right context, selects the right specialist and skill file, invokes the LLM, and routes the output.

### Responsibilities

1. Determine which specialist to invoke based on the event type
2. Determine which skill file to inject
3. Assemble the specialist's context window
4. Invoke via LLM adapter
5. Handle chained invocations (e.g. encounter gen → narration)
6. Route output: structured JSON → game engine, prose → transport

### Specialist Routing

```
Event type               → Specialist
─────────────────────────────────────
npc_addressed            → NPC Specialist
improvised_action        → DM Specialist
dm_adjudication          → DM Specialist
quest_node_gap           → DM Specialist
combat_ended             → DM Specialist → Narration Specialist (chain)
encounter_triggered      → DM Specialist → Narration Specialist (chain)
villain_agenda_check     → DM Specialist
rest_declared (AI mode)  → DM Specialist (vote context)
narration:*              → Narration Specialist only
session_ended            → Narration Specialist (session summary)
```

### Chained Invocations

Some tasks require sequential specialist calls. The orchestrator manages the chain — the evaluator only fires once per event.

```
Encounter triggered
  → DM Specialist: generate encounter (what monsters, positions, setup)
      output: structured encounter JSON
  → engine writes encounter to DB
  → Narration Specialist: narrate the encounter opening
      input: encounter JSON + current scene
      output: prose stream → transport
```

The evaluator does not know chains will occur. The orchestrator decides mid-execution if a follow-up invocation is warranted based on the first specialist's output.

### Output Routing

```
Specialist output
  → if structured JSON (encounter, quest, NPC spawn, world mutation):
      → validate against fixed vocab
      → hand to game engine via internal function call
      → engine applies and writes to Postgres
  → if prose (narration, NPC dialogue):
      → stream token-by-token to transport layer
      → transport dispatches as NARRATION or NPC_DIALOGUE WS message
  → if both (common — generation + narration):
      → JSON to engine first (state must exist before narration references it)
      → then stream prose
```

### Lore Context (Epic campaigns only)

When `world_depth = 'epic'`, the Orchestrator runs a similarity search on `lore_entries` alongside existing pgvector sources (`npc_memories`, `faction_events`) and injects relevant chunks into specialist context.

- **NPC Specialist** — receives lore chunks relevant to the NPC's location, faction, and the current conversation topic. Enables NPCs to naturally reference world history, local legends, and faction lore. See `npc-dialogue.md` skill file for guidance on handling lore the party hasn't formally unlocked yet (hint vs. spoil distinction).
- **DM Specialist** — receives lore relevant to the current zone and active quests. Ensures quest gen and encounter framing stays consistent with authored world history.
- **Narration Specialist** — receives lore for scene-setting. A ruined city narration can reference its fall. A forest path can reference the old kingdom's road markers.

All lore is available to all specialists at all times — discovery status is not tracked at the AI layer. The `npc-dialogue.md` skill file governs how NPCs handle lore the party hasn't yet encountered in-world (allude, don't dump).

---

## Specialist Agents

Each specialist is a focused LLM invocation with a lean base system prompt. Domain knowledge arrives via skill files injected at call time by the orchestrator, not baked into the base prompt.

### DM Specialist

The campaign brain. All world decisions, generation tasks, and adjudication in AI DM mode.

**Responsibilities:**
- Encounter generation (monsters, positions, treasure theme)
- Quest generation (DAG authoring, world mutation instructions)
- Dynamic quest node generation (live handoff on missing edge)
- Villain agenda event execution (world mutations on schedule)
- Improvised action adjudication
- `dm_adjudication` spell effects (e.g. Wish)
- Vote context provision (narrative framing for party votes — does not vote)
- Non-combat XP award decisions
- Loot conflict resolution (class/role fit judgment)
- Session milestone assessment

**Does NOT do:**
- Dice math, damage, rules resolution (game engine)
- Prose narration (Narration Specialist)
- In-character NPC dialogue (NPC Specialist)

**Context assembled by orchestrator:**
- Campaign overview: tone, length, villain agenda summary, required milestones
- Active quests and current nodes
- Party state: characters, levels, HP, conditions, positions
- Relevant faction standings
- Recent event_log (window size scales with task — routine: ~10 events, quest gen: ~30 events)
- Relevant skill file

**Output format:** always structured JSON matching fixed vocabulary primitives (encounter JSON, quest DAG, world mutation instructions). Prose is never the DM specialist's output — that goes to Narration Specialist.

---

### NPC Specialist

Voices NPCs in character. One invocation per NPC per conversational exchange — not a standing per-NPC agent process. The orchestrator invokes it with a specific `npc_id` parameter; context is scoped tight to that NPC.

**Responsibilities:**
- In-character dialogue, responses, reactions
- Deciding what the NPC reveals, hints at, or hides based on memory and goals
- Emotional/behavioral response to player actions toward this NPC

**Does NOT do:**
- World decisions or story direction (DM Specialist)
- Narration prose outside of dialogue (Narration Specialist)

**Context assembled by orchestrator:**
- NPC record: name, traits, goals, faction, status
- NPC's top-K memories (pgvector query, decay-weighted) — semantic long-term memory: summaries, sentiments, significant events
- Last N raw dialogue exchanges with this NPC pulled from event_log (`npc_dialogue` event type, filtered by npc_id) — verbatim short-term recall for exact quotes, promises, recent context. N capped at ~10 exchanges; beyond that pgvector handles it better at lower token cost.
- Faction's current rep with each party member
- Current scene: location, phase, what the party just said/did

Two-layer memory: pgvector for long-term continuity ("this NPC knows the party helped the guild"), raw event_log for short-term verbatim recall ("you said you'd be back by dawn"). NPC sessions are stateless per-call — persistence lives entirely in Postgres, not in a live session.

**Output format:** in-character speech and action description. Streamed as prose directly to transport as `NPC_DIALOGUE` message.

---

### Narration Specialist

Produces all out-of-character prose. The DM's voice describing the world, not a character speaking in it.

**Responsibilities:**
- Combat narration (attack outcomes, deaths, dramatic moments)
- Scene descriptions (entering a new location, rest scenes)
- Quest outcome narration (node completion, failure consequence reveal)
- Session summaries (written at session end, stored in `sessions.summary`)
- Narrating the outcome of DM specialist decisions

**Does NOT do:**
- Story decisions (DM Specialist)
- In-character NPC speech (NPC Specialist)

**Context assembled by orchestrator:**
- The triggering event (what just happened)
- Party composition: names, classes, species (for personalized narration)
- Campaign tone
- Recent event_log (window scales with task — routine: ~10, session summary: full session)
- Recent combat_log if in combat
- Relevant skill file

**Output format:** prose, always streamed token-by-token. Never buffered. Transport receives the stream and dispatches as `NARRATION` WS message as tokens arrive.

---

## Skill Files

Skill files are Markdown prompt documents injected into a specialist's context by the orchestrator immediately before invocation. They carry domain-specific guidance the specialist needs for a particular task without bloating base system prompts.

Skill files live in the app's asset directory and are read at runtime — no rebuild needed to update them.

### File Registry

| File | Injected Into | When |
|---|---|---|
| `encounter-gen.md` | DM Specialist | Encounter triggered |
| `quest-gen.md` | DM Specialist | Quest generation needed |
| `dynamic-node-gen.md` | DM Specialist | quest_node_gap event |
| `improvised-action.md` | DM Specialist | improvised_action event |
| `dm-adjudication.md` | DM Specialist | dm_adjudication spell effect |
| `world-gen.md` | DM Specialist | World gen passes (campaign creation) |
| `villain-agenda.md` | DM Specialist | Agenda event execution |
| `npc-dialogue.md` | NPC Specialist | Every NPC invocation |
| `narration-combat.md` | Narration Specialist | Combat narration |
| `narration-exploration.md` | Narration Specialist | Exploration/scene narration |
| `session-summary.md` | Narration Specialist | Session end |
| `world-gen-epic.md` | DM Specialist | Epic world gen lore/prophecy/rumor passes |

### What Skill Files Contain

- Output format specification (what JSON shape to emit, or prose tone/length)
- Fixed vocabulary reminder (objective primitives, world mutation instructions, etc.)
- Creative constraints (what the agent can and can't decide)
- Examples (few-shot examples for structured output tasks)

Skill files do NOT contain D&D rules — the SRD codex in Postgres is the rules source, accessed via MCP tools. Skill files are guidance on HOW to do the task, not WHAT the rules are.

---

## MCP Tools

MCP tools are deterministic read/write operations available to specialist agents mid-generation. They are NOT LLM calls. Tools handle fetching missing context the agent discovers it needs during generation, and writing the agent's structured output back to the game state.

Context available at the START of an invocation (assembled by orchestrator) does not require tool calls. Tools are for mid-generation needs and all writes.

### Read Tools

| Tool | Description |
|---|---|
| `query_npc_memories(npc_id, context, top_k)` | pgvector similarity search — decay-weighted ranking |
| `get_available_monsters(cr_band, tags?)` | Read srd.monsters filtered by CR range and optional type tags |
| `get_quest_state(quest_id)` | Current node, history of visited nodes, terminal state |
| `get_faction_rep(faction_id, character_campaign_state_id)` | Rep value + drift-adjusted attitude |
| `get_location_layout(location_id)` | Terrain data, valid entity positions for encounter placement |
| `get_party_loadout()` | Current equipment, spell slots, class resources — for loot/encounter tuning |

### Write Tools

| Tool | Description |
|---|---|
| `place_encounter(encounter_data, positions)` | Spawn monsters at specific terrain positions, initialize initiative entries. Validates positions against heightmap before writing. |
| `place_object(object_data, position)` | Place environmental object, trap, container, or scene dressing |
| `spawn_npc(data)` | Create NPC in world.npcs |
| `create_quest(dag)` | Write generated quest DAG to quests table |
| `update_quest_node(quest_id, node_id)` | Advance quest to new current node |
| `append_quest_node(quest_id, node)` | Add a dynamically generated node to an existing quest DAG |
| `fire_world_event(event_type, payload)` | Write to event_log, execute any attached world mutations |
| `add_npc_memory(npc_id, event_log_id, sentiment, significance?)` | Write npc_memories row |
| `apply_world_mutation(instruction)` | Execute a single fixed-vocab world mutation instruction |
| `award_xp(character_ids, amount, reason)` | Non-combat XP award — DM specialist discretion |
| `set_loot_winner(item_id, character_id)` | Resolve loot conflict — writes item ownership |

---

## Smart Narration Tier

Three-tier system for narration generation. The Event Evaluator picks the tier; the Narration Specialist handles tiers 2 and 3; tier 1 bypasses the LLM entirely.

### Tier 1 — Pre-Generated Pool

Zero LLM cost. Campaign-flavored strings generated at campaign creation and stored in `narration_pool`. The orchestrator pulls a random string matching the event type and sends it directly to transport.

Pool is scoped per campaign — strings know the party's names, the world's tone, the setting's vocabulary. Not generic templates.

**Suitable for:** routine attack hits/misses, short movement narration, minor skill check outcomes, uneventful rest flavor.

**Pool lifecycle:**
```
Campaign created
  → Narration Specialist generates pool (world tone + full party context)
  → Written to narration_pool table
  → Active immediately

New player joins mid-campaign
  → Targeted append pass (new character's sheet only)
  → New strings appended to existing pool buckets

Major milestone completed (triggers_pool_refresh = true)
  → Background refresh job starts
  → Old pool stays active during generation
  → New pool written to narration_pool with new generated_at
  → Atomic swap: old strings removed, new strings active
  → Game never pauses for this
```

### Tier 2 — Cheap Model

Low-cost LLM call. Narration Specialist invoked with a smaller context window and a cheaper model (configured per provider — e.g. claude-haiku, gpt-4o-mini). Suitable for moderately interesting moments that benefit from fresh generation but don't warrant frontier cost.

**Suitable for:** standard combat rounds, routine NPC interactions, non-critical skill checks, short rest narration.

### Tier 3 — Frontier Model

Full-cost LLM call. Narration Specialist invoked with full context and the DM's configured frontier model. Reserved for high-drama moments where narration quality actually matters.

**Suitable for:** boss kills, character deaths, quest completions, major plot reveals, first encounter of a session, milestone completions.

### DM Configuration

DMs configure narration behavior per campaign:

| Mode | Behavior |
|---|---|
| `economy` | Tier 1 (pool) as default, tier 2 for drama, tier 3 never |
| `balanced` | Tier 1 for routine, tier 2 for moderate, tier 3 for peak moments **(default)** |
| `quality` | Tier 2 as floor, tier 3 for any meaningful moment |

This is a cost vs. quality tradeoff the DM controls explicitly. Stored on `campaigns` (new column — see storage-layer.md cross-reference note below).

---

## World Gen

Campaign creation pipeline. Fires once when the DM creates a new campaign. Blocks session start — a loading screen with staged progress is shown to the DM. Not per-session; sessions load from Postgres instantly.

World gen has two distinct phases: **initial gen** at campaign creation (starter area + key locations + world skeleton), and **lazy gen** as the party explores (the rest of the world fills in on demand).

### DM Inputs

| Input | Type | Notes |
|---|---|---|
| Campaign name | TEXT | Optional — AI generates one from the campaign's plot if absent |
| Premise | TEXT | Optional — AI generates freely if absent |
| Setting tone | Select | `gritty` \| `high_fantasy` \| `dark` \| `comedic` |
| Party size | Select | 1–6 |
| Campaign length | Select | `short` (1–5 sessions) \| `medium` (6–15) \| `long` (16+) |

### Hex Zone System

The world map is divided into a hex grid using **axial coordinates** (`hex_q`, `hex_r`). Each hex is 6 miles across — roughly half a day's travel. All six adjacent hexes are equidistant from center (no diagonal weirdness like square grids).

**Coordinate system:** axial (q, r). Center of starter area is `(0, 0)`. Distance between two hexes:
```
distance = (|q1-q2| + |q1+r1-q2-r2| + |r1-r2|) / 2
```

**Honeycomb** (TypeScript library) handles all hex geometry — no need to implement grid math manually.

Each hex is a `world_zones` row (see storage cross-reference). Composite PK of `(campaign_id, hex_q, hex_r)` — coordinates ARE the unique identifier, no UUID needed.

The hex grid renders as a subtle UI overlay on the world map — players get a distance reference ("that city is about 3 hexes away, roughly a full day's travel"). Movement itself stays freeform on the continuous 3D heightmap. The hex grid never touches movement, combat, AoE, or fog of war mechanics.

### Three-Ring Generation Model

At all times the party has a 3-ring generation bubble around them:

```
Ring 1 (1 hex away, 0-6 miles)    → fully generated, fog lifted
Ring 2 (2 hexes away, 6-12 miles) → fully generated, fog lifted  
Ring 3 (3 hexes away, 12-18 miles) → partially generated, still fogged
                                      re-enriched to full when party enters ring 2
Beyond ring 3                       → ungenerated, fully fogged
```

**Full gen** (rings 1 + 2): terrain, zone type, points of interest, NPCs, local quests, encounter zones. Everything needed to play in this hex.

**Partial gen** (ring 3): terrain (always exists — heightmap covers everything), zone type, maybe a landmark stub. No NPCs, no quests, no encounters yet.

**Re-enrichment:** when the party closes to within 2 hexes of a partially generated zone, a full gen pass runs on it before it enters ring 2. By the time the party arrives, it's fully ready.

### Lazy Gen Trigger

```
Party moves into a new hex
  → collect all ungenerated or partial hexes within radius 3
  → if none → no call needed
  → if any exist → single batched DM Specialist call:
      input: terrain data for all target hexes + surrounding context
      output: {
        full_gen: [ { hex_q, hex_r, content... }, ... ],   // rings 1+2
        partial_gen: [ { hex_q, hex_r, stub... }, ... ]    // ring 3
      }
  → Output Validator runs on response
  → write all zones in one pass
  → fog updates per existing fog_mode setting
```

One LLM call per movement event, covering all newly in-range hexes simultaneously. Never one call per hex. If all hexes in radius 3 are already generated — no call at all.

Key locations generated at campaign creation (villain lair, major dungeons, faction HQs) are always fully generated regardless of party distance. The party may receive map hints or rumors pointing to them before they're in range.

### Initial Generation Pipeline

Stages run sequentially at campaign creation. Terrain first — everything placed on top of it.

```
Stage 1: Terrain
  → Procedural heightmap generated (terrain data only — visual rendering is renderer concern)
  → Hex grid overlaid at 6-mile scale
  → Terrain data (peaks, valleys, coastlines, water threshold) structured as JSON
  → Stored as campaign_seed on campaigns table
  → Loading screen: "Generating terrain..."

Stage 2: World Structure
  → DM Specialist invoked with: DM inputs + terrain JSON + world-gen.md
  → Output: factions (2-5), villain identity + plan, world overview, setting lore
  → Written to: factions, campaigns (overview fields)
  → Loading screen: "Building factions and lore..."

Stage 3: Key Locations
  → DM Specialist invoked with: terrain JSON + faction output
  → Output: starter area + key locations with hex coordinates (terrain-aware —
    ports near coast, castles on peaks, sanctuaries in valleys, dungeons underground)
  → Asset catalogue included in skill file — AI only places assets that exist
  → Starter area hexes (radius 3 from (0,0)) fully generated immediately
  → Key locations (villain lair, dungeons, faction HQs) fully generated immediately
    regardless of distance — party may receive hints before visiting
  → All other hexes written as ungenerated stubs (generated = false)
  → Loading screen: "Placing locations..."

Stage 4: NPCs
  → DM Specialist invoked per faction: faction data + location output
  → Output: NPCs with traits, goals, schedules, faction membership
  → Written to: npcs
  → Loading screen: "Spawning NPCs..."

Stage 5: Villain Agenda + Milestones
  → DM Specialist invoked with: full world state so far
  → Output:
      - Villain agenda: scheduled world events (what happens if party does nothing)
      - Required milestones: narrative gates the story is built around
      - Order hints for milestones (suggested, not enforced — players can skip or
        hit out of order without breaking the system)
  → Written to: campaign_agenda, campaign_milestones
  → Loading screen: "Writing villain's plan..."

Stage 6: Quest Hooks
  → DM Specialist invoked with: full world state + agenda + milestones
  → Output: 2-4 initial quests seeded into the world as AVAILABLE
  → World mutation instructions execute (spawn_npc, add_npc_memory, etc.)
  → Written to: quests, npc_memories, event_log
  → Loading screen: "Seeding quest hooks..."

Stage 7: Narration Pool
  → Narration Specialist invoked with: party composition + world tone
  → Output: ~20-30 strings per event type bucket
  → Written to: narration_pool
  → Loading screen: "Preparing narration..."

campaigns.world_gen_status = 'complete'
  → Loading screen dismissed
  → DM enters campaign lobby
```

**Epic world gen — additional passes (Epic only)**

Triggered automatically after the standard 7-pass pipeline completes when `world_depth = 'epic'`. Runs once at campaign creation. One-time token cost — no additional per-event cost during play.

**Lore authoring pass**
DM Specialist generates `lore_entries` rows using `world-gen-epic.md` skill file:
- Faction histories (one entry per faction)
- World history (key era summaries)
- Key location lore (villain lair, major dungeons, faction HQs)
- Named NPC backstories (significant NPCs only)

Each entry stored with the appropriate `category` field. Embeddings generated and stored via Ollama.
Loading screen: "Authoring the world's history..."

**Prophecy pass**
DM Specialist generates one campaign prophecy grounded in `campaign_milestones`.
Stored as a `lore_entries` row with `category = 'prophecy'`.
Loading screen: "Writing the prophecy..."

**Rumor seeding pass** — Deferred. Requires rumor system — see `docs/future-features.md`.

**Found document pass** — Deferred. See `docs/future-features.md`.

### Terrain Awareness

The terrain JSON produced in Stage 1 is passed to every DM Specialist invocation — both during initial gen and lazy gen. Skill files instruct the agent on placement conventions. The agent outputs hex coordinates; the engine validates them against the actual heightmap before writing. Invalid placement → agent retried with constraint feedback.

---

## Campaign Structure

In AI DM mode, the campaign is not a pre-plotted DAG. It is a living world with scheduled pressures and loose narrative anchors. Two mechanisms drive it forward:

### Villain Agenda

World-driven events that fire on a world clock schedule regardless of party action. Generated at campaign creation (Stage 5). The world moves forward even if the party is dicking around in a tavern.

```
World clock advances past agenda event's fires_at_clock value
  → Event Evaluator catches the threshold crossing
  → Escalates to: full → DM Specialist + villain-agenda.md
  → DM Specialist executes world mutations (spawn_npc, fire_world_event, etc.)
  → Writes villain_agenda_fired to event_log
  → Marks campaign_agenda row as fired
  → Narration Specialist narrates the consequence to the party
```

Agenda events are not fixed scripts — the DM Specialist has latitude to adapt them based on what the party has done since campaign creation. If the party already destroyed the cult's ritual site, the scheduled "cult performs ritual" event resolves differently. The agenda is a pressure schedule, not a railroad.

### Required Milestones

Narrative anchors generated at campaign creation. Some are `required = true` — the finale cannot trigger until these are complete. Others are `required = false` — loose story beats the world is built around but that the party can skip entirely.

Milestones are not step-by-step checkpoints. Players can hit them out of order or bypass them. A skipped non-required milestone just never fires — no system breakage.

`triggers_pool_refresh = true` milestones kick off a background narration pool refresh when completed — the world has changed enough that old narration strings might feel stale.

---

## Output Validator

All structured JSON output from specialists passes through the Output Validator before reaching the game engine or MCP write tools. Prose output (narration, NPC dialogue) bypasses this — it streams directly to transport and requires no schema validation.

### Why It Exists

LLMs hallucinate keys. A specialist returning `{ "typ": "spawn_npc" }` instead of `{ "type": "spawn_npc" }` should never reach a DB write. The validator is the hard boundary between LLM output and game state.

### Implementation

**Zod** is the schema library — TypeScript-native, already in the stack via Vercel AI SDK's tool definitions. One Zod schema per structured output type. `.strict()` mode on all schemas — unknown keys are rejected, not silently stripped.

### Validation Flow

```
Specialist returns structured JSON
  → parse JSON
      malformed (not valid JSON) → validation failure
  → run Zod schema for this output type
      unknown keys → failure
      missing required keys → failure
      value outside expected vocab → failure
        (e.g. world mutation type not in fixed primitive list)
  → valid → pass to orchestrator for routing to engine / MCP tools
  → invalid →
      log full output + validation error
      retry specialist once, injecting the validation error as feedback:
        "Your previous output failed validation: {error}. Correct and resubmit."
      still invalid after retry → escalate to error handling flow
        (same cascade as DM specialist failure — pause if blocking, degrade if narration)
```

### Schema Registry

One Zod schema per output type. Defined once, reused across all specialist invocations that produce that type.

| Output Type | Used By | Key Validated Fields |
|---|---|---|
| `EncounterOutput` | DM Specialist | monster ids (must exist in srd.monsters), positions (validated against heightmap), treasure theme |
| `QuestDAG` | DM Specialist | node objective primitives (fixed vocab), edge match values, terminal payload shape |
| `WorldMutationInstruction` | DM Specialist | instruction type (fixed vocab: spawn_npc, add_npc_memory, etc.), required fields per type |
| `DynamicQuestNode` | DM Specialist | objective primitive, resolution type, edges array |
| `NPCSpawnData` | DM Specialist | required NPC fields matching world.npcs schema |
| `XPAward` | DM Specialist | character_ids (must be valid UUIDs), amount (positive integer) |
| `LootResolution` | DM Specialist | item_id, character_id — both must be valid UUIDs |

### Security Boundary

The validator is also a security boundary. A compromised or misbehaving LLM output cannot cause an unrecognised write path to execute — if the key or value isn't in the Zod schema, it never reaches the engine. `.strict()` ensures no extra keys slip through to downstream handlers.

---

## Error Handling

### Narration Failure

Cascades down the tier chain without blocking the game:

```
Tier 3 (frontier) fails
  → retry once (silent, ~2s)
  → still failing → fall back to Tier 2 (cheap model)
  → Tier 2 fails → fall back to Tier 1 (pool)
  → Pool empty for this event type → emit generic fallback string
  → Game continues. Narration failure never pauses play.
```

### DM Specialist Failure

DM decisions ARE blockers — the game cannot proceed without them in AI DM mode.

```
DM Specialist call fails
  → retry up to 2 times (silent)
  → if still failing and < ~3s elapsed: show "DM is thinking..." to all clients
  → if retries exhausted:
      → pause game (same mechanism as DM manual pause)
      → push SYSTEM message to clients: "AI DM is unavailable, please wait"
      → host notified via admin panel with error detail
      → host can end the session or wait for recovery
```

Human DM takeover mid-session is deferred to post v1.0.

### NPC Specialist Failure

Less critical than DM failures — dialogue can gracefully degrade:

```
NPC Specialist fails
  → retry once
  → still failing → NPC gives a non-committal fallback response
    (e.g. "The NPC seems distracted and doesn't respond clearly.")
  → game continues, no pause
```

---

## Summary of Key Design Decisions

| Decision | Choice |
|---|---|
| LLM abstraction | Vercel AI SDK — TypeScript library, bundled at build time, no third-party routing service |
| Provider support | Anthropic, OpenAI, Google, Ollama (local) |
| API key storage | Electron safeStorage — OS-encrypted, blob stored in Postgres |
| App updates | electron-updater — SDK bumps ship as silent BYO20 app updates |
| Specialist count | 3 — DM, NPC, Narration |
| Agent architecture | Orchestrator + specialists. No per-NPC standing agents — one NPC capability invoked per-call with scoped context |
| NPC memory | Two-layer: pgvector top-K for semantic long-term memory + last ~10 raw event_log dialogue exchanges for verbatim short-term recall. Stateless per-call — persistence lives in Postgres. |
| Event routing | Node.js EventEmitter targeted hooks — game engine explicitly flags AI-requiring events. No pub/sub. |
| Gate vs orchestrator | Event Evaluator decides tier only. Orchestrator decides which specialist, which skill file, and manages chains. |
| Skill files | Markdown prompt docs injected per task by orchestrator. Base system prompts stay lean. |
| MCP tools | Deterministic read/write only. Generation/reasoning is LLM work, not tool work. |
| Narration tiers | 3 tiers: pre-gen pool (zero cost), cheap model, frontier model. DM configures mode (economy/balanced/quality). |
| Pool generation | Campaign-flavored at campaign creation. Append pass on new player join. Background refresh on major milestone. Atomic swap — old pool stays live during refresh. |
| World gen | Staged, sequential, blocks session start. Loading screen with per-stage progress. Terrain generated first, everything placed on top. |
| World gen: lazy | Initial gen covers starter area + key locations only. Rest of world fills in on demand as party explores. |
| Hex zone system | Axial coordinates (q, r). 6 miles per hex. Honeycomb library for geometry. Composite PK (campaign_id, hex_q, hex_r). UI overlay only — movement stays freeform. |
| Generation rings | 3 rings. Rings 1+2 (0-12 miles) fully generated. Ring 3 (12-18 miles) partial — re-enriched to full when party closes to ring 2. Beyond ring 3 ungenerated. |
| Lazy gen batching | One batched DM Specialist call per movement event covering all newly in-range hexes. Never one call per hex. No call if all hexes already generated. |
| Terrain | Procedural heightmap (peaks, valleys, coastlines, water threshold structured as JSON). Used for both world map and encounter grid. Visual aesthetic is renderer concern. |
| World gen: terrain awareness | Terrain JSON passed to every DM Specialist invocation during world gen. AI placement validated against heightmap. |
| Campaign structure | Not a pre-plotted DAG. Living world: villain agenda (scheduled pressure) + required milestones (loose gates). |
| Villain agenda | World-driven events on world clock schedule. Fires regardless of party action. DM Specialist adapts to current world state at fire time — not a fixed script. |
| Required milestones | Some gate the finale (required = true), others are narrative anchors only (required = false). Order not enforced. |
| Orchestrator output | Structured JSON → game engine. Prose → transport (streamed). JSON written before prose begins. |
| Narration streaming | Always streamed token-by-token. Never buffered. Narration Specialist output piped directly to transport. |
| Error handling — narration | Cascade down tiers → generic fallback. Never blocks game. |
| Error handling — DM | Silent retry x2 → "DM is thinking..." → pause + notify host. Human takeover deferred post v1.0. |
| Error handling — NPC | Retry once → graceful fallback response. No pause. |
| Output validation | Zod schemas on all structured JSON output. `.strict()` mode. Retry once with error feedback on failure. Security boundary — unknown keys never reach the engine. |
| Split party | Each subgroup has its own encounter. Orchestrator receives encounter_id + party_subset per invocation. All combat/narration events routed only to members of that encounter. World events (villain agenda, etc.) broadcast to all. |
| Campaign snapshots | Full mutable state dump at key triggers (encounter_end, milestone, rest, quest_transition, session_start, session_end). Rolling window of 10 per campaign — oldest deleted on overflow. Append-only logs never snapshotted or rolled back. DM-initiated rollback notifies all clients. AI generates human-readable label per snapshot. |
| AI players | Deferred to v1.1/v1.2 |
| Human DM takeover mid-session | Deferred post v1.0 |
| World depth | `world_depth` flag on campaigns. Standard = 7-pass gen only. Epic = additional lore/prophecy passes. |
| Lore context | Orchestrator injects `lore_entries` similarity results into all 3 specialists (Epic only) |
| Undiscovered lore | Available to AI at all times. Skill file governs hint-vs-spoil behaviour, not access control. |
| Epic world gen cost | One-time at campaign creation. No additional per-event cost during play. |

---

## Storage Cross-Reference

All columns and tables introduced by this layer have been added to storage-layer.md:

- `campaigns.narration_mode`, `campaigns.api_key_blob`, `campaigns.api_provider` — added in AI layer storage pass
- `campaign_agenda`, `campaign_milestones`, `narration_pool`, `quests` — new tables added
- `campaign_snapshots` — rolling window rollback snapshots
- `world_zones` — hex grid zone registry for lazy world gen
- `npc_dialogue_log` — verbatim NPC dialogue history
- `npc_memories.quest_id`, `npc_memories.significance`, `npc_memories.created_at_clock` — added
- `faction_events.quest_id`, `faction_events.created_at_clock` — added
- `event_type` enum — `villain_agenda_fired`, `milestone_completed`, `quest_*`, `narration_pool_refreshed` added
