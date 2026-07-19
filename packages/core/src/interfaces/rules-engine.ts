/**
 * IRulesEngine — the single contract that every ruleset implementation must satisfy.
 *
 * Context types (inputs) and result types (outputs) for each subsystem are defined
 * here alongside the interface. They are engine-internal — not re-exported from
 * @byo20/shared — because no layer outside the engine needs them.
 *
 * Shared domain types (Character, NPC, Quest, …) are imported from @byo20/shared.
 */
import type {
  Character,
  NPC,
  Encounter,
  Quest,
  Item,
  ActiveEffect,
  WorldMutationInstruction,
  PendingLevelup,
  NPCMemory,
  QuestSourceType,
} from '@byo20/shared'

// ─── Dice ────────────────────────────────────────────────────────────────────

/** Whether a roll is made normally, with advantage (take higher), or disadvantage (take lower). */
export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** A fully-resolved dice roll with individual die results and metadata. */
export interface DiceRoll {
  /** Individual die results before summing. */
  dice: number[]
  modifier: number
  total: number
  mode: RollMode
  /** Raw d20 result before modifier — used for crit/fumble detection. */
  natural: number
}

// ─── Ability checks ──────────────────────────────────────────────────────────

/** The six D&D ability score names as a union type. */
export type Ability = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

/** All 18 D&D skills. */
export type Skill =
  | 'acrobatics'
  | 'animal_handling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleight_of_hand'
  | 'stealth'
  | 'survival'

/** Discriminates which modifier profile to apply when evaluating conditions. */
export type CheckType = 'ability' | 'skill' | 'saving_throw' | 'attack'

// ─── Combat ──────────────────────────────────────────────────────────────────

/** Whether the attacker is a player character or an NPC. */
export type AttackerType = 'character' | 'npc'

/** Whether the target is a player character or an NPC. */
export type TargetType = 'character' | 'npc'

/** Full context for resolving an attack roll. */
export interface AttackContext {
  attackerId: string
  attackerType: AttackerType
  attacker: Character | NPC
  targetId: string
  targetType: TargetType
  target: Character | NPC
  /** null for unarmed attacks. */
  weaponId: string | null
  /** null for non-spell attacks. */
  spellId: string | null
  rollMode: RollMode
  encounterId: string
}

/** Outcome of an attack roll — whether it hit, critted, and what the roll was. */
export interface AttackResult {
  hit: boolean
  critical: boolean
  roll: DiceRoll
  targetAC: number
  attackBonus: number
}

/** Context for a saving throw check. */
export interface SavingThrowContext {
  entityId: string
  entityType: 'character' | 'npc'
  entity: Character | NPC
  ability: Ability
  dc: number
  rollMode: RollMode
}

/** Outcome of a saving throw — whether the entity succeeded and what the roll was. */
export interface SaveResult {
  success: boolean
  roll: DiceRoll
  dc: number
  savingThrowBonus: number
}

/** Context for calculating damage after a confirmed hit. */
export interface DamageContext {
  attackResult: AttackResult
  weaponId: string | null
  spellId: string | null
  attacker: Character | NPC
  target: Character | NPC
  /** Spell slot level used for upcasting. Undefined for cantrips and non-spell attacks. */
  upcasting?: number
}

/** Outcome of a damage roll, including resistance/immunity flags. */
export interface DamageResult {
  amount: number
  /** Damage type string from the SRD (e.g. 'fire', 'slashing'). */
  type: string
  roll: DiceRoll
  resistanceApplied: boolean
  immunityApplied: boolean
}

// ─── Conditions ──────────────────────────────────────────────────────────────

/**
 * The 15 official D&D 5.5e (2024 PHB) conditions.
 * Dazed is NOT included — it was playtest-only and cut from the final rulebook.
 */
export type Condition =
  | 'blinded'
  | 'charmed'
  | 'deafened'
  | 'exhaustion'
  | 'frightened'
  | 'grappled'
  | 'incapacitated'
  | 'invisible'
  | 'paralyzed'
  | 'petrified'
  | 'poisoned'
  | 'prone'
  | 'restrained'
  | 'stunned'
  | 'unconscious'

/**
 * Rolled-up modifier profile produced by evaluating a set of active conditions.
 * Callers apply these booleans/modes rather than switching on each condition individually.
 */
export interface ModifierResult {
  attackRollMode: RollMode
  abilityCheckMode: RollMode
  savingThrowMode: RollMode
  canMove: boolean
  canTakeActions: boolean
  canTakeBonusActions: boolean
  canTakeReactions: boolean
  /** Paralyzed and stunned: entity auto-fails STR and DEX saves. */
  autoFailStrDex: boolean
  /** Extended crit range (normally 0; certain features widen the window). */
  criticalHitRangeExtension: number
  /** Attackers within 5 ft auto-crit (paralyzed and unconscious conditions). */
  grantsCriticalHits: boolean
  /** 0 = fully stopped, 1 = normal speed. Prone halves movement cost to stand. */
  speedMultiplier: number
}

