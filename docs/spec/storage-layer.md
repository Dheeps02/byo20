# BYO20 — Storage Layer Spec v1.0.0

> **Note:** All schemas in this document are rough prototypes. They are subject to change during implementation as understanding of D&D 5.5e mechanics improves and edge cases are discovered.

## Overview

Single database technology across the entire app: **PostgreSQL**, running as an embedded sidecar process spawned by Electron on launch. One Postgres instance per machine, regardless of whether the user is a DM, a player, or both.

All storage concerns are abstracted behind interfaces, making the underlying implementation swappable in future without touching game logic.

---

## Deployment Model

```
Electron app launches
└── spawns Postgres sidecar (embedded-postgres)
    │
    ├── byo20_server                        (active only if user is hosting a campaign)
    │   ├── game.*
    │   │   ├── campaigns
    │   │   ├── characters
    │   │   ├── character_campaign_state
    │   │   └── character_classes
    │   ├── items.*
    │   │   ├── items
    │   │   ├── containers
    │   │   ├── melee_item_stats
    │   │   ├── ranged_item_stats
    │   │   ├── armor_stats
    │   │   ├── spell_focus_stats
    │   │   ├── consumable_stats
    │   │   └── magic_item_stats
    │   ├── world.*
    │   │   ├── npcs
    │   │   ├── factions
    │   │   ├── character_faction_reputation
    │   │   ├── faction_relationships
    │   │   ├── quests
    │   │   ├── world_zones
    │   │   ├── campaign_agenda
    │   │   ├── campaign_milestones
    │   │   ├── campaign_snapshots
    │   │   └── narration_pool
    │   ├── combat.*
    │   │   ├── encounters
    │   │   └── initiative_entries
    │   ├── log.*
    │   │   ├── sessions
    │   │   ├── event_log
    │   │   ├── combat_log
    │   │   ├── npc_dialogue_log
    │   │   └── party_chat_log
    │   └── memory.*
    │       ├── npc_memories
    │       └── faction_events
    │
    └── byo20_local                         (always active on every machine)
        ├── srd.*
        │   ├── species
        │   ├── backgrounds
        │   ├── classes
        │   ├── subclasses
        │   ├── feats
        │   ├── spells
        │   ├── monsters
        │   ├── items
        │   ├── magic_items
        │   ├── conditions
        │   ├── weapon_masteries
        │   ├── xp_thresholds
        │   ├── loot_tables
        │   └── ruleset_version
        ├── local.*
        │   └── characters
        └── cache.*
            ├── characters
            ├── character_campaign_state
            ├── character_classes
            ├── items
            ├── encounters
            ├── initiative_entries
            ├── event_log
            ├── npcs
            ├── factions
            ├── character_faction_reputation
            ├── quests
            ├── sessions
            ├── combat_log
            └── party_chat_log
```

- Player only → `byo20_local` only (`srd.*`, `local.*`, `cache.*`)
- DM only → both databases (`byo20_server` + `byo20_local`)
- DM + Player → both databases, `byo20_server` handles hosted campaign, `byo20_local` handles local chars and cache

---

## Schemas

### `byo20_server` — Server / DM Side (Source of Truth)

---

#### `campaigns`
The world, the story, the DM's setup.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | |
| `dm_user_id` | TEXT | |
| `status` | TEXT | `active` \| `paused` \| `ended` |
| `phase` | TEXT | `exploration` \| `combat` \| `rest` |
| `world_clock` | INTEGER | In-game minutes elapsed |
| `movement_system` | TEXT | `free` \| `square` \| `hex` |
| `fog_mode` | TEXT | `shared` \| `per_player` |
| `hp_on_levelup` | TEXT | `roll` \| `fixed` — campaign-wide setting, see game-engine.md XP + Leveling |
| `sync_interval_mins` | INTEGER | DM configurable, default `5` |
| `premise` | TEXT | Optional campaign premise provided by DM at creation — **null if not provided** |
| `campaign_length` | TEXT | `short` \| `medium` \| `long` — DM-selected at creation |
| `tone` | TEXT | e.g. `gritty` \| `high_fantasy` \| `dark` \| `comedic` — DM-selected at creation |
| `world_gen_status` | TEXT | `pending` \| `generating` \| `complete` — tracks staged world gen progress |
| `terrain_seed` | TEXT | Seed used for procedural heightmap generation — stored for reproducibility |
| `narration_mode` | TEXT | `economy` \| `balanced` \| `quality` — DM-configured narration tier behaviour, default `balanced` |
| `api_provider` | TEXT | `anthropic` \| `openai` \| `google` \| `ollama` — selected at campaign setup |
| `api_key_blob` | TEXT | safeStorage-encrypted API key blob — **null for ollama** |
| `world_depth` | `TEXT NOT NULL DEFAULT 'standard'` | `'standard'` \| `'epic'`. Set at campaign creation, never changed. Controls world gen depth and lore infrastructure availability. |
| `library_access_unlocked` | `BOOLEAN NOT NULL DEFAULT FALSE` | **Epic only.** Per-party remote Codex lore access. Flipped `true` when the qualifying library quest is completed. Physical library visit populates the Lore tab separately — this flag controls remote access only. Has no effect when `world_depth = 'standard'`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `characters`
Character identity. Portable across campaigns. Created locally before any server connection.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `owner_user_id` | TEXT | |
| `name` | TEXT | |
| `species` | TEXT | TEXT not enum — supports homebrew |
| `background` | TEXT | TEXT not enum — supports homebrew |
| `backstory` | TEXT | Freeform — lore, birthday, origin, anything |
| `stat_str` | INTEGER | |
| `stat_dex` | INTEGER | |
| `stat_con` | INTEGER | |
| `stat_int` | INTEGER | |
| `stat_wis` | INTEGER | |
| `stat_cha` | INTEGER | |

