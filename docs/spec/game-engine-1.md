# BYO20 — Game Engine Layer Spec v1.0.0

> **Status:** Complete. All game engine subsystems designed and specced.

> **Note:** All designs in this document are subject to change during implementation as understanding of D&D 5.5e mechanics improves and edge cases are discovered.

---

## Overview

The game engine layer is the rules engine — it owns all D&D mechanics. It is not a rendering engine. No frames, no game loop, no scenes. It is pure server-side logic that receives player actions, validates them against the rules, resolves outcomes, updates state, and emits events.

The engine is entirely server-authoritative. The client is a dumb renderer. No client-side game logic, no optimistic updates. Dice animations on the client mask the server round-trip — the client spins the dice, then resolves to the server's actual roll result when it arrives.

---

## Architecture

### IRulesEngine Interface

All mechanics are called through a single `IRulesEngine` interface. The v1 implementation is `DnD5eRulesEngine`. The interface is hot-swappable — a `DnD6eRulesEngine` or homebrew implementation can be dropped in via config without touching game logic, transport, or storage.

### Ruleset Version Compatibility

`srd.*` data is tied to a specific ruleset version (e.g. SRD 5.2.1 for 2024 rules) — mechanics differ between versions, so a mismatched engine/data pairing produces wrong results, not just missing content. A single-row metadata table, `srd.ruleset_version`, stores the SRD version string and ruleset ID seeded data was built from. Each `IRulesEngine` implementation declares which ruleset version(s) it supports.

On server startup, before anything else loads, the active engine checks its declared compatibility against `srd.ruleset_version`. Mismatch → hard fail, server refuses to start, error message tells the DM to either swap their SRD seed data or swap their engine implementation. No soft warnings — a silent mismatch produces subtly wrong game resolution that's hard to spot mid-session.

```
IRulesEngine
  resolveAttack(context: AttackContext): AttackResult
  resolveSavingThrow(context: SavingThrowContext): SaveResult
  calculateDamage(context: DamageContext): DamageResult
  evaluateConditions(conditions: string[], checkType: CheckType): ModifierResult
  rollDeathSave(combatantId: string): DeathSaveResult
  tickWorldClock(minutes: number): void
  awardXP(encounterId: string): XPAwardResult
  resolveLevelUp(characterId: string): LevelUpResult
  generateLoot(encounterId: string, theme: TreasureTheme): LootManifest
  resolveLootClaims(claims: LootClaim[]): LootDistributionResult
  computeVisibility(observerId: string, mode: ExplorationFog | CombatVision): VisibilityResult
  resolveAoE(context: AoEContext): AoEResult
  castSpell(context: SpellCastContext): SpellCastResult
  resolveSpellEffect(effect: SpellEffectPrimitive, context: EffectContext): EffectResult
  checkConcentration(casterId: string, damage: number): ConcentrationResult
  generateQuest(context: QuestGenContext): QuestGenResult
  applyWorldMutations(instructions: WorldMutationInstruction[]): void
  resolveQuestNode(questId: string, resolution: NodeResolutionContext): QuestNodeResult
  queryMemories(npcId: string, context: string, topK: number): RankedMemoryResult
  computeFactionRepDrift(factionId: string, characterCampaignStateId: string): number
  // ... etc
```

### Relationship to Other Layers

The engine sits between the transport layer (receives `PLAYER_ACTION` messages) and the storage layer (reads/writes Postgres and Redis). It never touches WebSockets directly — it emits events that the server dispatches.

```
PLAYER_ACTION arrives via WebSocket
  → Transport layer routes to Game Engine
  → Engine validates action
  → Engine calls relevant mechanic (combat, movement, etc.)
  → Mechanic reads state from Redis / Postgres
  → Mechanic resolves outcome
  → Engine writes new state to Redis (session data) or Postgres (persistent data)
  → Engine emits result events
  → Transport layer dispatches events to clients
```

### Mechanic Subsystems

Mechanics are called on-demand by the orchestration layer — not all run on every action. Each mechanic reports what happened; orchestration decides if a state transition is warranted. Mechanics never trigger state transitions directly.

```
Game Engine Layer
├── Orchestration
│   ├── State machine         (game phases + transitions)
│   └── Combat sub-states     (initiative, turns, reactions)
└── Mechanics (called by orchestration as needed)
    ├── Combat engine         (attack resolution, damage, crits)
    ├── Action economy        (turn resource tracking + validation)
    ├── Conditions            (modifier query interface)
    ├── Death saves           (0 HP resolution)
    ├── World clock           (in-game time)
    ├── XP + leveling         (post-encounter rewards)
    ├── Loot                  (item drops + distribution)
    ├── Fog of war            (exploration + combat visibility)
    ├── AoE geometry          (area of effect math)
    ├── Spells                (effects beyond damage: conditions, zones, buffs, concentration)
    └── Quests                (DAG-based objectives, generation, decay-weighted memory/rep)
```

### Client-Side Validation

The client performs local validation for UX feedback only — greyed-out action buttons, movement range highlighting, action legality checks. This is not game logic. The server always re-validates every action on receipt. If server and client disagree, server wins.

---

## State Machine

### Top-Level States

```
LOBBY → EXPLORATION ↔ COMBAT
             ↕               ↕
         SHORT_REST      SESSION_ENDED
         LONG_REST
             ↕
         EXPLORATION
```

| State | Description |
|---|---|
| `LOBBY` | Pre-session. Players join, load characters, hit ready. DM starts session. |
| `EXPLORATION` | Active play. Movement, roleplay, skill checks, social interaction. |
| `COMBAT` | Turn-based. Initiative order. See Combat Sub-states. |
| `SHORT_REST` | 1 hour rest. Players spend hit dice. |
| `LONG_REST` | 8 hour rest. Full HP/resource restore. |
| `SESSION_ENDED` | Terminal. Final snapshot pushed, connections closed. |

### Lobby

Flat state — no sub-states. Tracks a `players_ready` map. DM triggers session start when ready. No DM-gating on individual player readiness.

### Exploration