// ─── Death saves ─────────────────────────────────────────────────────────────

/** Result of one death saving throw roll. */
export interface DeathSaveResult {
  roll: DiceRoll
  outcome: 'success' | 'failure' | 'stabilized' | 'died'
  successCount: number
  failureCount: number
}

// ─── World clock ─────────────────────────────────────────────────────────────

/** Result of advancing the world clock for a campaign. */
export interface WorldClockTickResult {
  previousClock: number
  newClock: number
  minutesElapsed: number
  /** IDs of agenda events that fired during this tick. */
  agendaEventsFired: string[]
}

// ─── XP + leveling ───────────────────────────────────────────────────────────

/** XP awarded after clearing an encounter, split evenly across the party. */
export interface XPAwardResult {
  totalXP: number
  perCharacter: number
  characterCount: number
}

/** Result of a character level-up, including the choices that still need to be made. */
export interface LevelUpResult {
  characterId: string
  previousLevel: number
  newLevel: number
  hpGained: number
  pendingChoices: PendingLevelup
}

// ─── Loot ────────────────────────────────────────────────────────────────────

/** Thematic flavour that biases the random loot tables. */
export type TreasureTheme = 'dungeon' | 'wilderness' | 'urban' | 'aquatic' | 'underdark'

/** Whether this encounter grants individual monster loot, a full hoard, or nothing. */
export type TreasureType = 'individual' | 'hoard' | 'none'

/** Generated loot for an encounter: a gold amount plus a list of items. */
export interface LootManifest {
  gold: number
  items: Array<{ srdItemId: string; quantity: number; magic: boolean }>
}

/** A single player's claim on one item in the manifest. */
export interface LootClaim {
  characterId: string
  /** Index into LootManifest.items. */
  itemIndex: number
}

/** Result of arbitrating contested loot claims. */
export interface LootDistributionResult {
  granted: LootClaim[]
  /** Claims where multiple characters claimed the same item — needs DM arbitration. */
  contested: LootClaim[]
}

// ─── Fog of war ──────────────────────────────────────────────────────────────

/** Visibility mode: free-roam exploration vs. structured combat. */
export type FogMode = 'exploration' | 'combat'

/** Fog config for exploration mode — no encounter context needed. */
export interface ExplorationFog {
  mode: 'exploration'
}

/** Fog config for combat mode — scoped to a specific encounter. */
export interface CombatVision {
  mode: 'combat'
  encounterId: string
}

/** Computed visibility result for one observer. */
export interface VisibilityResult {
  visibleEntityIds: string[]
  visibleZoneIds: string[]
}

// ─── AoE ─────────────────────────────────────────────────────────────────────

/** Geometric shape of an area-of-effect. */
export type AoEShape = 'sphere' | 'cone' | 'cube' | 'line' | 'cylinder' | 'emanation'

/**
 * Everything the AoE resolver needs: shape, origin, direction (for cone/line),
 * dimensions, and the candidate entities to test for inclusion.
 */
export interface AoEContext {
  shape: AoEShape
  originPoint: { x: number; y: number; z: number }
  /** Required for cone and line shapes. */
  direction?: { x: number; y: number; z: number }
  sizeFt: number
  /** For emanation only — the AoE moves with this entity. */
  sourceEntityId: string
  candidates: Array<{
    id: string
    type: 'character' | 'npc'
    position: { x: number; y: number; z: number }
    boundingRadius: number
  }>
}

/** Which entities fall inside the AoE, plus the resolved geometry for the renderer. */
export interface AoEResult {
  affectedEntityIds: string[]
  shape: AoEShape
  originPoint: { x: number; y: number; z: number }
}

// ─── Spells ──────────────────────────────────────────────────────────────────

/** Everything needed to attempt casting a spell. */
export interface SpellCastContext {
  casterId: string
  casterType: 'character' | 'npc'
  caster: Character | NPC
  spellId: string
  /** 0 for cantrips. */
  slotLevel: number
  /** Entity IDs of explicit targets (single-target or multi-target spells). */
  targets: string[]
  /** Populated when the spell has an area of effect. */
  aoeContext?: AoEContext
  ritual: boolean
}

/** Result of a spell cast attempt. */
export interface SpellCastResult {
  success: boolean
  failReason?: string
  /** true if the caster's previous concentration spell was ended. */
  concentrationBroken: boolean
  /** Fixed-vocabulary effect primitive types that were triggered. */
  effectsApplied: string[]
}

/** One atomic effect produced by a spell — keyed by a fixed type string from the SRD. */
export interface SpellEffectPrimitive {
  type: string
  [key: string]: unknown
}