---

#### `character_campaign_state`
How a character exists within a specific campaign. Created when a character joins a campaign.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `character_id` | UUID FK → `characters` | |
| `campaign_id` | UUID FK → `campaigns` | |
| `level` | INTEGER | Default `1` |
| `xp` | INTEGER | Default `0` |
| `hp_current` | INTEGER | |
| `hp_max` | INTEGER | |
| `hit_dice_remaining` | INTEGER | One per level, replenished on long rest |
| `spell_slots` | JSONB | `{ "1": { max: 4, used: 1 }, ... }` — **null for non-spellcasting classes** |
| `conditions` | TEXT[] | `{poisoned, prone}` |
| `death_saves` | JSONB | `{ success: 0, failure: 0 }` |
| `position` | JSONB | `{ x, y, z }` |
| `is_active` | BOOLEAN | Only one row per character can be true |
| `exhaustion_level` | INTEGER | `0`-`6`, default `0` |
| `temp_hp` | INTEGER | Separate pool from regular HP, default `0` |
| `heroic_inspiration` | BOOLEAN | Default `false` |
| `class_resources` | JSONB | Rage uses, focus points, bardic inspiration, channel divinity, etc |
| `prepared_spells` | TEXT[] | Spell IDs — **null for non-spellcasting classes** |
| `weapon_masteries` | TEXT[] | Weapon IDs currently mastered — **null for non-martial classes unless Weapon Master feat taken** |
| `languages` | TEXT[] | Languages the character speaks |
| `skill_proficiencies` | JSONB | `{ "athletics": "proficient", "stealth": "expertise" }` |
| `saving_throw_profs` | TEXT[] | e.g. `{strength, constitution}` |
| `feats_taken` | TEXT[] | SRD feat IDs chosen by the character |
| `concentrating_on` | TEXT | Spell ID currently concentrating on — **null if not concentrating** |
| `tool_proficiencies` | TEXT[] | e.g. `{thieves_tools, herbalism_kit}` |
| `pending_levelup` | JSONB | Outstanding level-up choices (multiclass pick, feat/ASI, subclass, spells) — **null if none pending**, see game-engine.md XP + Leveling |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** Only one row per `character_id` can have `is_active = true`.

---

#### `character_classes`
One row per class the character has levels in. Supports multiclassing. A Fighter 3 / Wizard 2 has two rows.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `character_campaign_state_id` | UUID FK → `character_campaign_state` | |
| `class` | TEXT | TEXT not enum — supports homebrew |
| `subclass` | TEXT | **null until level 3** |
| `class_level` | INTEGER | Level in this specific class |
| `prepared_spells` | TEXT[] | Per-class prepared spell IDs — **null for non-spellcasting classes** |

---

#### `items` (base)
Every item in the campaign world — player inventory, merchant stock, chest contents, world drops. Ownership and location tracked via columns.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `item_id` | TEXT | SRD item key or homebrew |
| `item_type` | TEXT | `melee` \| `ranged` \| `armor` \| `focus` \| `consumable` \| `magic` |
| `description` | TEXT | |
| `base_value` | INTEGER | In copper pieces |
| `unit` | TEXT | `lb` \| `sq_yd` \| `piece` \| `head` — null for most items |
| `owner_type` | TEXT | `player` \| `npc` \| `merchant` \| `world` |
| `owner_id` | UUID | FK to whoever owns it |
| `location_type` | TEXT | `equipped` \| `backpack` \| `container` \| `ground` |
| `location_id` | UUID | Points to `containers.id` if `location_type = container` |
| `quantity` | INTEGER | |

Ownership never transfers to containers — items retain their owner, containers are just a location.

---

#### `containers`
Chests, bags, crates. A location that items can be stored in.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `name` | TEXT | e.g. "Wooden Chest", "Bag of Holding" |
| `location` | JSONB | `{ x, y, z }` or zone id |
| `owner_type` | TEXT | `player` \| `npc` \| `world` |
| `owner_id` | UUID | **null if owned by the world** |

---

#### `melee_item_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `damage_die` | TEXT | e.g. `1d8` |
| `damage_type` | TEXT | `slashing` \| `piercing` \| `bludgeoning` |
| `properties` | JSONB | `["finesse", "versatile"]` |

---

#### `ranged_item_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `damage_die` | TEXT | |
| `damage_type` | TEXT | |
| `range_normal` | INTEGER | ft |
| `range_long` | INTEGER | ft |
| `ammo_type` | TEXT | `arrow` \| `bolt` \| `dart` etc |

---

#### `armor_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `ac` | INTEGER | |
| `armor_type` | TEXT | `light` \| `medium` \| `heavy` \| `shield` |
| `stealth_disadvantage` | BOOLEAN | |
| `str_requirement` | INTEGER | null if none |

---

#### `spell_focus_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `focus_type` | TEXT | `arcane` \| `druidic` \| `holy_symbol` |

---

