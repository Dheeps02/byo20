/**
 * Domain types for quests.
 *
 * Quests are stored as a DAG (directed acyclic graph) in the DB's `nodes` JSONB column.
 * The domain type exposes this as `dag: QuestDag` for clarity.
 */

/** Lifecycle state of a quest. */
export type QuestState = 'available' | 'active' | 'completed' | 'failed' | 'abandoned'

/** Where this quest originated. */
export type QuestSourceType =
  | 'npc'
  | 'world_event'
  | 'bounty_board'
  | 'faction'
  | 'found'
  | 'companion'
  | 'rumor'

/** How terminal rewards are delivered when the quest completes. */
export type TerminalPayloadDelivery = 'npc_handoff' | 'auto_grant' | 'claim_location'

/** What kind of thing a quest reward grants (or penalty takes). */
export type QuestRewardType = 'xp' | 'gold' | 'item' | 'reputation' | 'unlock_library_access'

/** A single reward or consequence entry. Negative `value` means a penalty. */
export interface QuestReward {
  type: QuestRewardType
  value?: number
  factionId?: string
  itemId?: string
}

/** What happens when a terminal node is reached. */
export interface TerminalPayload {
  rewards: QuestReward[]
  /** Negative deltas use the same shape as rewards. */
  consequences: QuestReward[]
  delivery: TerminalPayloadDelivery
  /** NPC id or location id, depending on `delivery`. */
  deliveryRef?: string
}

/** A single objective node in the quest DAG. */
export interface QuestObjective {
  /** Fixed vocabulary primitive, e.g. 'kill', 'collect', 'talk_to', 'reach'. */
  type: string
  [key: string]: unknown
}

/** A node in the quest DAG — may be terminal (ends the quest) or transitional. */
export interface QuestNode {
  id: string
  objective: QuestObjective
  terminal: boolean
  terminalPayload?: TerminalPayload
}

/** A directed edge between two quest nodes, with a condition that must be met to traverse. */
export interface QuestEdge {
  fromNodeId: string
  toNodeId: string
  condition: Record<string, unknown>
}

/** The full quest DAG structure — stored in DB as `nodes` JSONB. */
export interface QuestDag {
  nodes: QuestNode[]
  edges: QuestEdge[]
}

/** Maps to `world.quests`. `dag` deserialises the `nodes` JSONB column. */
export interface Quest {
  id: string
  campaignId: string
  title: string
  sourceType: QuestSourceType
  state: QuestState
  factionId: string | null
  /** Deserialized from the `nodes` JSONB column. */
  dag: QuestDag
  currentNodeId: string
  createdAt: Date
  updatedAt: Date
}