/** Runtime context passed to each effect resolver. */
export interface EffectContext {
  caster: Character | NPC
  targets: Array<Character | NPC>
  slotLevel: number
  encounterId: string | null
}

/** What actually happened when a spell effect was applied. */
export interface EffectResult {
  affectedEntityIds: string[]
  conditionsApplied: Condition[]
  damageDealt: number
  healingDone: number
  zonesCreated: string[]
}

/** Outcome of a concentration check after taking damage. */
export interface ConcentrationResult {
  maintained: boolean
  dc: number
  roll: DiceRoll
}

// ─── Quests ──────────────────────────────────────────────────────────────────

/** What the quest generator needs to produce a contextually appropriate quest. */
export interface QuestGenContext {
  campaignId: string
  sourceType: QuestSourceType
  factionId?: string
  npcId?: string
  partyLevel: number
  worldClock: number
}

/** A freshly generated quest plus any world-state side effects it requires. */
export interface QuestGenResult {
  quest: Quest
  worldMutations: WorldMutationInstruction[]
}

/** Input to resolving a quest DAG node after an in-world event triggers it. */
export interface NodeResolutionContext {
  questId: string
  nodeId: string
  /** The event payload that caused this node to be evaluated. */
  outcome: Record<string, unknown>
}

/** What happened when a quest node was evaluated. */
export interface QuestNodeResult {
  nodeCompleted: boolean
  /** null when this is a terminal node. */
  nextNodeId: string | null
  terminal: boolean
  rewardsGranted: boolean
}

// ─── Memory ──────────────────────────────────────────────────────────────────

/** An NPC memory paired with its relevance score for a given recall query. */
export interface RankedMemory {
  memory: NPCMemory
  /** similarity_score × decay_factor — higher = more relevant. */
  score: number
}

/** Ordered list of ranked NPC memories returned from a recall query. */
export interface RankedMemoryResult {
  memories: RankedMemory[]
}

// ─── IRulesEngine ────────────────────────────────────────────────────────────

/**
 * Contract for the D&D rules engine.
 * Each subsystem (combat, spells, quests, …) is a method cluster.
 * The concrete implementation delegates to the subsystem files in engines/dnd-5.5e/.
 */
export interface IRulesEngine {
  /** Ruleset ID checked against srd.ruleset_version on server boot. */
  readonly RULESET_ID: string

  // ── Combat ────────────────────────────────────────────────────────────────
  resolveAttack(context: AttackContext): AttackResult
  resolveSavingThrow(context: SavingThrowContext): SaveResult
  calculateDamage(context: DamageContext): DamageResult

  // ── Conditions ────────────────────────────────────────────────────────────
  evaluateConditions(conditions: Condition[], checkType: CheckType): ModifierResult

  // ── Death saves ───────────────────────────────────────────────────────────
  rollDeathSave(entity: Character): DeathSaveResult

  // ── World clock ───────────────────────────────────────────────────────────
  tickWorldClock(campaignId: string, minutes: number): Promise<WorldClockTickResult>

  // ── XP + leveling ─────────────────────────────────────────────────────────
  awardXP(encounter: Encounter, characters: Character[]): XPAwardResult
  resolveLevelUp(character: Character, hpOnLevelup: 'roll' | 'fixed'): LevelUpResult

  // ── Loot ──────────────────────────────────────────────────────────────────
  generateLoot(encounter: Encounter, theme: TreasureTheme): LootManifest
  resolveLootClaims(claims: LootClaim[], manifest: LootManifest): LootDistributionResult

  // ── Visibility ────────────────────────────────────────────────────────────
  computeVisibility(observer: Character | NPC, mode: ExplorationFog | CombatVision): Promise<VisibilityResult>

  // ── AoE ───────────────────────────────────────────────────────────────────
  resolveAoE(context: AoEContext): AoEResult

  // ── Spells ────────────────────────────────────────────────────────────────
  castSpell(context: SpellCastContext): Promise<SpellCastResult>
  resolveSpellEffect(effect: SpellEffectPrimitive, context: EffectContext): EffectResult
  checkConcentration(caster: Character | NPC, damage: number): ConcentrationResult

  // ── Quests ────────────────────────────────────────────────────────────────
  generateQuest(context: QuestGenContext): Promise<QuestGenResult>
  applyWorldMutations(campaignId: string, instructions: WorldMutationInstruction[]): Promise<void>
  resolveQuestNode(resolution: NodeResolutionContext): Promise<QuestNodeResult>

  // ── Memory ────────────────────────────────────────────────────────────────
  queryMemories(npcId: string, context: string, topK: number): Promise<RankedMemoryResult>

  // ── Faction rep ───────────────────────────────────────────────────────────
  computeFactionRepDrift(factionId: string, characterCampaignStateId: string, currentClock: number): number
}