#### `consumable_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `effect` | JSONB | What it does on use |
| `charges_max` | INTEGER | |
| `charges_current` | INTEGER | **null if no charges** |
| `recharge` | TEXT | `dawn` \| `dusk` \| `never` |

---

#### `magic_item_stats`

| Column | Type | Notes |
|---|---|---|
| `item_id` | UUID PK FK → `items` | |
| `custom_name` | TEXT | e.g. "Oathbreaker" |
| `rarity` | TEXT | `common` \| `uncommon` \| `rare` \| `very_rare` \| `legendary` \| `artifact` |
| `attunement` | BOOLEAN | Requires attunement? |
| `attuned` | BOOLEAN | Currently attuned? |
| `bonus` | INTEGER | `+1` / `+2` / `+3` — **null if no bonus** |
| `charges_max` | INTEGER | **null if no charges** |
| `charges_current` | INTEGER | **null if no charges** |
| `recharge` | TEXT | `dawn` \| `dusk` \| `roll` \| `never` |
| `properties` | JSONB | Named effects, curses, abilities |

---

#### `npcs`
Generated by World Gen, mutated by World Sim.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `name` | TEXT | |
| `faction_id` | UUID FK → `factions` | |
| `location` | JSONB | `{ x, y, z }` or zone id |
| `status` | TEXT | `alive` \| `dead` \| `fled` \| `unknown` |
| `schedule` | JSONB | Array of daily time windows. See game-engine.md → World Sim for shape. |
| `stat_str` | INTEGER | |
| `stat_dex` | INTEGER | |
| `stat_con` | INTEGER | |
| `stat_int` | INTEGER | |
| `stat_wis` | INTEGER | |
| `stat_cha` | INTEGER | |
| `ac` | INTEGER | |
| `speed` | INTEGER | |
| `cr` | TEXT | `"1/4"` \| `"1"` \| `"10"` etc |
| `hp_current` | INTEGER | |
| `hp_max` | INTEGER | |
| `proficiency_bonus` | INTEGER | |
| `traits` | JSONB | |
| `actions` | JSONB | |
| `resistances` | TEXT[] | |
| `immunities` | TEXT[] | |
| `spells` | JSONB | X uses per day, not spell slots — **null for non-spellcaster NPCs** |
| `senses` | JSONB | |
| `languages` | JSONB | |
| `legendary_resistances` | INTEGER | Times per day they can auto-succeed a saving throw — **null for non-boss NPCs** |
| `treasure_type` | TEXT | `individual` \| `hoard` \| `none` — drives loot generation, see game-engine.md Loot |
| `updated_at` | TIMESTAMPTZ | |

---

#### `factions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `goals` | JSONB | `["control the trade routes", "find the artifact"]` |
| `leader_npc_id` | UUID FK → `npcs` | |
| `territory` | JSONB | Zones or locations they control |
| `updated_at` | TIMESTAMPTZ | |

---

#### `character_faction_reputation`
Per-character standing with each faction.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `character_campaign_state_id` | UUID FK → `character_campaign_state` | |
| `faction_id` | UUID FK → `factions` | |
| `reputation` | INTEGER | `-100` to `100` |
| `attitude` | TEXT | `friendly` \| `indifferent` \| `hostile` |
| `updated_at` | TIMESTAMPTZ | |

---

#### `faction_relationships`
Faction-to-faction relationships. Symmetric — enforce `faction_a_id < faction_b_id`, unique constraint on the pair.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `faction_a_id` | UUID FK → `factions` | |
| `faction_b_id` | UUID FK → `factions` | |
| `relationship` | TEXT | `ally` \| `rival` \| `enemy` \| `neutral` |
| `updated_at` | TIMESTAMPTZ | |

---

#### `encounters`
One row per combat encounter. Replaces the old `combat_state` table. Supports parallel encounters (split party).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `status` | TEXT | `active` \| `completed` |
| `round` | INTEGER | Current round number |
| `started_at` | TIMESTAMPTZ | |
| `ended_at` | TIMESTAMPTZ | |

---

#### `initiative_entries`
One row per combatant in an encounter.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `encounter_id` | UUID FK → `encounters` | |
| `entity_id` | UUID | Character, NPC, or AI player |
| `entity_type` | TEXT | `player` \| `npc` \| `ai_player` |
| `initiative_roll` | INTEGER | |
| `position` | INTEGER | Order in turn sequence |
| `is_current_turn` | BOOLEAN | Whose turn it is right now |
| `surprised` | BOOLEAN | Disadvantage on initiative roll — **cleared after initiative is rolled** |

---

#### `sessions`
Individual sittings. Audit trail only, never mutated.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `started_at` | TIMESTAMPTZ | |
| `ended_at` | TIMESTAMPTZ | |
| `summary` | TEXT | AI generated end-of-session summary |

---

#### `combat_log`
Append-only. Never updated.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `encounter_id` | UUID FK → `encounters` | |
| `session_id` | UUID FK → `sessions` | |
| `round` | INTEGER | |
| `actor_id` | UUID | |
| `action_type` | combat_action_type ENUM | |
| `payload` | JSONB | Full action detail |
| `result` | JSONB | Outcome |
| `summary` | TEXT | Human readable description |
| `embedding` | vector(768) | For AI semantic recall — generated by BYO20's bundled Ollama instance (`nomic-embed-text`), never by the DM's LLM provider |
| `timestamp` | TIMESTAMPTZ | |

