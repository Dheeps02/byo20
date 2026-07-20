import type { GameRejection, Result } from "@byo20/shared";
import { NotImplementedError } from "../../errors";
/** Combat resolution stubs — attack rolls, saving throws, and damage calculation. */
import type {
    AttackContext,
    AttackResult,
    DamageContext,
    DamageResult,
    SaveResult,
    SavingThrowContext,
} from "../../interfaces/rules-engine";

/** Resolve whether an attack hits and whether it crits. */
export function resolveAttack(context: AttackContext): Result<AttackResult, GameRejection> {
    throw new NotImplementedError("resolveAttack");
}

/** Resolve a saving throw against a DC, returning success/failure and the roll. */
export function resolveSavingThrow(context: SavingThrowContext): SaveResult {
    throw new NotImplementedError("resolveSavingThrow");
}

/** Calculate damage dealt after a confirmed hit, applying resistances and immunities. */
export function calculateDamage(context: DamageContext): DamageResult {
    throw new NotImplementedError("calculateDamage");
}
