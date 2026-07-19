/** Death saving throw stub. */
import type { Character } from '@byo20/shared'
import type { DeathSaveResult } from '../../interfaces/rules-engine'
import { NotImplementedError } from '../../errors'

/**
 * Roll one death saving throw for an unconscious character.
 * Three successes stabilize; three failures kill. A natural 20 restores 1 HP.
 */
export function rollDeathSave(entity: Character): DeathSaveResult {
  throw new NotImplementedError('rollDeathSave')
}