**`combat_action_type` enum (distinct from `event_type` on `event_log` — separate vocabulary):**
```sql
CREATE TYPE combat_action_type AS ENUM (
  'attack',
  'cast_spell',
  'move',
  'dash',
  'dodge',
  'disengage',
  'help',
  'hide',
  'ready',
  'use_item',
  'bonus_action',
  'reaction',
  'grapple',
  'shove',
  'death_save'
  -- vocabulary expanded during engine implementation
);
```

---

#### `event_log`
Append-only. Every significant thing that happens in the world.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK | |
| `session_id` | UUID FK → `sessions` | |
| `event_type` | event_type ENUM | |
| `payload` | JSONB | Full event detail |
| `summary` | TEXT | Human readable description |
| `embedding` | vector(1536) | For AI semantic recall |
| `timestamp` | TIMESTAMPTZ | |

**`event_type` enum (controlled vocabulary, not freeform TEXT):**
```sql
CREATE TYPE event_type AS ENUM (
  'encounter_started',
  'encounter_ended',
  'trade_transaction',
  'player_moved',
  'spell_cast',
  'item_looted',
  'npc_dialogue',
  'level_up',
  'rest_taken',
  'world_clock_tick',
  'faction_rep_changed',
  'door_unlocked',
  'fast_travel',
  'influence_action',
  'study_action',
  'search_action',
  'utilize_action',
  'grapple_attempt',
  'shove_attempt',
  'weapon_mastery_triggered',
  'heroic_inspiration_used',
  'heroic_inspiration_gained',
  'potion_used',
  'villain_agenda_fired',
  'milestone_completed',
  'quest_created',
  'quest_completed',
  'quest_failed',
  'quest_abandoned',
  'narration_pool_refreshed'
  -- new types added via migration only
);
```

---

#### `npc_memories` (pgvector)
NPC memory for AI context injection. References event_log entries.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `npc_id` | UUID FK → `npcs` | |
| `event_log_id` | UUID FK → `event_log` | |
| `quest_id` | UUID FK → `quests` | **nullable** — identifies quest-originated memories; decay mechanism is universal and applies regardless |
| `embedding` | vector(768) | Generated by BYO20's bundled Ollama instance (`nomic-embed-text`), fixed at 768 dimensions — see ADR 012 |
| `sentiment` | TEXT | `positive` \| `negative` \| `neutral` |
| `significance` | BOOLEAN | Default `false`. If `true`, skips memory decay entirely — use for major plot beats, betrayals, backstory moments. See game-engine.md Quests → Memory & Reputation Decay |
| `created_at_clock` | INTEGER | World clock minutes at time of creation — used for decay computation |

---

#### `faction_events` (pgvector)
Faction memory for AI context injection. References event_log entries.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `faction_id` | UUID FK → `factions` | |
| `event_log_id` | UUID FK → `event_log` | |
| `quest_id` | UUID FK → `quests` | **nullable** — identifies quest-originated faction events |
| `embedding` | vector(768) | Generated by BYO20's bundled Ollama instance (`nomic-embed-text`), fixed at 768 dimensions |
| `rep_delta` | INTEGER | Reputation change caused by this event |
| `created_at_clock` | INTEGER | World clock minutes at time of creation — used for rep drift computation |

---

#### `quests`
Party-wide quest log. One row per quest. Structure is a DAG — see game-engine.md Quests for full design.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `title` | TEXT | |
| `source_type` | TEXT | `npc` \| `world_event` \| `bounty_board` \| `faction` \| `found` \| `companion` \| `rumor` |
| `state` | TEXT | `available` \| `active` \| `completed` \| `failed` \| `abandoned` |
| `faction_id` | UUID FK → `factions` | **nullable** — loose coupling, see game-engine.md Quests |
| `nodes` | JSONB | Full DAG — QuestNode array with objectives, edges, terminal payloads |
| `current_node_id` | TEXT | Pointer into `nodes` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

#### `lore_entries` (pgvector) — Epic only

World lore authored by the AI DM during Epic world gen, plus found documents discovered during play. Chunked by section for lazy loading and vector search. Only populated when `campaigns.world_depth = 'epic'`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `book_id` | TEXT | Slug identifying the parent book, e.g. `history-of-valdris`, `faction-crimson-veil`. Groups sections into a readable book in the Codex. |
| `book_title` | TEXT | Human-readable title shown in Codex UI. |
| `section_title` | TEXT | Chapter or section heading. |
| `page_number` | INTEGER | Ordering within the book. |
| `content` | TEXT | Section prose. TOAST handles large content automatically. |
| `embedding` | `vector(1536)` | For Orchestrator semantic recall — AI DM and NPC Specialist pull relevant lore via similarity search. |
| `source_type` | TEXT | `'world_gen'` \| `'found_document'` \| `'discovered'` |
| `unlocked_at_clock` | INTEGER | **Nullable.** World clock minutes when the party first accessed this entry. `null` = not yet discovered by party. NPCs can still reference lore the party hasn't unlocked — see npc-dialogue.md skill file guidance. |
| `created_at` | TIMESTAMPTZ | |

---

