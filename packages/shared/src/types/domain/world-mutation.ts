/**
 * Fixed vocabulary for world mutation instructions.
 *
 * Used by quests (terminal payloads), the AI layer (Orchestrator), and the engine.
 * Lives in @byo20/shared so all three layers can share the type without circular imports.
 */

/** A world mutation instruction dispatched when a quest node resolves or an agenda event fires. */
export type WorldMutationInstruction =
    | {
          type: "spawn_npc";
          npcTemplateId: string;
          zoneQ: number;
          zoneR: number;
          position: { x: number; y: number; z: number };
      }
    | {
          type: "generate_wreckage";
          zoneQ: number;
          zoneR: number;
          description: string;
      }
    | {
          type: "add_npc_memory";
          npcId: string;
          eventLogId: string;
          sentiment: "positive" | "negative" | "neutral";
          significance: boolean;
      }
    | {
          type: "reveal_quest_marker";
          questId: string;
          position: { x: number; y: number; z: number };
      };
