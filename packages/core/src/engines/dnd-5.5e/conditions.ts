/**
 * Condition evaluation stubs.
 *
 * The 15 official D&D 5.5e (2024 PHB) conditions are enumerated here.
 * Dazed is NOT included — it was playtest-only and cut from the final rulebook.
 */
import type { Condition, CheckType, ModifierResult } from '../../interfaces/rules-engine'
import { NotImplementedError } from '../../errors'

/** Authoritative list of the 15 official 5.5e conditions. */
export const CONDITIONS: readonly Condition[] = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const

/** Collapse a set of active conditions into a single modifier profile for the given check type. */
export function evaluateConditions(conditions: Condition[], checkType: CheckType): ModifierResult {
  throw new NotImplementedError('evaluateConditions')
}

/** Apply a condition to an entity (writes to game state store). */
export function applyCondition(entityId: string, condition: Condition): void {
  throw new NotImplementedError('applyCondition')
}

/** Remove a condition from an entity (writes to game state store). */
export function removeCondition(entityId: string, condition: Condition): void {
  throw new NotImplementedError('removeCondition')
}
