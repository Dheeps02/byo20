/**
 * Domain types for player characters.
 *
 * Three shapes exist to cover different access patterns:
 *   - CharacterIdentity   — the portable `characters` row; exists before any campaign
 *   - CharacterCampaignState — the `character_campaign_state` row; per-campaign mutable state
 *   - CharacterClass      — one row per class the character has levels in (multiclass support)
 *   - Character           — merged engine-facing view of all three joined together
 *
 * Schema note: `ac`, `speed`, and `initiative_bonus` are NOT stored on characters or
 * character_campaign_state in the DB. They are computed by the engine from equipment,
 * class features, and species traits, then surfaced in the WS Entity shape.
 */

/** The six D&D ability scores as a nested object (mapped from flat stat_* DB columns). */
export interface AbilityScores {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

/**
 * Outstanding choices a player must make on level-up.
 * Stored as JSONB in `character_campaign_state.pending_levelup`.
 * Shape may grow as new class/feat options are added — kept open-ish intentionally.
 */
export interface PendingLevelup {
  multiclassPick?: string
  featOrAsi?: 'feat' | 'asi'
  featId?: string
  abilityScoreIncreases?: Partial<AbilityScores>
  subclassPick?: string
  spellsToLearn?: string[]
}

/**
 * Portable character identity — maps to `game.characters`.
 * Exists independently of any campaign; one row per owned character.
 *
 * Note: `species` and `background` are plain text strings (support homebrew),
 * not foreign key UUIDs.
 */
export interface CharacterIdentity {
  id: string
  ownerUserId: string
  name: string
  /** Text string — supports homebrew. NOT a FK into an SRD species table. */
  species: string
  /** Text string — supports homebrew. NOT a FK into an SRD background table. */
  background: string
  backstory: string | null
  stats: AbilityScores
  createdAt: Date
}

/**
 * Per-campaign mutable state — maps to `game.character_campaign_state`.
 * One row per character-campaign membership. A character can be in multiple campaigns.
 *
 * `skillProficiencies` maps the JSONB `{ "athletics": "proficient" }` shape, not a plain array.
 * `spellSlots` is the full JSONB slot map (null for non-spellcasters).
 */
export interface CharacterCampaignState {
  id: string
  characterId: string
  campaignId: string
  level: number
  xp: number
  hp: { current: number; max: number }
  hitDiceRemaining: number
  /** JSONB slot map from DB. Shape is class-dependent; null for non-spellcasters. */
  spellSlots: unknown | null
  /** Active conditions, e.g. ['poisoned', 'prone']. Empty array when none. */
  conditions: string[]
  /** Death save state: { success: number; failure: number }. */
  deathSaves: unknown | null
  /** Current 3D position on the map. Null when not placed. */
  position: { x: number; y: number; z: number } | null
  isActive: boolean
  exhaustionLevel: number
  tempHp: number
  heroicInspiration: boolean
  /** Class-specific resource pools (rage uses, bardic inspiration, etc.). */
  classResources: unknown | null
  /** Prepared spells for this class; null for non-spellcasters. */
  preparedSpells: string[] | null
  /** Weapon mastery choices; null if no martial class and no Weapon Master feat. */
  weaponMasteries: string[] | null
  languages: string[]
  /** Proficiency map: `{ "athletics": "proficient" | "expertise" }`. */
  skillProficiencies: Record<string, string> | null
  savingThrowProfs: string[]
  featsTaken: string[]
  /** Spell ID the character is concentrating on; null if not concentrating. */
  concentratingOn: string | null
  toolProficiencies: string[]
  pendingLevelup: PendingLevelup | null
  updatedAt: Date
}

/**
 * One class entry — maps to `game.character_classes`.
 * A Fighter 3 / Wizard 2 multiclass character has two rows.
 */
export interface CharacterClass {
  id: string
  characterCampaignStateId: string
  /** Text string — supports homebrew class names. */
  class: string
  /** null until level 3 when the subclass choice is made. */
  subclass: string | null
  classLevel: number
  /** Per-class prepared spell list; null for non-spellcasting classes. */
  preparedSpells: string[] | null
}

/**
 * Engine-facing merged character view.
 * Built by JOIN-ing `characters` + `character_campaign_state` + `character_classes`.
 * The storage layer assembles this; the engine never touches raw rows.
 *
 * `campaignStateId` is the PK of the `character_campaign_state` row —
 * needed when splitting back out for writes.
 */
export interface Character {
  // ── from game.characters ────────────────────────────────────────────────
  id: string
  ownerUserId: string
  name: string
  species: string
  background: string
  backstory: string | null
  stats: AbilityScores

  // ── from game.character_campaign_state ──────────────────────────────────
  campaignStateId: string
  campaignId: string
  level: number
  xp: number
  hp: { current: number; max: number }
  hitDiceRemaining: number
  spellSlots: unknown | null
  conditions: string[]
  deathSaves: unknown | null
  position: { x: number; y: number; z: number } | null
  isActive: boolean
  exhaustionLevel: number
  tempHp: number
  heroicInspiration: boolean
  classResources: unknown | null
  preparedSpells: string[] | null
  weaponMasteries: string[] | null
  languages: string[]
  skillProficiencies: Record<string, string> | null
  savingThrowProfs: string[]
  featsTaken: string[]
  concentratingOn: string | null
  toolProficiencies: string[]
  pendingLevelup: PendingLevelup | null
  updatedAt: Date

  // ── from game.character_classes ─────────────────────────────────────────
  classes: CharacterClass[]
}
