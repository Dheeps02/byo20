/** Fog-of-war visibility computation stub. */
import type { Character, NPC } from "@byo20/shared";
import { NotImplementedError } from "../../errors";
import type { CombatVision, ExplorationFog, VisibilityResult } from "../../interfaces/rules-engine";

/**
 * Compute which entities and zones are visible to the given observer.
 * Mode determines whether exploration or combat visibility rules apply.
 */
export async function computeVisibility(
    observer: Character | NPC,
    mode: ExplorationFog | CombatVision,
): Promise<VisibilityResult> {
    throw new NotImplementedError("computeVisibility");
}
