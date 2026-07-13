import type { GamePhase } from './game'
import type { Entity, FogState, InitiativeQueue, Position } from './entities'

/** Transient AoE targeting state — exists only while a player is targeting a spell. */
export type SpellPreview = {
  spellId: string
  state: 'aiming' | 'confirmed'
  origin?: Position
}

/**
 * Full Zustand store shape. Defined in @byo20/shared so the renderer can import
 * it without pulling in Zustand. Nothing server-side ever uses this interface —
 * it exists solely so the renderer has a typed contract to implement.
 */
export interface GameStoreState {
  // ── live game state ────────────────────────────────────────────────────────
  gamePhase: GamePhase
  selectedEntityId: string | null
  entities: Record<string, Entity>
  initiativeQueue: InitiativeQueue | null
  fogState: FogState | null
  worldClock: number

  // ── UI state ───────────────────────────────────────────────────────────────
  spellPreview: SpellPreview | null

  // ── actions ────────────────────────────────────────────────────────────────
  /** Select or deselect an entity by UUID. */
  selectEntity: (id: string | null) => void
  /** Partially update a single entity's fields without replacing the whole record. */
  patchEntity: (id: string, updates: Partial<Entity>) => void
  /** Set or clear the active spell preview state. */
  setSpellPreview: (preview: SpellPreview | null) => void
  /**
   * Apply a partial state delta from a STATE_DELTA server message.
   * Pick constrains callers to live-state fields only — prevents accidental
   * overwrite of UI state or action functions.
   */
  applyStateDelta: (
    patch: Partial<Pick<GameStoreState, 'entities' | 'initiativeQueue' | 'fogState' | 'worldClock' | 'gamePhase'>>,
  ) => void
}