#### `campaign_agenda`
Villain and world-driven events scheduled at campaign generation time. The world moves forward on its own regardless of party action. Unfired events also tracked in Redis as countdown timers; Redis is rebuilt from this table on server restart.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `title` | TEXT | Short label, e.g. "Cult performs ritual in village" |
| `description` | TEXT | Full event detail — what happens, who's involved, what changes |
| `fires_at_clock` | INTEGER | World clock minutes at which this event fires |
| `fired` | BOOLEAN | Default `false`. Set `true` when fired — writes a `villain_agenda_fired` entry to `event_log` |
| `fired_at` | TIMESTAMPTZ | **null until fired** |
| `world_mutations` | JSONB | Fixed-vocab mutation instructions to execute when fired (spawn_npc, add_npc_memory, etc.) — see game-engine.md Quests → World Mutation Instructions |
| `created_at` | TIMESTAMPTZ | |

---

#### `campaign_milestones`
Required narrative gates and major story beats. Generated at campaign creation alongside the world. Not a full campaign DAG — loose anchors the story is built around. See game-engine.md AI Layer → Campaign Structure.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `title` | TEXT | e.g. "Locate the Shadow King's lair" |
| `description` | TEXT | |
| `required` | BOOLEAN | If `true`, gates story progression — finale cannot trigger until this is complete. If `false`, narrative anchor only. |
| `completed` | BOOLEAN | Default `false` |
| `completed_at` | TIMESTAMPTZ | **null until completed** |
| `triggers_pool_refresh` | BOOLEAN | Default `false`. If `true`, completing this milestone triggers a background narration pool refresh pass. |
| `order_hint` | INTEGER | Suggested sequence order — not enforced. Players can hit milestones out of order. |
| `created_at` | TIMESTAMPTZ | |

---

#### `narration_pool`
Pre-generated campaign-flavored narration strings, grouped by event type. Generated at campaign creation using party composition + world tone. Refreshed in the background on major milestone completion. Active pool stays live while refresh runs; swapped atomically on completion.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `event_type` | TEXT | `attack_hit` \| `attack_miss` \| `movement` \| `short_rest` \| `spell_cast` \| `skill_check_pass` \| `skill_check_fail` \| `death_save_success` \| `death_save_failure` \| `level_up` — extensible |
| `content` | TEXT | The pre-generated narration string |
| `generated_at` | TIMESTAMPTZ | |

---

#### `campaign_snapshots`
Rolling window of full campaign state snapshots. Maximum 10 per campaign — oldest deleted when limit reached. Used for DM rollback. Append-only in practice (never updated, only inserted and deleted). Stores mutable game state only — append-only logs (event_log, combat_log, npc_dialogue_log, sessions) are never snapshotted or rolled back.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `trigger_type` | TEXT | `encounter_end` \| `milestone` \| `rest` \| `quest_transition` \| `session_start` \| `session_end` |
| `trigger_ref` | UUID | FK to relevant encounter/quest/session row — **nullable** |
| `label` | TEXT | Human-readable label AI-generated from trigger context — e.g. "After defeating the Cult Leader", "After long rest at the tavern" |
| `state` | JSONB | Full mutable campaign state dump, scoped to this campaign — see below |
| `created_at` | TIMESTAMPTZ | |

**Rolling window logic:**
```
Snapshot triggered
  → count existing snapshots WHERE campaign_id = $id
  → if count < 10 → insert
  → if count = 10 → DELETE WHERE id = (SELECT id ORDER BY created_at ASC LIMIT 1)
                  → insert
```

**Snapshot JSONB shape** — all rows scoped to this campaign:
```json
{
  "campaigns": { ...row },
  "character_campaign_state": [ ...rows ],
  "character_classes": [ ...rows ],
  "npcs": [ ...rows ],
  "factions": [ ...rows ],
  "character_faction_reputation": [ ...rows ],
  "faction_relationships": [ ...rows ],
  "items": [ ...rows ],
  "containers": [ ...rows ],
  "quests": [ ...rows ],
  "world_zones": [ ...rows ],
  "campaign_agenda": [ ...rows ],
  "campaign_milestones": [ ...rows ],
  "encounters": [ ...rows ],
  "initiative_entries": [ ...rows ],
  "npc_memories": [ ...rows ],
  "faction_events": [ ...rows ]
}
```

**Rollback flow:**
```
DM selects snapshot from list of up to 10
  → server pauses
  → SYSTEM message to all clients: "DM rewound to: [label]"
  → for each table in snapshot:
      DELETE FROM table WHERE campaign_id = $campaign_id
      INSERT rows from snapshot JSONB
  → push full STATE_SNAPSHOT to all clients
  → resume
```

Append-only logs are never touched by rollback — `event_log`, `combat_log`, `npc_dialogue_log`, `sessions` always reflect the full real history of the campaign regardless of rewinds.

---

#### `world_zones`
Hex grid zone registry. One row per hex. Tracks generation state and content for lazy world generation.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Surrogate key — used as FK target by encounters and world objects. A 3-column composite FK would be unwieldy. |
| `campaign_id` | UUID FK → `campaigns` | Part of composite UNIQUE constraint |
| `hex_q` | INTEGER | Axial coordinate q — part of composite UNIQUE constraint |
| `hex_r` | INTEGER | Axial coordinate r — part of composite UNIQUE constraint |
| `gen_state` | TEXT | `ungenerated` \| `partial` \| `full` |
| `zone_type` | TEXT | `wilderness` \| `town` \| `dungeon` \| `coastal` \| `mountain` \| `forest` — set on partial gen |
| `content` | JSONB | Location refs, NPC refs, encounter zones, quest hooks present in this hex — populated on full gen |
| `generated_at` | TIMESTAMPTZ | **null until first gen pass** |
| `updated_at` | TIMESTAMPTZ | |

