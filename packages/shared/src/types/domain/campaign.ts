/**
 * Domain types for campaigns.
 *
 * Schema note: `terrain_seed` was discussed in design but is NOT a column in the DB.
 * The schema has `heightmap_resolution` (integer) instead.
 * `campaign_seed` IS present in the DB and is included here.
 */

/** How deep the world gen pipeline runs for this campaign. */
export type WorldDepth = 'standard' | 'epic'

/** Top-level campaign lifecycle state. */
export type CampaignStatus = 'active' | 'paused' | 'ended'

/** Current game mode — drives which server subsystems are active. */
export type CampaignPhase = 'exploration' | 'combat' | 'rest'

/** How entity positions are tracked on the map. */
export type MovementSystem = 'free' | 'square' | 'hex'

/** Whether all players share revealed fog, or each player sees their own. */
export type FogMode = 'shared' | 'per_player'

/** How HP is assigned on level-up. */
export type HpOnLevelup = 'roll' | 'fixed'

/** Which AI narration quality tier to use. */
export type NarrationMode = 'economy' | 'balanced' | 'quality'

/** Which LLM provider the DM has configured. */
export type ApiProvider = 'anthropic' | 'openai' | 'google' | 'ollama'

/** World generation pipeline progress. */
export type WorldGenStatus = 'pending' | 'generating' | 'complete'

/** Rough estimate of campaign length in sessions. */
export type CampaignLength = 'short' | 'medium' | 'long'

/** Maps to `game.campaigns`. One row per campaign world. */
export interface Campaign {
  id: string
  name: string
  dmUserId: string
  status: CampaignStatus
  phase: CampaignPhase
  /** In-game minutes elapsed since the campaign start. */
  worldClock: number
  movementSystem: MovementSystem
  fogMode: FogMode
  hpOnLevelup: HpOnLevelup
  /** How often the world auto-saves (in real-world minutes). */
  syncIntervalMins: number
  /** DM-provided premise / setup text. Null if not provided. */
  premise: string | null
  campaignLength: CampaignLength
  /** Campaign tone descriptor: 'gritty' | 'high_fantasy' | 'dark' | 'comedic'. */
  tone: string
  worldGenStatus: WorldGenStatus
  /**
   * Seed used to generate the campaign content (factions, NPCs, quests).
   * Null until world gen completes.
   */
  campaignSeed: string | null
  /**
   * Resolution of the heightmap in pixels per hex. Null until terrain gen runs.
   * (Note: the DB has `heightmap_resolution`, not `terrain_seed`.)
   */
  heightmapResolution: number | null
  worldDepth: WorldDepth
  /** Unlocked by a qualifying quest in Epic campaigns — enables the lore library. */
  libraryAccessUnlocked: boolean
  narrationMode: NarrationMode
  apiProvider: ApiProvider
  /** safeStorage-encrypted API key blob. Null for ollama (no key needed). */
  apiKeyBlob: string | null
  createdAt: Date
  updatedAt: Date
}
