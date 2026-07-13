import type { GamePhase } from './game'
import type { Entity, FogState, Position } from './entities'

// Transient AoE targeting state — lives only in the store, never persisted.
export type SpellPreview = {
  spellId: string
  state: 'aiming' | 'confirmed'
  origin?: Position
}

// Full Zustand store shape. Defined here (not in the renderer) so cross-package
// code can reference the type without importing Zustand itself.
// The 'interface' keyword is used here because this is a contract that the
// renderer's Zustand store must fulfill — interface is idiomatic for that.
export interface GameStoreState {
  // ── live game state ────────────────────────────────────────────────────────
  gamePhase: GamePhase
  selectedEntityId: string | null
  entities: Record<string, Entity>
  initiativeOrder: string[]
  fogState: FogState | null
  worldClock: number

  // ── UI state ───────────────────────────────────────────────────────────────
  spellPreview: SpellPreview | null

  // ── actions ────────────────────────────────────────────────────────────────
  selectEntity: (id: string | null) => void
  patchEntity: (id: string, updates: Partial<Entity>) => void
  setSpellPreview: (preview: SpellPreview | null) => void
  // Pick<> constrains callers to only patch the live-state slice, not UI state
  // or actions — avoids accidentally blowing away function references.
  applyStateDelta: (
    patch: Partial<Pick<GameStoreState, 'entities' | 'initiativeOrder' | 'fogState' | 'worldClock' | 'gamePhase'>>,
  ) => void
}