**Unique Constraint:** `(campaign_id, hex_q, hex_r)`

---

#### `npc_dialogue_log`
Raw dialogue history per NPC. Append-only. Provides verbatim short-term recall for NPC specialist context — complements pgvector semantic memory in `npc_memories`. Group conversations only (whole party, not one-on-one) — whisper system deferred post v1.0.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `npc_id` | UUID FK → `npcs` | |
| `session_id` | UUID FK → `sessions` | |
| `speaker_type` | TEXT | `npc` \| `player` |
| `speaker_id` | UUID | `character_id` if player, `npc_id` if npc |
| `content` | TEXT | Raw dialogue verbatim |
| `timestamp` | TIMESTAMPTZ | |

---

#### `party_chat_log`
OOC party chat history. Append-only. Persisted so players can cross-reference conversation from previous sessions. Scoped per session.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `session_id` | UUID FK → `sessions` | |
| `speaker_id` | UUID FK → `characters` | |
| `content` | TEXT | Raw message verbatim |
| `timestamp` | TIMESTAMPTZ | |

---

### `srd` — Static Reference Data
Seeded once on first launch from SRD 5.2 (CC-BY-4.0). Never mutated during gameplay.

---

#### `srd.species`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `size` | TEXT | |
| `speed` | INTEGER | |
| `traits` | JSONB | Darkvision, lucky, etc |

---

#### `srd.backgrounds`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `ability_scores` | JSONB | Which stats get bonuses |
| `skill_profs` | JSONB | |
| `tool_profs` | JSONB | |
| `feat` | TEXT | Starting feat |
| `languages` | TEXT[] | Languages granted by this background |
| `equipment` | JSONB | Starting gear |

---

#### `srd.classes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `hit_die` | TEXT | `d6` \| `d8` \| `d10` \| `d12` |
| `primary_ability` | TEXT | |
| `saving_throw_profs` | JSONB | |
| `armor_profs` | JSONB | |
| `weapon_profs` | JSONB | |
| `skill_choices` | JSONB | Options + how many to pick |
| `spell_slot_table` | JSONB | Slots per level |
| `features_table` | JSONB | What you get at each level |

---

#### `srd.subclasses`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `class_id` | TEXT FK → `srd.classes` | |
| `level_gained` | INTEGER | Always `3` in 5.5e — all subclasses unlock at level 3 |
| `features` | JSONB | Features at each subclass level |

---

#### `srd.feats`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `category` | TEXT | `origin` \| `general` \| `fighting_style` \| `epic_boon` |
| `prerequisite` | JSONB | Level, ability score, class etc |
| `ability_score_increase` | JSONB | |
| `benefits` | JSONB | |

---

#### `srd.spells`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `level` | INTEGER | `0` = cantrip |
| `school` | TEXT | |
| `casting_time` | TEXT | |
| `range` | TEXT | |
| `components` | JSONB | V \| S \| M + material |
| `duration` | TEXT | |
| `concentration` | BOOLEAN | |
| `ritual` | BOOLEAN | |
| `classes` | TEXT[] | Which classes can use it |
| `area_of_effect` | JSONB | Shape + size |
| `damage` | JSONB | Die, type, scaling |
| `save` | TEXT | Which saving throw if any |
| `effects` | JSONB | Ordered array of effect primitives beyond direct damage (conditions applied, zones, buffs, etc.) — see game-engine.md Spells. Each entry may carry a `scaling` object for upcast behavior. A `damage`-type entry here is a pointer back to the `damage` column above, not a duplicate. |

---

#### `srd.monsters`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `size` | TEXT | |
| `type` | TEXT | |
| `alignment` | TEXT | |
| `ac` | INTEGER | |
| `speed` | JSONB | walk \| fly \| swim \| climb \| burrow |
| `hp_average` | INTEGER | |
| `hp_die` | TEXT | |
| `stat_str` through `stat_cha` | INTEGER | |
| `saving_throws` | JSONB | |
| `skills` | JSONB | |
| `damage_resistances` | JSONB | |
| `damage_immunities` | JSONB | |
| `condition_immunities` | TEXT[] | |
| `senses` | JSONB | |
| `languages` | TEXT | |
| `cr` | TEXT | |
| `xp` | INTEGER | |
| `traits` | JSONB | |
| `actions` | JSONB | |
| `bonus_actions` | JSONB | |
| `reactions` | JSONB | |
| `legendary_actions` | JSONB | |
| `treasure_type` | TEXT | `individual` \| `hoard` \| `none` — drives loot generation, see game-engine.md Loot |

---

#### `srd.items`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `item_type` | TEXT | `weapon` \| `armor` \| `gear` \| `tool` |
| `cost` | INTEGER | In copper pieces |
| `weight` | NUMERIC | In lbs |
| `properties` | JSONB | Type-specific stats |

---

#### `srd.magic_items`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `rarity` | TEXT | |
| `item_type` | TEXT | `weapon` \| `armor` \| `wondrous` \| `ring` \| `rod` \| `staff` \| `wand` \| `potion` \| `scroll` |
| `attunement` | BOOLEAN | |
| `charges_max` | INTEGER | |
| `recharge` | TEXT | |
| `properties` | JSONB | |

---

#### `srd.conditions`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `effects` | JSONB | Mechanical effects |

---

#### `srd.weapon_masteries`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `applicable_weapons` | JSONB | Which weapons have this mastery |
| `effect` | TEXT | |

