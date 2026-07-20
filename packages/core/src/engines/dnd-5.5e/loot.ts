/** Loot generation and claim arbitration stubs. */
import type { Encounter } from "@byo20/shared";
import { NotImplementedError } from "../../errors";
import type { LootClaim, LootDistributionResult, LootManifest, TreasureTheme } from "../../interfaces/rules-engine";

/** Generate a loot manifest for the encounter using the given thematic bias. */
export function generateLoot(encounter: Encounter, theme: TreasureTheme): LootManifest {
    throw new NotImplementedError("generateLoot");
}

/**
 * Arbitrate player claims on a manifest.
 * Uncontested claims are granted; contested ones are flagged for DM resolution.
 */
export function resolveLootClaims(claims: LootClaim[], manifest: LootManifest): LootDistributionResult {
    throw new NotImplementedError("resolveLootClaims");
}