The hub state. All non-combat, non-rest gameplay happens here. Covers movement, roleplay, skill checks, social interaction (the three D&D pillars collapse to one state from the engine's perspective — social interaction is just skill checks within Exploration).

### Combat

See Combat Sub-states section. Combat is a black box at the state machine level.

### Rests

**Short Rest** — 1 hour of in-game time. Players can spend Hit Dice to recover HP. No DM gate — rule-validated. Any fighting immediately breaks a Short Rest (no benefits, back to Exploration).

**Long Rest** — 8 hours of in-game time. Full HP and resource restoration. Rule-validated, not DM-gated.

REST state tracks:
```
rest_type: SHORT | LONG
started_at: world_clock_timestamp
interruptions: number   // long rest penalty counter
```

### Transitions

| From | To | Trigger |
|---|---|---|
| `LOBBY` | `EXPLORATION` | DM starts session |
| `EXPLORATION` | `COMBAT` | Encounter triggered (see Encounter Triggers) |
| `EXPLORATION` | `SHORT_REST` | Party declares short rest |
| `EXPLORATION` | `LONG_REST` | Party declares long rest |
| `COMBAT` | `EXPLORATION` | Combat ends (always) |
| `SHORT_REST` | `COMBAT` | Ambush — see Interrupted Rests |
| `LONG_REST` | `COMBAT` | Ambush — see Interrupted Rests |
| `SHORT_REST` | `EXPLORATION` | Rest completes (1 hr elapsed) |
| `LONG_REST` | `EXPLORATION` | Rest completes (8 hrs elapsed) |
| `EXPLORATION` | `SESSION_ENDED` | DM ends session |
| `COMBAT` | `SESSION_ENDED` | DM ends session |

### Interrupted Rests

When a REST state is interrupted by combat (ambush):

**Short Rest interrupted:**
- Rest cancelled, no benefits
- Transition to COMBAT immediately

**Long Rest interrupted:**
```
elapsed = world_clock.now - rest.started_at

if elapsed >= 1 hour:
  → bank short rest benefits now (hit dice spend already taken counts)
  → rest.interruptions += 1
  → each interruption adds 1 hour to resume cost

if elapsed < 1 hour:
  → cancel, no benefits
```

After combat ends → EXPLORATION. Party votes (AI DM mode) or DM decides (human DM mode) whether to resume the long rest.

### Encounter Triggers

Three sources, all produce the same EXPLORATION→COMBAT or REST→COMBAT event:

| Source | Description |
|---|---|
| Game engine RNG | Rolls every N in-game hours vs danger threshold. N and threshold are DM-configurable per campaign. |
| AI DM proactive | Narrative-driven override. No dice needed. AI fires when context warrants it. |
| Human DM manual | DM triggers encounter directly from admin panel. |

### Voting System

In AI DM mode, decisions normally made by the DM for the party become player majority votes. The AI DM provides narrative context via `NARRATION` alongside the vote but does not vote itself.

Voting applies to: rest declarations, retreating from combat, major quest decisions, splitting the party.

Vote flow:
```
Player proposes action
  → Server creates pending vote
  → VOTE_REQUESTED message to all players
  → Players respond (VOTE_CAST)
  → Majority carries → VOTE_RESOLVED → state transition (or not)
  → AI DM narrates outcome
```

Timeout: if players don't all vote within a configurable window, majority of votes cast wins.

---

## Combat Sub-states

Combat is internally structured as a sequence of sub-states. The transition between them is managed by the orchestration layer.

```
INITIATIVE_ROLL
  → ACTIVE_TURN
    → AWAITING_REACTION (optional, can interrupt at any point)
  → TURN_TRANSITION
  → ACTIVE_TURN (next combatant)
  → ... (repeat per round)
  → COMBAT_ENDED
```

### INITIATIVE_ROLL

Triggered when combat starts. Server collects a d20 + DEX modifier roll from every combatant simultaneously.

Modifiers:
- Surprised → Disadvantage on initiative roll
- Hidden / Invisible → Advantage on initiative roll

Tie-breaking:
- Player vs player tie → player vote among tied players
- Monster vs monster tie → AI DM / human DM decides
- Player vs monster tie → DM decides

Result: `initiative_order[]` array — ordered list of combatant IDs. Fixed for the entire encounter (not re-rolled each round).

Transitions to `ACTIVE_TURN` for the first combatant in order.

### ACTIVE_TURN

One creature is acting. Server tracks their resource state in Redis:

```
current_combatant_id: string
round_number: integer
movement_remaining: integer   // feet remaining this turn
actions_remaining: uint8
bonus_action_used: boolean
reaction_used: boolean        // per round, not per turn — persists across turns
free_interaction_used: boolean
attacks_remaining: uint8      // starts at 1 (or 2+ for Extra Attack classes)
```

Turn ends when:
- Player sends `TURN_END` message, OR
- All resources spent (engine auto-detects), OR
- Turn timeout fires (default 90 seconds, DM-configurable). Silent auto-skip. `TURN_SKIPPED` notification sent to skipped player.

Transitions to `TURN_TRANSITION`.

### AWAITING_REACTION

A reaction trigger fired — opportunity attack, Counterspell, Shield spell, Ready action, end-of-turn effect, etc.

Server:
1. Pauses current `ACTIVE_TURN` (freezes its state in Redis)
2. Notifies eligible reacting creatures
3. Waits for their response (short timeout — players get ~30s, AI players respond instantly)
4. Resolves the reaction
5. Resumes the paused `ACTIVE_TURN` exactly where it left off

`AWAITING_REACTION` can interrupt both `ACTIVE_TURN` and `TURN_TRANSITION` (end-of-turn effects can trigger reactions).

Only one reaction per creature per round. `reaction_used` flag enforces this.

### TURN_TRANSITION

Brief server-side state between turns. Exists for debuggability and logging — visible in event logs, not just implicit logic.

What happens here:
- End-of-turn effects resolve (ongoing damage, condition ticks)
- TIMED active effects checked against world clock (expire if due)
- Turn resource variables reset for next combatant
- Opportunity attack and other reaction triggers checked
- If any reaction triggers → `AWAITING_REACTION` → back to `TURN_TRANSITION`
- Round counter increments when last combatant in order completes

Transitions to `ACTIVE_TURN` for next combatant (or first combatant in new round).

### COMBAT_ENDED

Triggered when:
- All enemies at 0 HP, fled, or surrendered
- Total party kill (TPK)
- DM manually ends combat

What happens:
1. Loop all active effects per combatant
   - `COMBAT` scope → remove
   - `TIMED` / `SUSTAINED` scope → keep, persist to Postgres
2. Flush all Redis combat state to Postgres
3. Trigger XP calculation (see XP + Leveling)
4. Trigger loot generation (see Loot)
5. Push full `STATE_SNAPSHOT` to all clients
6. Transition to `EXPLORATION`

---

## Combat Engine

The combat engine resolves the math for every attack, spell, and damage calculation. It owns roll and damage resolution only. Spell effects beyond damage (conditions applied, zones, buffs, concentration) belong to the Spells subsystem — see Spells section below.

### Two Resolution Paths

**Attack Roll** — used by weapon attacks and some spells (e.g. Fire Bolt):
```
Attacker rolls d20 + ability modifier + proficiency bonus
If total >= target AC → hit
```
Ability modifiers: STR for melee, DEX for ranged, spellcasting ability (INT/WIS/CHA) for spell attacks.

**Saving Throw** — used by most damaging spells (e.g. Fireball):
```
Spell Save DC = 8 + caster proficiency bonus + spellcasting ability modifier
Target rolls d20 + relevant ability modifier
If total >= DC → success (usually half damage)
If total < DC → failure (full damage)
```
The defender rolls. Not the attacker.

### Roll Pipeline

```
1. Query conditions system → derive Advantage / Disadvantage flags
2. Roll d20 (or 2d20 if Advantage/Disadvantage)
   - Advantage → take higher
   - Disadvantage → take lower
   - Both present → cancel, use single roll
3. Check for natural 1 → automatic miss (attack roll only)
4. Check for natural 20 → automatic hit + critical hit flag (attack roll only)
5. Add modifiers (ability score, proficiency, magic bonuses)
6. Compare to AC or DC → hit / miss / success / failure
```

### Damage Pipeline

Runs only on a hit (or saving throw failure):

```
1. Roll base damage dice (weapon die or spell die)
   - Critical hit → roll dice twice, sum both, add modifier once
2. Add ability modifier (STR for melee, DEX for finesse/ranged, none for most spells)
3. Add bonus dice (Sneak Attack, Divine Smite, etc.)
4. Apply flat modifiers (Bless, magical aura effects, etc.)
5. Check target resistance / immunity / vulnerability to damage type:
   - Immunity → damage = 0 (stop here)
   - Resistance → halve (round down)
   - Vulnerability → double
   - Multiple resistances don't stack (still only halved once)
6. Subtract from target HP in Redis
7. Emit damage events
```

### Damage Types

13 types. Each creature can have Resistance, Immunity, or Vulnerability per type. Stored in `srd.monsters` or `world.npcs`. Read into Redis on combat start.

| Category | Types |
|---|---|
| Physical | Bludgeoning, Piercing, Slashing |
| Elemental | Acid, Cold, Fire, Lightning, Thunder |
| Magical | Force, Necrotic, Psychic, Radiant, Poison |

Non-magical Bludgeoning/Piercing/Slashing is commonly resisted by high-CR monsters. Magical weapons bypass this resistance.

### Resolution Context

Every attack produces a resolution context object that flows through the pipeline:

```
AttackResolutionContext {
  path: ATTACK_ROLL | SAVING_THROW
  raw_roll: number
  advantage: boolean
  disadvantage: boolean
  modifiers: number[]
  hit: boolean
  critical: boolean
  damage_dice: DiceRoll[]
  damage_type: DamageType
  bonus_dice: DiceRoll[]
  flat_modifiers: number[]
  target_modifier: NONE | RESISTANT | IMMUNE | VULNERABLE
  final_damage: number
  sources: string[]   // conditions that affected the roll, for display
}
```

### NPC Combat State

NPC base stats (AC, HP, saves, resistances, actions) pulled from `srd.monsters` or `world.npcs` on combat start and loaded into Redis. They exist in Redis only for the duration of combat. On `COMBAT_ENDED`, their final HP is flushed back to `world.npcs` (for persistent campaign NPCs) or discarded (for SRD monsters).

---

## Action Economy

### Per-Turn Resources

Every combatant tracks these in Redis for their active turn:

| Resource | Type | Notes |
|---|---|---|
| `movement_remaining` | integer (feet) | Decrements as movement is used. Difficult terrain costs 2ft per ft moved. |
| `actions_remaining` | uint8 | Starts at 1. Incremented by active effects (e.g. Haste) or class features (e.g. Action Surge) at turn start. Cannot be used for Magic action when granted by Action Surge. |
| `bonus_action_used` | boolean | Only available if a feature/spell/ability explicitly grants one. |
| `reaction_used` | boolean | **Per round, not per turn.** Resets at start of creature's next turn. |
| `free_interaction_used` | boolean | One minor object interaction per turn. |
| `attacks_remaining` | uint8 | Starts at 1. Martial classes with Extra Attack start at 2, 3, or 4 at higher levels. |

### Standard Actions (5.5e 2024)

12 standard actions: Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize.

Influence, Magic, Study, and Utilize are new in 2024.

**Improvised actions** — anything outside the 12 standards — are routed to the DM or AI DM as an `IMPROVISED` action type for adjudication before resolving. The DM/AI decides what ability check (if any) applies and what the outcome is.

### Movement

Movement can be split around actions — move 15ft, attack, move 15ft more. `movement_remaining` is a counter that decrements in real time as the player moves their token.

Movement is validated on finalise only — the client highlights the valid movement range using local character stats from the cache, but the server only validates when the player confirms their final position.

### Opportunity Attacks

When a creature moves out of a square within 5ft of an enemy that can see them (and isn't incapacitated), the enemy can use their reaction to make a melee attack.

Server monitors all movement. After every position update:
```
for each combatant C within 5ft of moving creature's previous position:
  if C can see moving creature
     AND C.reaction_used = false
     AND C is not incapacitated
     AND C is hostile to the mover (see Team Filter below):
    → fire AWAITING_REACTION for C
```

This is the most common `AWAITING_REACTION` trigger.

#### Team Filter and PvP

Hostility is determined by `CombatantState`:

- `teamId` — combatants on the same team are allies and normally cannot OA each other.
- `friendlyFire: boolean` — set by the conditions subsystem when a charm or domination effect forces a combatant to attack its own team. Overrides the team filter for that combatant.
- `pvpEnabled: boolean` — per-campaign flag (`campaigns.pvp_enabled`). When true, allies can trigger OAs against each other (all team-filter checks are skipped).

Skip an OA candidate only when: `isAlly && !candidate.friendlyFire && !pvpEnabled`.

#### Player OA — QTE

When an `AWAITING_REACTION` fires for a **player** combatant:

1. Server sends `REACTION_PROMPT { combatant_id, trigger: "OA", timeout_ms: 2000 }` to the player's client.
2. Client shows a 2-second timed prompt ("Take opportunity attack?").
3. Player responds with `REACTION_RESPONSE { take: true | false }` or the timer expires (treated as `take: false`).
4. Server resolves the melee attack or consumes no reaction and resumes the moving creature's turn.

#### NPC OA — Decision Logic

NPC reactions are resolved server-side at zero LLM cost using a four-gate priority check. Each gate short-circuits the rest:

| Priority | Gate | Decision |
|---|---|---|
| 1 | `npc.reckless = true` | Always take the OA. |
| 2 | Archetype is `"ranged"` or `"caster"` | Skip — these archetypes avoid melee engagement. |
| 3 | `npc.aggression = "passive"` | Skip. `"aggressive"` → always take. |
| 4 | `npc.aggression = "neutral"` + HP > 50 % | Take the OA. Below 50 % HP, skip to avoid risk. |

The `reckless` and `aggression` fields live on the `npcs` table (see storage spec).

### Validation Flow

Every `PLAYER_ACTION` received is validated before resolving:

```
1. Is it this player's turn? (ACTIVE_TURN, correct combatant_id)
2. Does this action cost Action / Bonus Action / Reaction / Movement?
3. Is that resource already spent?
4. Is the action legal given current conditions?
   (e.g. Incapacitated → no actions. Silenced → no verbal spells. Speed 0 → no movement.)
5. Is the target valid? (range, line of sight, etc.)
6. → Valid: resolve
   → Invalid: reject with reason, emit ACTION_REJECTED
```

---

## Conditions

### The 15 Conditions

| Condition | Key Mechanical Effects |
|---|---|
| **Blinded** | Own attacks Disadvantage. Attacks against have Advantage. Auto-fail sight checks. |
| **Charmed** | Can't attack/harm charmer. Charmer has Advantage on social checks. |
| **Deafened** | Auto-fail hearing checks. |
| **Exhaustion** | Stackable 1-6. Each level: -2 to all d20 rolls, -5ft speed. Die at level 6. Long rest removes 1 level. |
| **Frightened** | Disadvantage on attacks/checks while source in line of sight. Can't move toward source. |
| **Grappled** | Speed 0. Ends if grappler incapacitated or out of range. |
| **Incapacitated** | No actions, bonus actions, or reactions. Breaks concentration. |
| **Invisible** | Own attacks Advantage. Attacks against have Disadvantage. Can't be seen normally. |
| **Paralyzed** | Includes Incapacitated. Speed 0. Auto-fail STR/DEX saves. Attacks against Advantage. Hits within 5ft = auto-crit. |
| **Petrified** | Includes Incapacitated. Speed 0. Auto-fail STR/DEX saves. Attacks against Advantage. Resistance to all damage. Immune to poison. |
| **Poisoned** | Disadvantage on attack rolls and ability checks. |
| **Prone** | Own attacks Disadvantage. Melee attacks against Advantage. Ranged attacks against Disadvantage. Can only crawl or spend half speed to stand. |
| **Restrained** | Speed 0. Attacks against Advantage. Own attacks Disadvantage. Disadvantage on DEX saves. |
| **Stunned** | Includes Incapacitated. Speed 0. Auto-fail STR/DEX saves. Attacks against Advantage. |
| **Unconscious** | Includes Incapacitated + Prone. Drop held items. Auto-fail STR/DEX saves. Attacks against Advantage. Hits within 5ft = auto-crit. Unaware of surroundings. |

### Stacking Rules

- A condition doesn't stack with itself — a creature either has it or doesn't.
- Multiple different conditions stack additively — each contributes independently.
- Exhaustion is the only exception — stackable as numeric levels 1-6.
- Exhaustion tracked as a separate `exhaustion_level` integer, not in the conditions array.

### Inheritance

Paralyzed, Stunned, Petrified, and Unconscious all include Incapacitated. Unconscious also includes Prone. These are stored as a single entry in the conditions array — inheritance is resolved at query time, not stored as multiple entries. This means removing Paralyzed doesn't leave a stale Incapacitated entry.

When checking "is this creature Incapacitated?":
```
isIncapacitated = conditions.includes("incapacitated")
               || conditions.includes("paralyzed")
               || conditions.includes("stunned")
               || conditions.includes("petrified")
               || conditions.includes("unconscious")
```

### Condition Scopes

Every active condition (tracked as an `ActiveEffect` in Redis) has a scope:

| Scope | Description | Cleared |
|---|---|---|
| `COMBAT` | Combat-specific effect (e.g. Dodge action's Disadvantage effect) | At `COMBAT_ENDED` |
| `TIMED` | Has explicit `expires_at` world clock timestamp | When world clock passes `expires_at` |
| `SUSTAINED` | Persists until a specific counter-action | Prone → stand up. Grappled → break grapple. |

### ActiveEffect Shape (Redis)

```
ActiveEffect {
  target_id: string       // who the effect is on
  source_id: string       // who applied it
  source: string          // "prone", "slow", "bless", etc.
  scope: COMBAT | TIMED | SUSTAINED
  expires_at: number | null  // world clock minutes, null if COMBAT or SUSTAINED
  stat: string            // what it affects
  modifier: any           // how it affects it
}

// Stored per combatant in Redis:
combatEffects: Map<target_id, ActiveEffect[]>
```

### Query Interface

The conditions system exposes a single query function that the combat engine calls before every roll:

```
getModifiers(conditions: string[], checkType: CheckType) → ModifierResult

ModifierResult {
  advantage: boolean
  disadvantage: boolean
  autoCrit: boolean
  autoFail: boolean
  speedOverride: number | null
  actionsBlocked: boolean
  sources: string[]   // which conditions caused these modifiers
}
```

`sources[]` is consumed by the GUI ("Advantage — target is Prone, Blinded") and by the combat log for rich event descriptions.

### Advantage / Disadvantage Resolution

```
1. Collect all Advantage sources affecting this roll
2. Collect all Disadvantage sources affecting this roll
3. If both lists are non-empty → cancel to normal single d20 roll
4. If only Advantage → roll 2d20, take higher
5. If only Disadvantage → roll 2d20, take lower
6. If neither → normal single d20 roll
```

Multiple sources on the same side don't stack — one Advantage source and three Advantage sources produce the same result.

### Implementation

Condition effects are hardcoded in the engine for v1. The `srd.conditions` Postgres table stores human-readable descriptions for UI display only. Homebrew conditions are a v2 concern.

---

## Death Saves

### Trigger

At the start of a combatant's `ACTIVE_TURN`, if their HP = 0, the engine triggers a death saving throw instead of a normal turn.

### Resolution

Roll d20, no ability modifier, DC 10:

| Roll | Result |
|---|---|
| Natural 20 | Instant revival — regain 1 HP, regain consciousness, rejoin combat |
| 10-19 | One success |
| 2-9 | One failure |
| Natural 1 | Two failures |

Three successes → **Stable** (unconscious at 0 HP, no more saves).
Three failures → **Dead**.

Successes and failures do not need to be consecutive. Three successes at any point = stable regardless of failure count, and vice versa.

### Taking Damage at 0 HP

Any damage dealt to a creature at 0 HP bypasses normal damage calculation:

```
damage received at 0 HP:
  → if crit → two death save failures
  → if normal hit → one death save failure
  → if excess damage >= HP max → instant death (skip saves entirely)
```

Instant death check: if a hit reduces a creature to 0 HP and the remaining damage equals or exceeds their HP maximum, they die outright without any death saving throws.

Since any attack against an unconscious creature within 5ft is automatically a critical hit (Unconscious condition), a melee enemy standing over a downed player always causes two failures per hit.

### Stabilization

Any HP restored above 0 immediately ends the dying state, resets `death_saves` to `{ success: 0, failure: 0 }`, and the creature regains consciousness.

A creature can also be stabilized without healing:
- Ally uses Help action → DC 10 Wisdom (Medicine) check → on success, creature is Stable
- Spare the Dying spell
- Healer's Kit (Utilize action)

**Stable**: unconscious at 0 HP, no more death saves. Regains 1 HP after 1d4 hours (not a rest). If a stable creature takes any damage, it loses stability and resumes making death saves.

### Knock Out Mechanic

On any finishing melee blow, the attacker may choose to knock the target out instead of kill them. Server intercepts this choice:
- Target HP set to 1
- Unconscious condition applied
- No death saves involved
- Creature is considered stable

### Death Save State (Redis)

```
death_saves: { success: number, failure: number }
stable: boolean
died_on_round: number | null   // round number when 3 failures reached
```

Reset to `{ success: 0, failure: 0, stable: false, died_on_round: null }` whenever HP is restored above 0.

### Character Death

Three failures → `deceased` flag set on `character_campaign_state` in Postgres. Character record is NOT deleted — resurrection spells can clear the flag. Player can create a new character and rejoin the campaign.

### NPC Death Saves

NPCs die at 0 HP by default. The AI DM sets a `death_saves_enabled: boolean` flag per NPC at spawn time — part of the encounter generation payload. Only named, narratively significant NPCs should receive `true`. Server never re-evaluates this flag after spawn.

### Revivify Window

Revivify (a resurrection spell) must be cast within 1 minute of death. In BYO20, 1 minute = 10 rounds.

```
Revivify window valid if: current_round - died_on_round <= 10
```

`died_on_round` is stamped in Redis when three failures are reached. The combat engine checks this window when Revivify is cast.

### Visibility

Death save rolls are public — all clients see each roll result as it happens. Pushed via `STATE_DELTA` on every save. DM-configurable to private per campaign (future option).

---

## World Clock

### Overview

The world clock tracks in-game time as an integer count of minutes elapsed since campaign start. It is the authoritative time source for all time-dependent mechanics.

### Storage

Live in Redis during a session (`session:{campaign_id}:world_clock`). Checkpointed to `campaigns.world_clock` in Postgres on every phase transition and at session end.

### Tick Sources

| Source | Amount | When |
|---|---|---|
| Combat round | +0.1 min (6 seconds) | Automatically on every round increment in TURN_TRANSITION |
| Exploration movement | DM-configurable | Elapsed time as party travels |
| Rest | +60 min (Short Rest) or +480 min (Long Rest) | On rest completion |
| DM manual | Any amount | DM can advance the clock directly |

### What the Clock Drives

| Mechanic | How |
|---|---|
| Rest duration | `rest.started_at` vs `world_clock.now` — determines when rest completes and whether long rest banked short rest benefits |
| Encounter RNG | Engine checks danger threshold every N in-game hours (DM-configurable) |
| TIMED active effects | `effect.expires_at` vs `world_clock.now` — effects expire when clock passes their timestamp |
| Revivify window | `current_round - died_on_round <= 10` (round arithmetic, not clock) |

---

## World Sim

World Sim is the subsystem that moves NPCs through their daily schedules as the world clock advances. It is not a background loop — it fires as a hook on every world clock tick.

### NPC Schedule

Each NPC has a `schedule` column in `world.npcs` (JSONB). It is an array of daily time windows generated by the DM Specialist at world gen time.

**Shape:**

```json
[
  {
    "from": 0,
    "to": 360,
    "label": "sleeping",
    "location_id": "uuid → world_objects.id",
    "travel_mode": "walk",
    "force": false
  },
  {
    "from": 360,
    "to": 480,
    "label": "breakfast",
    "location_id": "uuid → world_objects.id",
    "travel_mode": "walk",
    "force": false
  },
  {
    "from": 480,
    "to": 1080,
    "label": "working",
    "location_id": "uuid → world_objects.id",
    "travel_mode": "walk",
    "force": true
  }
]
```

**Fields:**

| Field | Type | Notes |
|---|---|---|
| `from` | INTEGER | Window start — minutes since midnight (0–1439) |
| `to` | INTEGER | Window end — minutes since midnight (0–1439) |
| `label` | TEXT | Human-readable activity label. Used by the NPC Specialist for context. |
| `location_id` | UUID | FK → `world_objects.id`. Destination for this window. |
| `travel_mode` | TEXT | `walk` \| `horse`. Determines speed used for feasibility check and position interpolation. |
| `force` | BOOLEAN | If `true`, NPC always attempts this window regardless of feasibility. Set by DM Specialist at gen time for essential activities (duty post, opening shop, returning home, rest). |

Time-of-day is derived from `world_clock mod 1440`.

### Window Evaluation

Fires once when the world clock enters a new schedule window for an NPC:

```
Clock enters new window
  → resolve destination: SELECT position FROM world_objects WHERE id = window.location_id
  → if force = true:
      → always commit, begin moving
  → if force = false:
      → distance   = euclidean(npc.current_position, destination.position)
      → speed      = walk speed or mount speed from npcs.speed / travel_mode
      → time_avail = (window.to - current_time_of_day) * 60  // in seconds
      → feasibility = clamp(time_avail / (distance / speed), 0.0, 1.0)
      → read npcs.traits → derive determination modifier
        (hardworking, dutiful, lazy, etc. — ranges from -0.3 to +0.3)
      → attempt if (feasibility + determination) >= 0.5
      → else: skip window, NPC stays put
```

The decision is trait-driven, not hardcoded math. A hardworking NPC pushes through marginal feasibility. A lazy NPC stays put unless it's easy. The DM Specialist encodes this at world gen time via `traits` and `force` flags — the engine reads them, it does not interpret personality itself.

### Movement

Once a window is committed, position is updated on every subsequent clock tick until the NPC reaches the destination:

```
On clock tick (NPC has committed window):
  → elapsed    = current_clock - window_committed_at
  → progress   = clamp((elapsed * speed) / total_distance, 0.0, 1.0)
  → position   = lerp(src_position, destination.position, progress)
  → UPDATE world.npcs SET location = position WHERE id = npc_id

  → is NPC in the party's active scene?
      yes → emit NPC_LOCATION_UPDATE { npc_id, position }
              → clients reposition NPC in the 3D scene
      no  → silent Postgres update only, no event emitted
```

`NPC_LOCATION_UPDATE` is a WS event type defined in `transport-layer.md → Message Taxonomy`.

When `progress = 1.0`, the NPC has arrived. No further movement updates until the next window.

### Scope

- NPCs only move within the same settlement. No cross-zone or cross-settlement schedule movement in v1.
- Destinations are always known `world_objects` refs. Dynamic/AI-assigned destinations are deferred post-v1.
- No pathfinding around obstacles in v1 — position interpolates directly between src and dst. Navmesh-aware pathfinding is a v1.1 enhancement.

---

## XP + Leveling

### Overview

BYO20 is always XP-based. There is no separate milestone mode. Milestone-style awards are instead handled as DM discretion within the XP system — the DM (human or AI) can award bonus XP or grant a level directly for narrative reasons, outside of combat, at any time.

### XP Sources

| Source | Trigger | Amount |
|---|---|---|
| Combat | `COMBAT_ENDED` | Sum of defeated monsters' XP values (from `srd.monsters.xp`), split evenly |
| Non-combat challenge | DM discretion (human or AI) | DM-determined amount |
| DM manual award | Anytime | Any amount, or a direct level grant |

DM-awarded XP and direct level grants are not voted on, even in AI DM mode. Rewards are DM authority, not a party decision — the same way loot isn't voted on by the party for "do we want this."

### Combat XP Award

Fires once at `COMBAT_ENDED`, batched — not ticked per kill mid-fight.

```
COMBAT_ENDED
  → sum XP value of all defeated monsters in the encounter
  → divide evenly among all combatants who were in initiative_order at any point
  → includes characters who died, fled, joined late, or were AI players
  → write awarded XP to character_campaign_state.xp for each eligible character
  → for each character, check XP against srd.xp_thresholds
  → if threshold crossed → trigger Level-Up Flow
  → emit XP_GRANTED to all clients
```

"Eligible" is intentionally broad — anyone in the initiative order at any point gets a full share. No proration by rounds active, no penalty for dying mid-fight. Matches table convention; round-based proration was considered and explicitly rejected as unnecessary complexity that punishes bad luck.

AI players count as combatants for XP division, same as human-controlled characters.

### Level-Up Flow

Level-up is immediate, not deferred. The moment a character's XP crosses a threshold:

```
1. character_campaign_state.level increments immediately
2. Automatic benefits apply instantly:
   - hp_max increases (roll or fixed, per campaign's hp_on_levelup setting)
   - Proficiency bonus updates if threshold level (5, 9, 13, 17)
   - Spell slots update per class's spell_slot_table
3. Any choices required (feat/ASI, subclass pick, new spell selection, multiclass
   level allocation) are NOT resolved automatically — flagged as pending
4. LEVEL_UP message broadcasts to all clients
5. Other players are unaffected and continue play uninterrupted
```

Multiclassing: XP is tracked at the character level, not per-class. When a level-up fires, the player chooses which `character_classes` row receives the new `class_level` — this choice is one of the pending choices below.

### Pending Choices

Stored in `character_campaign_state.pending_levelup` (JSONB), null when nothing is outstanding. Holds whichever of the following are unresolved for the character's current level: which class gets the level (multiclass), feat/ASI selection, subclass pick (level 3), new spell selections.

The player resolves pending choices in their own time — gameplay is not blocked waiting on them.

**Combat exception:** if the level-up choice prompt would surface while it's the character's `ACTIVE_TURN`, it's suppressed until `TURN_END` fires for that combatant. Mechanical benefits (HP, etc.) still apply instantly even mid-turn — only the choice UI is deferred, so a player isn't tabbing through feat options while the table waits on them.

### HP on Level-Up

Campaign-wide setting, not per-player or per-level: `campaigns.hp_on_levelup` — `roll` \| `fixed`. Set once at campaign creation, applies to every character's every level-up for that campaign's lifetime.

- `roll` — roll the class hit die + CON modifier (minimum 1)
- `fixed` — take the fixed average for the hit die (e.g. 6 for a d10), rounded up + CON modifier

### Storage

New columns: `campaigns.hp_on_levelup` and `character_campaign_state.pending_levelup`. New table: `srd.xp_thresholds`. Full definitions in storage-layer.md.

---

## Loot

### Overview

Each monster carries a treasure designation — Individual, Hoard, or None — sourced from `srd.monsters` (or `world.npcs` for persistent campaign NPCs). The engine generates loot deterministically from BYO20's own tables; the AI DM only picks the narrative framing.

### Treasure Themes

Four themes, matching 2024 conventions: Arcana (magical items + mystical gemstones), Armaments (coin + combat-focused magic items), Implements (coin + utility-focused magic items), Relics (art objects + religiously-themed magic items).

The AI DM selects the theme per encounter based on narrative context (a cult lair leans Relics, a war camp leans Armaments, etc.). Human DM can override or set manually.

### Generation

```
COMBAT_ENDED
  → for each defeated monster:
      if treasure_type == None → skip
      if treasure_type == Individual → roll against srd.* individual loot table
      if treasure_type == Hoard → contributes to the encounter's single hoard roll
  → if any Hoard contributions exist → roll once against srd.* hoard table for
    the encounter's theme
  → coins from all sources summed and auto-split equally to participating
    characters' wallets — no survey, no claim step
  → all non-coin items compiled into a single loot manifest for the encounter
  → emit LOOT_GRANTED with the manifest
```

The loot tables themselves are BYO20's own equivalent structure (CR-scaled value ranges and item counts per theme) seeded into `srd.*` — not the DMG tables verbatim, since those are paid content outside the SRD license. The underlying math (value scaling by CR) is well-documented community knowledge; the specific table contents are recreated independently.

### Distribution — Loot Survey

Everything except coins goes through a post-combat survey:

```
LOOT_GRANTED fires with full manifest
  → all participating players get survey UI: items listed, attunement-required
    items tagged
  → players submit claims simultaneously — no turn order, no rush
  → timeout fires (default 60s, DM-configurable per campaign)
  → server resolves:
      - item claimed by exactly one player → goes to them
      - item claimed by multiple players → AI resolves based on class/role fit
        from the character roster (e.g. a healing item to the party's healer)
      - item claimed by no one → goes to the shared camp stash container
  → final distribution written to Postgres
  → STATE_DELTA pushed to all clients
```

This is a claim system, not a vote — each player picks what they want for themselves, not who should get what. Simpler and faster than voting per item.

### Storage

New table: `srd.loot_tables`, holding BYO20's own equivalent loot structure (not DMG content verbatim, since the DMG isn't SRD-licensed). New column: `npcs.treasure_type` / `srd.monsters.treasure_type` (`individual` \| `hoard` \| `none`). Full definitions in storage-layer.md.

Unclaimed items resolve to the existing `containers` table — a `world`-owned container representing the party's camp stash, created once per campaign on first use.

---

## Fog of War

Two distinct systems: Exploration Fog (the persistent "have I been here" map) and Combat Vision (per-turn "what can I see right now" during a fight). They share the underlying light/perception primitives but operate independently.

### Exploration Fog

**Modes** (set via existing `campaigns.fog_mode` — `shared` \| `per_player`):
- `shared` — any party member revealing an area reveals it for the whole party
- `per_player` — each character maintains their own revealed-area mask. Regardless of mode, players can always see their teammates' tokens, even in areas they personally haven't explored.

**Reveal trigger:** line of sight required, not just proximity. Standing next to a closed door doesn't reveal the room behind it — the character has to actually be able to see into a space for it to reveal.

**Visibility radius:** driven by two factors working together — the character's active light source sets the maximum range at which anything could be seen at all, and passive Perception determines whether something within that range is actually noticed (e.g. a hidden door 15ft away in torchlight might still go unnoticed if passive Perception is too low).

**Persistence:** revealed forever once explored. No automatic re-fogging — a space a character has physically been to doesn't become unknown again. The DM can manually re-fog a specific area for narrative reasons (a spell, a collapsed passage, etc.), but this is a DM tool, not automatic system behavior.

### Combat Vision

Always per-player, regardless of the campaign's `fog_mode` setting. Light levels and darkvision mean different characters perceive the same battlefield differently — flattening this to shared vision during combat would remove the tactical layer entirely.

**Three light levels modelled in full:** bright, dim, darkness — each with their full 2024 mechanical effects (obscurement, Perception disadvantage, blinded-when-trying-to-see, etc.), not a simplified version.

**Darkvision:** read per-character from existing character stats. Affects only what that specific player's client renders — not broadcast to others.

**Light sources:** modelled as `ActiveEffect` entries in Redis, using the same structure as conditions (see Conditions section). A carried torch is `SUSTAINED` (persists until dropped/extinguished). A Light or Darkness spell is `TIMED` (expires per world clock against the spell's duration). Each light source carries a radius defining its bright/dim boundary.

**Server-side filtering (no client-side cheating):** the server computes each player's actual visible set of entities and only sends those in `STATE_DELTA` / `STATE_SNAPSHOT` payloads for that player. The full game state is never sent to a client that shouldn't be able to see part of it — visibility is enforced before the network send, not trusted to client-side rendering. Negligible latency impact: visibility checks are simple geometry against a small combatant count, well under the cost of the LLM narration step that already dominates response time.

### Server-Side Heightmap Note

Since maps are 3D heightmaps, line of sight is computed as a raycast from observer to target against the actual terrain mesh — elevation matters, a valley or hill can block or extend sight lines in ways flat 2D maps can't represent. The server holds the heightmap data (it already owns world state) and performs this geometry directly against it; no separate flattened representation is needed.

---

## AoE Geometry

### Shapes

All six 2024 shapes are supported: cone, cube, cylinder, line, sphere, emanation.

| Shape | Origin Rule |
|---|---|
| Cone | Extends from origin in a chosen direction; origin not included unless the effect says otherwise |
| Cube | Origin on a face of the cube; not included unless stated otherwise |
| Cylinder | Origin at center of the circular base; included |
| Sphere | Origin included |
| Line | Straight path with a width from origin; not included unless stated otherwise |
| Emanation | Extends from a creature/object in all directions; moves with its source |

### Terrain Interaction

Terrain does not block AoE. The geometric shape always resolves in full regardless of walls, cover, or elevation — this is a deliberate simplification over modelling line-of-sight-per-target within the blast, matching how most spells like Fireball are intended to function (it spreads around corners).

### Emanation — Special Case

Unlike the other five shapes, which resolve once at a fixed origin point, Emanation is attached to and moves with its source creature. The affected-entity set is recalculated every time the source's position updates — a creature moving in or out of the emanation's radius changes the affected set in real time, not just at cast.

### Origin Selection

```
Player selects spell/effect
  → client renders a shape preview anchored to the aim point, using cached
    spell range/shape data — UX feedback only
  → player confirms target point
  → server validates the point is within the spell's range from the caster
  → server resolves the shape from that origin against the actual terrain/
    entity positions — server is final authority
  → invalid (out of range) → action rejected
```

### Affected Entity Detection

Whether a creature counts as "in" the AoE depends on `campaigns.movement_system`:

```
if movement_system == free:
  → bounding volume (sized to the creature's size category) checked for
    intersection with the AoE shape — not a single center-point check, so a
    creature clipped by the shape's edge is still caught
if movement_system == square | hex:
  → same bounding volume intersection, plus the 2024 "≥50% of the occupied
    cell is covered by the shape" rule applied on top
```

Bounding volume over point-check was chosen even in free movement mode for consistency with the spirit of the grid rule (meaningfully in the blast, not just exact-center-outside-it) and to avoid Fireball-edge-case disputes.

---

## Spells

### Overview

The spells subsystem owns everything about spellcasting except direct attack-roll/saving-throw damage resolution, which the combat engine already handles (see Combat Engine). Spells owns: cast-time validation (slots, components, rituals), concentration tracking, and every non-damage effect a spell produces — conditions applied, persistent zones, buffs/debuffs, and the handful of effects that need bespoke handling (transformation, teleportation, summoning, etc.).

### Casting Validation

Casting a spell goes through the same validation pipeline as any other `PLAYER_ACTION` (see Action Economy → Validation Flow), with spell-specific checks layered on:

```
1. Is the spell known/prepared by this character? (character_campaign_state.prepared_spells
   or character_classes.prepared_spells for multiclass)
2. Is a spell slot available at the spell's level or higher? (cantrips and rituals exempt)
3. Are components met?
   - Verbal (V) → blocked if Silenced
   - Somatic (S) → blocked if both hands occupied/restrained
   - Material (M) → consumed if costly, otherwise assumed present (spellcasting focus / component pouch)
4. Does the action economy resource exist for this casting time?
   (Action, Bonus Action, Reaction, or 1+ minute → Magic action each turn + Concentration)
5. Is the target/origin valid? (range, line of sight per AoE Geometry rules)
6. → Valid: resolve
   → Invalid: reject with reason, emit ACTION_REJECTED
```

### Spell Slots & Cantrips

Slots are tracked per character in `character_campaign_state.spell_slots` (existing column, storage-layer.md). Casting a spell of level N expends one slot of level N or higher — engine always defaults to the lowest eligible slot unless the player explicitly chooses to upcast. Cantrips (level 0) consume no slot and have no daily limit.

### Upcasting

Casting with a slot higher than the spell's base level applies the spell's upcast scaling, sourced directly from the spell's official "At Higher Levels" text — not engine-invented math. Each `srd.spells.effects` entry can carry an optional `scaling` object:

```
scaling: {
  type: "linear" | "tiered"

  // linear — most spells: effect grows by a fixed amount per slot level above baseline
  per_level_above: number       // baseline slot level
  increment: string | number    // e.g. "+1d6" or "+1 target"

  // tiered — irregular jumps (e.g. duration tiers), explicit per-level table
  tiers: { slot_level: number, value: string | number }[]
}
```

The engine reads whichever shape is present and applies it generically — no per-spell hardcoded scaling logic.

### Concentration

Tracked via the existing `character_campaign_state.concentrating_on` column (spell ID, null if not concentrating).

```
Cast a new concentration spell while already concentrating
  → previous spell's effects removed immediately, no save, no warning
  → new spell becomes the tracked concentration

Take damage while concentrating
  → Constitution saving throw, DC = max(10, floor(damage / 2)), capped at 30
  → fail → concentration broken, spell's effects removed
  → succeed → concentration maintained

Gain Incapacitated condition OR die
  → concentration ends automatically, no save
```

Range and line of sight don't matter for maintaining concentration once a spell is cast — only damage and the Incapacitated/death triggers above can break it.

### Effect Primitives

Spell effects beyond direct damage are described in `srd.spells.effects` (new JSONB column) as an ordered array of typed primitives, not hardcoded per-spell engine logic and not freeform text. Fixed vocabulary:

| Primitive | Description |
|---|---|
| `damage` | Points to the combat engine's existing attack-roll/saving-throw damage pipeline |
| `heal` | Restores HP |
| `apply_condition` | Produces an `ActiveEffect` — reuses the Conditions system (see Conditions) |
| `remove_effect` | Strips an existing `ActiveEffect` (e.g. Dispel Magic) |
| `modify_roll` | Buff/debuff to attack rolls, saves, or checks (e.g. Bless, Bane) |
| `create_zone` | AoE shape (see AoE Geometry) + a persisting `ActiveEffect`; affected entities rechecked every round, same mechanism as Emanation recalculation |
| `transform` | Replaces a creature's active stat block temporarily (Polymorph) |
| `teleport` | Repositions a creature/object |
| `summon` | Spawns a new combatant entity |
| `grant_resistance` / `grant_immunity` | Adds a temporary damage-type modifier |
| `force_reroll` | Forces a reroll of a recent die roll |
| `interrupt_cast` | Hooks into `AWAITING_REACTION` to cancel another creature's in-progress cast (Counterspell) |
| `dm_adjudication` | Fallback for genuinely freeform effects the rules themselves hand to DM judgment (e.g. Wish's "Reshape Reality"). Routed the same way as `IMPROVISED` actions. Requires the AI DM to have world-mutation tool access (MCP layer) rather than narration-only — flagged as a forward dependency on the AI/MCP layer, not designed here. |

Every `apply_condition`, `modify_roll`, and `create_zone` entry carries the same `scope` (`COMBAT` \| `TIMED` \| `SUSTAINED`) and expiry shape as the existing `ActiveEffect` structure (see Conditions → ActiveEffect Shape), so the combat engine's single `getModifiers()` query interface handles spell-induced effects identically to conditions and light sources — no parallel system.

### Persistent Zones

A zone (Web, Spike Growth, Cloud of Daggers) is generated once via the same AoE geometry shapes already designed, then persists as an `ActiveEffect` with a duration. Every round, and every time an entity moves, the affected-entity set is rechecked against the zone's shape — identical mechanism to how Emanation already recalculates on source movement, just with a stationary origin instead of one that follows a creature.

### Reaction Spells

Spells like Counterspell and Shield that trigger off another creature's action use the existing `AWAITING_REACTION` combat sub-state (see Combat Sub-states) — no new interrupt mechanism needed. The `interrupt_cast` primitive fires the same reaction flow as an opportunity attack: pause the acting creature's turn, resolve the reacting spell, resume where it left off.

### Rituals

Casting a spell as a Ritual takes 10 minutes longer and expends no spell slot, but requires the spell to be prepared (Wizards are the sole exception — they can ritual cast directly from their spellbook unprepared, tracked as a class-specific flag). At 6 seconds per combat round, a 10-minute ritual is roughly 100 rounds — never practical mid-fight. Rituals are exploration-only by nature; the engine doesn't need a special combat-state gate beyond what already exists, since no one will realistically declare a 10-minute cast while `COMBAT` is active.

### Storage

New column on `srd.spells`:

| Column | Type | Notes |
|---|---|---|
| `effects` | JSONB | Ordered array of effect primitives (see Effect Primitives above), each optionally carrying a `scaling` object for upcast behavior |

New table:

#### `srd.ruleset_version`

| Column | Type | Notes |
|---|---|---|
| `ruleset_id` | TEXT | e.g. `dnd-5.5e-2024` |
| `srd_version` | TEXT | e.g. `5.2.1` |

Single row. Checked against the active `IRulesEngine` implementation's declared compatibility on server startup (see Ruleset Version Compatibility, Architecture section). Full definitions in storage-layer.md.

---

## Quests

### Overview

The quest subsystem tracks party-wide objectives — not per-character. One shared quest log, matching how every other party-facing system (loot, XP, encounters) already treats "the party" as the unit. Quests can be authored by the DM (human or AI) or generated dynamically by the AI DM, DM-configurable.

A quest is structured as a **DAG** (directed acyclic graph), not a linear sequence — nodes carry an objective, terminal nodes carry rewards/consequences, and edges between nodes are matched deterministically against actual play outcomes. The quest subsystem deliberately reuses existing engine infrastructure wherever possible (`ActiveEffect`, `getModifiers()`, NPC memory, `event_log`, the vote system) rather than inventing parallel systems.

### Quest States

```
AVAILABLE → ACTIVE → COMPLETED
                   ↘ FAILED
                   ↘ ABANDONED
```

| State | Description |
|---|---|
| `AVAILABLE` | Quest exists, party knows about it (or could), not yet committed |
| `ACTIVE` | Party has accepted — see Accepting a Quest |
| `COMPLETED` | A success terminal node was reached |
| `FAILED` | A failure terminal node was reached |
| `ABANDONED` | Party walked away on purpose |

### Accepting a Quest

Moving a quest from `AVAILABLE` to `ACTIVE` goes through the existing **Voting System** (see State Machine → Voting System) — same mechanism as rest declarations, retreating from combat, and splitting the party. Taking on a quest is a party-level commitment, not an individual pickup like a loot claim.

### Quest Structure (DAG)

```
Quest {
  id: string
  campaign_id: string
  title: string
  source_type: SourceType        // see Sources, below — discovery flavor only
  state: AVAILABLE | ACTIVE | COMPLETED | FAILED | ABANDONED
  faction_id: string | null      // loose coupling — nullable, optional rep tie-in
  nodes: QuestNode[]
  current_node_id: string
}

QuestNode {
  id: string
  objective: ObjectivePrimitive   // fixed vocab — see Objective Primitives
  resolution: ResolutionType      // how this node's outcome is determined — see below
  edges: QuestEdge[]              // outgoing edges, matched against resolution outcome
  terminal: TerminalPayload | null
}

QuestEdge {
  match: string                   // outcome tag this edge fires on
  to_node_id: string
}

TerminalPayload {
  result: SUCCESS | FAILURE
  reward: { xp: number, loot_table_ref: string, faction_rep_delta: number } | null
  consequence: { faction_rep_delta: number, world_mutations: WorldMutationInstruction[] } | null
  delivery: DeliveryInstruction
}
```

### Objective Primitives

Fixed vocabulary, same pattern as spell effect primitives — not freeform text:

| Primitive | Description |
|---|---|
| `kill` | Defeat a specific target or group |
| `fetch` | Retrieve a specific item |
| `escort` | Protect an NPC/object to a destination |
| `deliver` | Bring an item/message to a specific NPC/location |
| `talk_to` | Initiate dialogue with a specific NPC |
| `reach_location` | Arrive at a specific place |
| `survive_rounds` | Remain alive/standing for N combat rounds |
| `discover` | Surface a specific piece of world knowledge — resolves via the existing NPC memory system, see Discovery below |

### Branching — Deterministic Edge Matching Only

Edges are matched against the outcome of a node's `resolution` — never against an LLM's live interpretation of "what happened." Resolution types are existing engine primitives:

| Resolution Type | Source | Example |
|---|---|---|
| `skill_check` | Pass/fail off a single roll, same as any other check the engine already resolves | DC 15 Investigation → `success` / `failure` |
| `entity_reference` | Which specific NPC/item/location was involved | Talked to `npc_witness_id` vs `npc_smuggler_id` |
| `memory_surfaced` | Did a tagged `npc_memories` entry actually surface in dialogue with this NPC — see Discovery below | `event_tag: "caravan_robbery_bandits"` found → `true` / `false` |

```
engine.findEdge(node.edges, outcome_tag)
  → match found  → follow edge, normal progression
  → no match found → no edge exists for this tag → that IS the trigger
                      → live handoff to AI DM (see Dynamic Content below)
```

This is the same "no fixed-vocab match → live handoff" shape `dm_adjudication` already uses for spell effects, and `IMPROVISED` actions already use for the standard 12 D&D actions. No new detection mechanism.

### Dynamic Content (the Live-Handoff Fallback)

Earlier design attempts tried tagging a node as `DYNAMIC` ahead of time, with a pre-written condition routing to it. That's a contradiction: writing a condition that routes to "something stranger" already requires knowing what the stranger thing is, which means it was generated at quest-gen time anyway — the tag was hiding the generation, not deferring it.

The actual fix: **a node can have no pre-defined next step at all.** Not hidden, genuinely absent. When the engine resolves a node's outcome and finds no matching edge for that outcome (see Branching above), that absence is the trigger — not a flag, not a condition, a structural gap in the tree.

```
Node resolves → outcome_tag produced
  → engine looks for matching edge → none exists
  → live handoff to AI DM, using:
      - the node's actual resolution outcome
      - quest history (nodes visited so far)
      - current world/faction state
  → AI generates a real node, for real, in the moment — nothing was
    pre-decided about its content
  → validated into the fixed Objective Primitives vocab
  → appended to the quest's node list, becomes current_node_id
```

Generation fires **eagerly**, the instant the gap is discovered — not lazily when a player happens to open the quest log — same "fast stuff never blocks on the LLM" principle already used for narration streaming.

> **Forward dependency:** dynamic content generation requires the orchestrator (assembling quest/world/faction context for the AI DM) and MCP world-mutation tool access — neither is designed yet (orchestrator is next session's focus). The DAG structure and edge-matching trigger can be specced now; dynamic nodes are not functional until the orchestrator exists. Same forward dependency already flagged for `dm_adjudication` in the Spells section — not a new one.

### Discovery Objectives — Riding on Existing NPC Memory Infra

`discover`-type nodes do **not** need their own generation or interpretation path. The insight: NPC dialogue generation already happens (and already costs an LLM call) regardless of quests — the quest subsystem just reads off it rather than asking for its own pass.

```
Event occurs (e.g. a robbery), written at quest-gen time as a
world_mutation instruction (see World Mutation Instructions below)
   ↓
engine writes an event_log entry for it
   ↓
relevant NPCs get an npc_memories row pointing at that event_log
entry — the EXISTING memory system, nothing new
   ↓
[later, in play] party talks to ANY NPC, possibly unrelated to the
quest — normal dialogue generation happens, same cost as any other
NPC conversation, quest didn't add a call here
   ↓
that NPC's memory retrieval naturally surfaces the tagged memory if
it's relevant/in range
   ↓
engine checks: did this conversation surface a memory tagged with
this quest's event? → deterministic lookup, not an interpretation
   ↓
resolution: memory_surfaced { event_tag } → true/false → edge match
```

This means `discover` nodes are really a **read** off NPC memory / `event_log`, not a quest-specific primitive needing its own infra.

### World Mutation Instructions

Quest generation (at gen time, e.g. the moment a quest is accepted) emits a list of engine instructions — fixed vocabulary, same pattern as spell effect primitives and Objective Primitives:

| Instruction | Description |
|---|---|
| `spawn_npc` | Create an NPC into `world.npcs` |
| `generate_wreckage` | Place world/scene dressing (no mechanical entity) |
| `add_npc_memory` | Write an `npc_memories` row tied to an `event_log` entry — see Discovery above |
| `reveal_quest_marker` | Surface a quest-giver indicator to clients |

Engine validates and executes each instruction at the moment the quest enters `ACTIVE` (or whenever generation actually fires — see Sources below for timing per source type). This reuses the same forward dependency already flagged for `dm_adjudication` — AI DM needs world-mutation tool access via MCP — not a new dependency, the same one.

### Memory & Reputation Decay

No memory is ever deleted. This is consistent with `event_log`/`combat_log` already being explicitly append-only (storage-layer.md). An NPC doesn't forget a robbery just because the party turned the quest in — that would be both an inconsistency with how every other event in the world is treated, and narratively wrong.

Instead, decay happens at **query/rank time**, not write time, and applies to two distinct things on two distinct timescales:

**1. Memory relevance ranking** (`npc_memories`, `faction_events`) — old memories shouldn't out-rank fresh ones in topK similarity search just by lingering. Exponential decay, computed lazily against the world clock (no cron, no background job — same lazy-computation pattern as the Revivify window):

```
weeks_elapsed = (world_clock.now - memory.created_at_clock) / (7 * 24 * 60)
decay_factor = 0.5 ^ (weeks_elapsed / 4)        // 4-week half-life
final_rank_score = similarity_score * decay_factor
```

A `significance` / `pin: true` flag (settable via the `add_npc_memory` world mutation instruction) skips decay entirely — for major plot beats, betrayals, backstory moments that shouldn't quietly fade.

**2. Faction reputation drift** — a *separate* mechanic from memory ranking. Memory decay only affects what surfaces in AI context; it never touches the actual `reputation` integer. Reputation drifts toward neutral over time, symmetrically (grudges fade same as goodwill), computed lazily at read time, **12-week half-life** (slower than memory decay — institutional attitude shifts slower than single-conversation relevance):

```
weeks_elapsed = (world_clock.now - character_faction_reputation.updated_at_clock) / (7 * 24 * 60)
drifted = reputation * 0.5 ^ (weeks_elapsed / 12)
// drifted is used for display/AI context; NOT written back to DB until
// the next actual rep-changing event, which applies its delta on top
// of the drifted value and resets updated_at
```

Both `npc_memories` and `faction_events` get a nullable `quest_id` FK so quest-originated memories can be identified, but the decay mechanism itself is universal — it applies to all memories/rep, quest-originated or not. Quests are just one source among several that benefit from infra that already needs to exist.

### Sources

| Source | Description |
|---|---|
| NPC provider | Classic quest-giver, marker over head |
| World event | Pre-generated at world-gen time, or reactive via periodic orchestration prompt |
| Bounty board | Physical/tavern listing, party self-selects, no NPC relationship required |
| Faction-issued | Commissioned by a faction rather than an individual NPC — ties into faction rep |
| Found/discovered | Letter, journal, dying NPC's last words — exists in the world before anyone "gives" it |
| Companion-personal | Tied to a PC's backstory or AI companion arc |
| Rumor | **Lazy materialization** — see below |

**Rumor is structurally different from every other source.** An NPC has an *ambient* memory (e.g. `"rumor_bandit_treasure"`) generated like any other world content — but no quest row exists yet. The quest only materializes into a real `AVAILABLE` row if the party follows up in conversation (asks more, presses for detail) — overhearing alone does not auto-spawn a quest, to avoid cluttering the log with flavor nobody wanted to pursue. This mirrors the same "don't generate until something real triggers it" principle as the dynamic-node fallback.

Every other source generates its quest object (and fires its `world_mutation` instructions) at the moment the quest is created — only Rumor defers.

### Reward & Consequence Delivery

`source_type` (how the quest was discovered) and delivery (how the reward/consequence arrives) are independent axes — conflating them made terminal-node logic messy. Delivery lives on the terminal node itself, fixed vocabulary:

| Delivery Type | Behavior |
|---|---|
| `npc_handoff` | Reward/consequence fires once the party returns to a named NPC — mirrors how `LOOT_GRANTED` already fires off `COMBAT_ENDED`, just gated on a different trigger event |
| `auto_grant` | Fires immediately on terminal node resolution, no return trip |
| `claim_location` | Reward sits in a `containers` row at a location (reuses the existing camp-stash pattern), party collects whenever |

**`unlock_library_access`** — Epic campaigns only. Flips `campaigns.library_access_unlocked = true`. Per-party; one completion covers all connected players. Engine writes the flag and emits a `STATE_DELTA` so all clients update immediately. Has no effect if `world_depth = 'standard'` — engine should guard against this and log a warning if triggered on a Standard campaign.

`mail_dispatch` (delayed delivery via messenger) was considered and **cut for v1** — there's no SRD/RAW mechanic backing delayed message delivery (Sending and Message are both instant, no postal system exists in the ruleset), so it would've required new clock-polling infra to support a purely homebrew flavor beat with no rules grounding. The same narrative effect ("a raven arrives with your reward") is achievable via `auto_grant` wrapped in narration, with zero new infra.

### Failure Consequences

Failure terminal nodes use the exact same `TerminalPayload` shape as success — `consequence` mirrors `reward`, just with negative deltas. Mechanically these reuse infra that already exists rather than inventing a parallel "punishment" system:

- Faction rep hit → existing `character_faction_reputation` write, same path as a positive `faction_rep_delta`
- NPC attitude shift / world reaction → `world_mutation` instructions (`add_npc_memory`, etc.), same as success-side mutations
- **Merchant price markup** → modelled as an `ActiveEffect`, identical shape to conditions and light sources, no new system:

```
ActiveEffect {
  target_id: character_id or party
  source_id: faction_id or npc_id
  source: "quest_failure_markup"
  scope: TIMED
  expires_at: world_clock timestamp
  stat: "merchant_price_modifier"
  modifier: +25%   // example
}
```

Shop transactions query `getModifiers()` before computing a price, the same way combat already queries it before every roll — one new call site, no new plumbing.

### Quest Log Visibility

Players see the **current node and past nodes only** — no future branches, no spoilers. The DAG can contain content the party will never see if they take a different path; the log reveals only what's actually been lived.

### Storage

New table:

#### `quests`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `campaign_id` | UUID FK → `campaigns` | |
| `title` | TEXT | |
| `source_type` | TEXT | `npc` \| `world_event` \| `bounty_board` \| `faction` \| `found` \| `companion` \| `rumor` |
| `state` | TEXT | `available` \| `active` \| `completed` \| `failed` \| `abandoned` |
| `faction_id` | UUID FK → `factions` | **nullable** — loose coupling, see Overview |
| `nodes` | JSONB | Full DAG — see Quest Structure |
| `current_node_id` | TEXT | Pointer into `nodes` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

New columns:

| Table | Column | Type | Notes |
|---|---|---|---|
| `npc_memories` | `quest_id` | UUID FK → `quests` | **nullable** — identifies quest-originated memories for decay/cleanup logic, decay mechanism itself is universal |
| `faction_events` | `quest_id` | UUID FK → `quests` | Same as above |
| `npc_memories` | `significance` | BOOLEAN | Default `false`. `true` skips decay entirely (the `pin` flag) |
| `character_faction_reputation` | *(no new column)* | — | Drift computed lazily off existing `updated_at` — see Memory & Reputation Decay |

Full column definitions to be finalized when written into storage-layer.md (cross-reference, per usual pattern — not duplicated here).

> **Note — NPC agent architecture (preview, not locked):** while designing Discovery objectives, the question came up of whether NPCs are individual standing AI agents or a single NPC-dialogue capability invoked per-NPC with scoped context. Current thinking leans toward the latter — one NPC-dialogue capability (most likely under the narration specialist), invoked with an `npc_id` parameter, pulling that NPC's traits/memories/faction standing fresh per call. "Isolated" memory then falls out of `npc_id`-scoped retrieval (which `npc_memories` already supports), not from maintaining a standing per-NPC agent process. This is **not a locked decision** — it's genuinely orchestrator territory, and the orchestrator (multi-agent architecture: orchestrator + combat/world/rules/narration specialists) is explicitly next session's focus. Noted here only so the quest system's Discovery design doesn't accidentally assume per-NPC agents exist.

---

## Summary of Key Design Decisions

| Decision | Choice |
|---|---|
| Rules engine | Behind `IRulesEngine` interface, hot-swappable |
| Ruleset compatibility | `srd.ruleset_version` checked against active engine on startup. Mismatch = hard fail, not a warning. |
| Client role | Dumb renderer. Local validation for UX only. Server always re-validates. |
| State machine | 6 top-level states. REST → COMBAT ambush transition exists. |
| Encounter triggers | Three sources: RNG, AI DM proactive, human DM manual |
| AI DM mode | Party decisions become majority votes. AI DM narrates, doesn't vote. |
| Rests | Rule-validated, not DM-gated |
| Combat sub-states | INITIATIVE_ROLL → ACTIVE_TURN → AWAITING_REACTION → TURN_TRANSITION → COMBAT_ENDED |
| Initiative ties | Player-player → vote. Monster-monster → DM. Player-monster → DM. |
| Turn timeout | 90s default, DM-configurable. Silent auto-skip. TURN_SKIPPED notification. |
| Combat live state | Redis only. Postgres combat.* = post-combat log. |
| Attack paths | Two: attack roll (vs AC) and saving throw (vs DC). |
| Crit | Natural 20 on d20 face. Roll damage dice twice. |
| Damage pipeline | base dice → modifiers → bonus dice → flat mods → resistance/immunity → vulnerability |
| Damage types | 13 types. Resistance/immunity/vulnerability per creature. |
| Spells scope | Combat engine owns roll + damage math. Spells subsystem owns everything else: conditions applied, zones, buffs, concentration, cast-time validation. |
| Spell effect schema | Fixed primitive vocabulary in `srd.spells.effects`, not hardcoded per-spell and not freeform text. `dm_adjudication` is the fallback for genuinely freeform rules-text branches (e.g. Wish's Reshape Reality). |
| Spell effect storage | Reuses the existing `ActiveEffect` shape (scope + expiry) — same query interface (`getModifiers()`) handles conditions, light sources, and spell effects identically. |
| Upcasting | Sourced from official "At Higher Levels" spell text, not invented math. `linear` (per-slot-level increment) or `tiered` (irregular jumps) scaling shapes. |
| Concentration | One at a time — new concentration spell ends the old one instantly, no save. Taking damage triggers a CON save, DC = max(10, half damage), capped at 30. Incapacitated/death ends it automatically. |
| Persistent zones | AoE shape + `ActiveEffect` with duration. Affected entities rechecked every round/movement — same mechanism as Emanation. |
| Reaction spells | Use the existing `AWAITING_REACTION` sub-state — no new interrupt mechanism. |
| Rituals | +10 min cast time, no slot expended, must be prepared (Wizards exempt). Not practical mid-combat by nature — no special engine gate needed. |
| Action resources | movement_remaining (int), actions_remaining (uint8), bonus_action_used (bool), reaction_used (bool, per round), free_interaction_used (bool), attacks_remaining (uint8) |
| Movement validation | On finalise only. Client highlights range locally. |
| Opportunity attacks | Server monitors all movement. Triggers AWAITING_REACTION. |
| Conditions | 15 conditions. No self-stacking (Exhaustion excepted). Additive across different conditions. |
| Condition inheritance | Resolved at query time. Single entry in Redis. |
| Condition scopes | COMBAT, TIMED, SUSTAINED |
| Conditions interface | getModifiers() returns modifier flags + sources[] for display |
| Death saves | d20, DC 10, no modifier. Nat 20 = revive. Nat 1 = two failures. 3 saves = stable. 3 failures = dead. |
| Damage at 0 HP | Auto failure (2 if crit). Excess >= HP max = instant death. |
| NPC death saves | AI DM sets death_saves_enabled at spawn time. Default false. |
| Character death | marked deceased in Postgres. Not deleted. Resurrection possible. |
| Revivify window | current_round - died_on_round <= 10 |
| World clock | Integer minutes. Ticks 6 seconds per combat round. Lives in Redis, checkpointed to Postgres. |
| XP model | Always XP-based, no milestone mode. DM can award bonus XP / grant levels directly, no vote. |
| XP award | Batched at `COMBAT_ENDED`. Equal split among all combatants in initiative order, including AI players and those who died/fled. No round-based proration. |
| Level-up timing | Immediate on threshold. Mechanical benefits apply instantly; choices flagged async in `pending_levelup`. |
| Level-up choice prompt | Suppressed during `ACTIVE_TURN`, surfaces on `TURN_END`. |
| HP on level-up | `roll` \| `fixed`, campaign-wide setting (`hp_on_levelup` on `campaigns`). |
| XP thresholds | Seeded into `srd.xp_thresholds`, swappable per ruleset version. |
| Loot generation | Engine rolls from BYO20's own equivalent tables (`srd.loot_tables`), not DMG verbatim. AI DM picks theme. |
| Loot treasure types | Individual (per monster) and Hoard (per encounter), sourced from `srd.monsters` / `world.npcs`. |
| Coin distribution | Auto-split equally to wallets, no survey. |
| Item distribution | Post-combat survey, simultaneous claims, 60s timeout (DM-configurable). Conflicts resolved by AI on class/role fit. Unclaimed → camp stash. |
| Exploration fog | Reveal requires line of sight. Radius from light source + passive Perception. Revealed forever once explored. Shared or per-player mode (existing `fog_mode` setting). |
| Combat vision | Always per-player regardless of `fog_mode`. Full 3-level light model (bright/dim/darkness). Darkvision per-character. Light sources as `ActiveEffect` (SUSTAINED/TIMED). |
| Fog server filtering | Server computes visible entity set per player before sending — never sent then hidden client-side. |
| AoE shapes | All six 2024 shapes: cone, cube, cylinder, line, sphere, emanation. |
| AoE terrain | Terrain never blocks AoE — shape always resolves in full. |
| AoE emanation | Recalculates affected entities on every source position update. |
| AoE origin | Client preview from cache; server is final authority on range + resolution. |
| AoE affected-entity check | Bounding volume intersection (all movement modes); square/hex adds the "≥50% cell coverage" rule on top. |
| Quest log scope | Party-wide, not per-character. |
| Quest states | `AVAILABLE → ACTIVE → COMPLETED/FAILED/ABANDONED`. Accepting goes through the Voting System. |
| Quest structure | DAG, not linear. Nodes carry an objective + deterministic resolution + edges. |
| Quest branching | Edges matched against deterministic outcomes only (skill check, entity reference, memory-surfaced) — never live LLM interpretation. |
| Quest dynamic content | Triggered by absence of a matching edge, not a pre-tagged node. Forward dependency on orchestrator + MCP world-mutation tools. |
| Quest generation | AI emits fixed-vocab `world_mutation` instructions; quests write into existing NPC memory / event_log infra, no separate quest-gen pipeline. |
| Discovery objectives | Read off existing NPC memory/dialogue system — no quest-specific generation or interpretation. |
| Memory deletion | Never. Decay is rank-only, computed lazily at query time. |
| Memory decay | `npc_memories` + `faction_events`, exponential, 4-week half-life. `significance`/pin flag skips decay. |
| Faction rep drift | Separate mechanic from memory decay. Reputation drifts toward neutral, symmetric, lazy computation at read time, 12-week half-life. |
| Quest sources | NPC, world event, bounty board, faction, found/discovered, companion, rumor. |
| Rumor source | Lazy materialization — requires party follow-up conversation, not just overhearing. |
| Reward/consequence delivery | `npc_handoff` \| `auto_grant` \| `claim_location`. `mail_dispatch` cut — no RAW grounding, no infra added. |
| Failure consequences | Same `TerminalPayload` shape as success, negative deltas. Price markup modelled as `ActiveEffect` (`merchant_price_modifier`), no new system. |
| Quest log visibility | Current + past nodes only. No future branches shown. |
| Library remote access trigger | Quest terminal reward type: `unlock_library_access` |
| Library access scope | Campaign-scoped, per-party. Single completion unlocks for all. |
| Guard | Engine no-ops `unlock_library_access` on Standard campaigns |