---

#### `srd.xp_thresholds`
XP-to-level lookup table. See game-engine.md XP + Leveling.

| Column | Type | Notes |
|---|---|---|
| `level` | INTEGER PK | 1–20 |
| `xp_required` | INTEGER | Cumulative XP required to reach this level |

---

#### `srd.loot_tables`
BYO20's own equivalent of DMG treasure tables — not DMG content verbatim, since the DMG isn't SRD-licensed. See game-engine.md Loot.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `treasure_type` | TEXT | `individual` \| `hoard` |
| `theme` | TEXT | `arcana` \| `armaments` \| `implements` \| `relics` — **null for individual** |
| `cr_band` | TEXT | CR range this table applies to |
| `coin_range` | JSONB | Min/max coin value |
| `item_pool` | JSONB | Weighted pool of `srd.items` / `srd.magic_items` IDs |
| `item_count_range` | JSONB | Min/max number of non-coin items rolled |

---

#### `srd.ruleset_version`
Single-row metadata table identifying which ruleset version the seeded `srd.*` data was built from. Checked against the active `IRulesEngine` implementation's declared compatibility on every server startup — mismatch is a hard fail, not a warning. Also included in the WebSocket handshake version check: client and host must be on a compatible ruleset version (see transport-layer.md and ADR 011). See game-engine.md Architecture → Ruleset Version Compatibility.

| Column | Type | Notes |
|---|---|---|
| `ruleset_id` | TEXT | e.g. `dnd-5.5e-2024` |
| `srd_version` | TEXT | e.g. `5.2.1` |

---

### `byo20_local` — Player Side (Always Active)

Two databases: `byo20_local` is always active on every machine. `byo20_server` only spins up if the user is hosting. `cache.*` mirrors the exact same table structure as `byo20_server`. Written to by the sync process, read-only for the player UI. Only the player's slice of data is synced — not the full campaign. `local.*` holds characters created before joining any campaign. `srd.*` is seeded once on first app launch, never mutated.

```
byo20_local
├── srd.*                         → seeded on install, never mutated
├── local.characters              → created locally before joining a campaign
└── cache.*                       → synced from byo20_server
    ├── characters                → only their character
    ├── character_campaign_state  → only their rows
    ├── character_classes         → only their rows
    ├── items                     → only items they own
    ├── encounters                → active + recent
    ├── initiative_entries        → from those encounters
    ├── event_log                 → their session history
    ├── npcs                      → NPCs they've encountered
    ├── factions                  → factions they've interacted with
    ├── character_faction_reputation → their rep rows
    ├── quests                    → active + completed quests
    ├── sessions                  → session summaries
    ├── combat_log                → combat history
    └── party_chat_log            → full chat history across sessions
```

---

#### `local.characters`
Characters created locally before joining any campaign. Column shape is identical to `game.characters` — the row migrates to the server unchanged when the player first joins a hosted campaign.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `owner_user_id` | TEXT | |
| `name` | TEXT | |
| `species` | TEXT | TEXT not enum — supports homebrew |
| `background` | TEXT | TEXT not enum — supports homebrew |
| `backstory` | TEXT | Freeform |
| `stat_str` | INTEGER | |
| `stat_dex` | INTEGER | |
| `stat_con` | INTEGER | |
| `stat_int` | INTEGER | |
| `stat_wis` | INTEGER | |
| `stat_cha` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

> **Implementation note:** `game.characters` in `byo20_server` does not currently list `created_at` in this spec. Flag during schema implementation — it is likely an oversight.

---

---

## Redis Configuration

Redis runs as a sidecar process spawned by Electron main on host launch (same as `byo20_server` Postgres — only active when hosting). It is never exposed externally.

Both AOF and RDB persistence are enabled. AOF provides durability (at most one second of data loss on crash). RDB provides fast startup — replaying a large AOF log on restart is slower than loading a snapshot.

```
# Persistence
appendonly yes
appendfsync everysec        # flush AOF to disk every second — good balance of durability vs performance
save 60 1                   # RDB snapshot every 60s if at least 1 key changed

# Memory
maxmemory 256mb             # sufficient for a single self-hosted campaign
maxmemory-policy allkeys-lru  # evict least recently used keys if memory fills

# Network (local only — Redis never exposed externally)
bind 127.0.0.1
protected-mode yes
```

### Key Lifecycle

**Session keys** (`session:{campaign_id}:*`) are created when a session starts and wiped atomically at `SESSION_ENDED`. `world_clock` and `phase` are checkpointed to Postgres on every phase transition and at session end.

**Combat keys** (`combat:{encounter_id}:*`) are created at `INITIATIVE_ROLL` and wiped atomically at `COMBAT_ENDED`. Before wiping, all character state (HP, conditions, temp_hp, spell slots used, class resources, concentrating_on) is flushed to Postgres `character_campaign_state`.

### Crash Recovery

```
Electron launches
  → spawns Postgres sidecar
  → spawns Redis sidecar
  → Redis loads AOF → reconstructs last known state
  → server checks Redis for active session / combat
    → found → resume, push STATE_SNAPSHOT to reconnecting players
    → not found → clean start, load from Postgres
```

If Redis data is unavailable after a crash (e.g. corrupted AOF), the server falls back to the last Postgres checkpoint values for character state and treats there as being no active combat. The DM may need to manually restore combat context.

---

