/** Area-of-effect resolution stub. */
import type { AoEContext, AoEResult } from '../../interfaces/rules-engine'
import { NotImplementedError } from '../../errors'

/**
 * Determine which entities fall within the AoE and return the resolved geometry.
 * Delegates to the appropriate geometry helper based on context.shape.
 */
export function resolveAoE(context: AoEContext): AoEResult {
  throw new NotImplementedError('resolveAoE')
}
