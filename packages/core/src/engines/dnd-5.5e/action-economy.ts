/** Action economy stubs — validates and consumes per-turn action budget. */
import type { ActionResources } from '@byo20/shared'
import type { Character, NPC } from '@byo20/shared'
import { NotImplementedError } from '../../errors'

/** Return true if the entity has the resources to take the requested action. */
export function validateAction(entity: Character | NPC, resources: ActionResources): boolean {
  throw new NotImplementedError('validateAction')
}

/** Mark the main action as spent for this turn. */
export function consumeAction(resources: ActionResources): ActionResources {
  throw new NotImplementedError('consumeAction')
}

/** Mark the bonus action as spent for this turn. */
export function consumeBonusAction(resources: ActionResources): ActionResources {
  throw new NotImplementedError('consumeBonusAction')
}

/** Mark the reaction as spent until the start of the next turn. */
export function consumeReaction(resources: ActionResources): ActionResources {
  throw new NotImplementedError('consumeReaction')
}

/** Deduct feet of movement from the remaining movement budget. */
export function consumeMovement(resources: ActionResources, feet: number): ActionResources {
  throw new NotImplementedError('consumeMovement')
}

/** Build a fresh full-turn resource budget for the given entity. */
export function freshTurnResources(entity: Character | NPC): ActionResources {
  throw new NotImplementedError('freshTurnResources')
}