## Sync Strategy

```
Player connects to campaign   → server pushes full snapshot immediately
Every N minutes (default 5)   → server pushes delta (dirty flags only)
Session ends                  → server pushes final snapshot
Player offline                → reads last known state from player_cache
```

- `N` is configurable per campaign by the DM (`sync_interval_mins` on `campaigns`)
- Dirty flags tracked per entity — only changed rows are pushed
- Server is always source of truth — `player_cache` is never written back to server

---

## Interfaces (Swappable)

Both interfaces live in `@byo20/shared`. `@byo20/storage` provides the Postgres implementations. Wired at runtime in `apps/server`. Future implementations can be swapped via config without touching game logic.

### `IGameStateStore` — method surface

```typescript
interface IGameStateStore {
  // Campaigns
  getCampaign(id: string): Promise<Campaign>
  saveCampaign(campaign: Campaign): Promise<void>

  // Characters
  getCharacter(id: string): Promise<Character>
  saveCharacter(character: Character): Promise<void>

  // Character campaign state
  getCharacterCampaignState(id: string): Promise<CharacterCampaignState>
  saveCharacterCampaignState(state: CharacterCampaignState): Promise<void>

  // Character classes
  getCharacterClasses(characterCampaignStateId: string): Promise<CharacterClass[]>
  saveCharacterClass(cls: CharacterClass): Promise<void>

  // Encounters
  getEncounter(id: string): Promise<Encounter>
  saveEncounter(encounter: Encounter): Promise<void>
  getActiveEncounter(campaignId: string): Promise<Encounter | null>

  // Initiative
  getInitiativeEntries(encounterId: string): Promise<InitiativeEntry[]>
  saveInitiativeEntry(entry: InitiativeEntry): Promise<void>

  // NPCs
  getNPC(id: string): Promise<NPC>
  saveNPC(npc: NPC): Promise<void>
  getNPCsInZone(campaignId: string, zoneId: string): Promise<NPC[]>

  // Factions
  getFaction(id: string): Promise<Faction>
  getFactionReputation(characterCampaignStateId: string, factionId: string): Promise<FactionReputation>
  saveFactionReputation(rep: FactionReputation): Promise<void>

  // Items
  getItems(campaignId: string, ownerId: string): Promise<Item[]>
  saveItem(item: Item): Promise<void>
  transferItem(itemId: string, newOwnerId: string, newOwnerType: string): Promise<void>

  // Quests
  getQuest(id: string): Promise<Quest>
  saveQuest(quest: Quest): Promise<void>
  getActiveQuests(campaignId: string): Promise<Quest[]>

  // World zones
  getWorldZone(id: string): Promise<WorldZone>
  saveWorldZone(zone: WorldZone): Promise<void>

  // Append-only logs (never updated or deleted)
  appendEventLog(entry: EventLogEntry): Promise<void>
  appendCombatLog(entry: CombatLogEntry): Promise<void>
  appendNPCDialogue(entry: NPCDialogueEntry): Promise<void>
  appendPartyChat(entry: PartyChatEntry): Promise<void>

  // Snapshots
  createSnapshot(campaignId: string, trigger: SnapshotTrigger): Promise<void>
  getSnapshots(campaignId: string): Promise<Snapshot[]>
  rollbackToSnapshot(snapshotId: string): Promise<void>

  // Sessions
  createSession(campaignId: string): Promise<Session>
  endSession(sessionId: string, summary: string): Promise<void>
}
```

Method signatures evolve as engine implementation begins. Type names above (`Campaign`, `Character`, etc.) resolve to types in `@byo20/shared`.

### `IVectorStore` — method surface

```typescript
interface IVectorStore {
  upsertMemory(memory: NPCMemory): Promise<void>
  queryMemories(npcId: string, context: string, topK: number): Promise<NPCMemory[]>
  upsertFactionEvent(event: FactionEvent): Promise<void>
  queryFactionEvents(factionId: string, context: string, topK: number): Promise<FactionEvent[]>
}
```

---

## Redis Session State

Redis holds live-session data that must survive round-trips faster than a Postgres query allows, primarily during active combat. On server restart, all Redis state is rebuilt from Postgres.

### Key schema

```
campaign:{id}:agenda          → ZSET, scored by fires_at_clock (game-time minutes)
encounter:{id}:effects        → HASH, keyed by entity_id → JSON active effect list
character:{id}:turn_resources → HASH, ActionResources shape (see @byo20/shared)
world:{id}:clock              → STRING, integer — in-game minutes elapsed
```

### Agenda countdown timers

Campaign agenda events are tracked in Redis as a sorted set scored by `fires_at_clock` (game-time minutes, not wall-clock time). On every `world_clock_tick`, the engine queries:

```
ZRANGEBYSCORE campaign:{id}:agenda 0 <current_clock>
```

Events returned by this query are due — the engine fires them and removes them from the set with `ZREMRANGEBYSCORE`. On server restart, the sorted set is rebuilt from `campaign_agenda WHERE fired = false`.

**`EXPIREAT` is wall-clock only and must never be used for game-time events.**

---

## Write-Through Pattern

No game state change is applied without a successful DB write first.

```
Action arrives at Game Engine
       ↓
Engine validates action
       ↓
BEGIN TRANSACTION
  → write new state
  → append to event_log / combat_log
COMMIT
       ↓
Emit WS event to clients

(if transaction fails → reject action, no state change, client notified)
```
