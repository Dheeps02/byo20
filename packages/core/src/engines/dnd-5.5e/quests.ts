/**
 * Quest generation, world mutation, node resolution, memory recall,
 * and faction rep drift stubs.
 */
import type { WorldMutationInstruction } from "@byo20/shared";
import { NotImplementedError } from "../../errors";
import type {
    NodeResolutionContext,
    QuestGenContext,
    QuestGenResult,
    QuestNodeResult,
    RankedMemoryResult,
} from "../../interfaces/rules-engine";

/** Generate a new quest using the AI layer and attach it to the campaign. */
export async function generateQuest(context: QuestGenContext): Promise<QuestGenResult> {
    throw new NotImplementedError("generateQuest");
}

/**
 * Apply a batch of world mutation instructions to the campaign state.
 * Instructions are processed in order; partial failure is not rolled back at this layer.
 */
export async function applyWorldMutations(campaignId: string, instructions: WorldMutationInstruction[]): Promise<void> {
    throw new NotImplementedError("applyWorldMutations");
}

/**
 * Evaluate a quest node after an in-world event triggers it.
 * Advances the quest DAG cursor and grants rewards if the node is terminal.
 */
export async function resolveQuestNode(resolution: NodeResolutionContext): Promise<QuestNodeResult> {
    throw new NotImplementedError("resolveQuestNode");
}

/**
 * Recall the topK most contextually relevant memories for an NPC.
 * Uses cosine similarity against the context embedding, weighted by temporal decay.
 */
export async function queryMemories(npcId: string, context: string, topK: number): Promise<RankedMemoryResult> {
    throw new NotImplementedError("queryMemories");
}

/**
 * Compute how much a faction's reputation with a character has drifted
 * since the last explicit delta, based on the world clock elapsed.
 */
export function computeFactionRepDrift(
    factionId: string,
    characterCampaignStateId: string,
    currentClock: number,
): number {
    throw new NotImplementedError("computeFactionRepDrift");
}
