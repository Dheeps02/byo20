/** Spell casting, effect resolution, and concentration stubs. */
import type { Character, NPC } from '@byo20/shared'
import type {
  SpellCastContext,
  SpellCastResult,
  SpellEffectPrimitive,
  EffectContext,
  EffectResult,
  ConcentrationResult,
} from '../../interfaces/rules-engine'
import { NotImplementedError } from '../../errors'

/**
 * Attempt to cast a spell: validate slot availability, end previous concentration
 * if needed, and apply all effect primitives listed in the SRD spell definition.
 */
export async function castSpell(context: SpellCastContext): Promise<SpellCastResult> {
  throw new NotImplementedError('castSpell')
}

/**
 * Apply one SRD effect primitive (e.g. 'damage', 'condition', 'healing') to its targets.
 * Each primitive type is handled by a dedicated resolver keyed on effect.type.
 */
export function resolveSpellEffect(
  effect: SpellEffectPrimitive,
  context: EffectContext,
): EffectResult {
  throw new NotImplementedError('resolveSpellEffect')
}

/**
 * Roll a concentration check for a caster who just took damage.
 * DC = max(10, damage / 2). Caster rolls CON save.
 */
export function checkConcentration(caster: Character | NPC, damage: number): ConcentrationResult {
  throw new NotImplementedError('checkConcentration')
}
