import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { ActionResources } from "@byo20/shared";
import { initEngine } from "../index";
import {
    ActionEconomySubsystem,
} from "../engines/dnd-5.5e/action-economy";
import type {
    ActionResourceStore,
    CombatantState,
    ConditionsSubsystem,
} from "../engines/dnd-5.5e/action-economy";
import type { Vec3 } from "../utils/geometry";

beforeAll(() => {
    initEngine();
});

// ── Test doubles ──────────────────────────────────────────────────────────────

function defaultResources(): ActionResources {
    return {
        movement_remaining: 30,
        actions_remaining: 1,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        attacks_remaining: 1,
    };
}

class MemoryResourceStore implements ActionResourceStore {
    private data = new Map<string, ActionResources>();

    async getTurnResources(combatantId: string): Promise<ActionResources> {
        return this.data.get(combatantId) ?? { ...defaultResources() };
    }

    async setTurnResources(combatantId: string, resources: ActionResources): Promise<void> {
        this.data.set(combatantId, { ...resources });
    }

    seed(combatantId: string, resources: Partial<ActionResources>): void {
        this.data.set(combatantId, { ...defaultResources(), ...resources });
    }
}

class NoopConditions implements ConditionsSubsystem {
    async getActiveConditions(_combatantId: string): Promise<string[]> {
        return [];
    }
}

function makeSubsystem(store?: MemoryResourceStore): [ActionEconomySubsystem, MemoryResourceStore] {
    const s = store ?? new MemoryResourceStore();
    return [new ActionEconomySubsystem(s, new NoopConditions()), s];
}

// ── checkOpportunityAttacks ───────────────────────────────────────────────────

describe("checkOpportunityAttacks", () => {
    const [subsystem] = makeSubsystem();

    const moverPos: Vec3 = { x: 1, y: 0, z: 0 };   // 5ft from origin
    const farPos: Vec3 = { x: 10, y: 0, z: 0 };     // destination, 50ft from origin

    function enemy(overrides: Partial<CombatantState> = {}): CombatantState {
        return {
            id: "enemy-1",
            position: { x: 0, y: 0, z: 0 },
            teamId: "red",
            conditions: [],
            reaction_used: false,
            ...overrides,
        };
    }

    function mover(overrides: Partial<CombatantState> = {}): CombatantState {
        return {
            id: "mover",
            position: moverPos,
            teamId: "blue",
            conditions: [],
            reaction_used: false,
            ...overrides,
        };
    }

    test("returns candidate when enemy within 5ft of prevPosition and mover left reach", () => {
        const combatants = [mover(), enemy()];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(1);
        expect(result[0].combatantId).toBe("enemy-1");
    });

    test("returns nothing when mover is still within 5ft of enemy at newPosition", () => {
        // enemy at (0,0,0); mover moves from (1,0,0) to (0.5,0,0) — still in reach
        const newPos: Vec3 = { x: 0.5, y: 0, z: 0 };
        const combatants = [mover(), enemy()];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, newPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("returns nothing when enemy is outside 5ft of prevPosition", () => {
        const farEnemy = enemy({ position: { x: 5, y: 0, z: 0 } }); // 25ft away
        const combatants = [mover(), farEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("excludes enemy with reaction already spent", () => {
        const spentEnemy = enemy({ reaction_used: true });
        const combatants = [mover(), spentEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("excludes incapacitated enemy", () => {
        const incapacitatedEnemy = enemy({ conditions: ["incapacitated"] });
        const combatants = [mover(), incapacitatedEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("excludes paralyzed enemy (includes incapacitated)", () => {
        const paralyzedEnemy = enemy({ conditions: ["paralyzed"] });
        const combatants = [mover(), paralyzedEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("excludes ally (same teamId)", () => {
        const ally = enemy({ id: "ally-1", teamId: "blue" });
        const combatants = [mover(), ally];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(0);
    });

    test("excludes enemy when canSee returns false", () => {
        const combatants = [mover(), enemy()];
        const canSee = () => false;
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, canSee);
        expect(result).toHaveLength(0);
    });

    test("includes enemy when canSee returns true", () => {
        const combatants = [mover(), enemy()];
        const canSee = () => true;
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, canSee);
        expect(result).toHaveLength(1);
    });

    test("returns empty when moving combatant not found", () => {
        const result = subsystem.checkOpportunityAttacks("ghost", moverPos, farPos, [mover()]);
        expect(result).toHaveLength(0);
    });

    test("multiple enemies — only eligible ones returned", () => {
        const eligible = enemy({ id: "enemy-eligible", position: { x: 0, y: 0, z: 0 } });
        const spentReaction = enemy({ id: "enemy-spent", position: { x: 0.5, y: 0, z: 0 }, reaction_used: true });
        const tooFar = enemy({ id: "enemy-far", position: { x: 5, y: 0, z: 0 } });
        const combatants = [mover(), eligible, spentReaction, tooFar];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants);
        expect(result).toHaveLength(1);
        expect(result[0].combatantId).toBe("enemy-eligible");
    });
});

// ── validateAction ────────────────────────────────────────────────────────────

describe("validateAction", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
        store.seed("player-1", defaultResources());
    });

    test("ok when it is the combatant's turn and resources available", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "player-1", []);
        expect(result.ok).toBe(true);
    });

    test("rejects when it is not this combatant's turn", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "player-2", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/not your turn/i);
    });

    test("rejects when actions_remaining is 0", async () => {
        store.seed("player-1", { actions_remaining: 0 });
        const result = await subsystem.validateAction("player-1", "ATTACK", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no actions remaining/i);
    });

    test("rejects BONUS_ACTION when bonus_action_used", async () => {
        store.seed("player-1", { bonus_action_used: true });
        const result = await subsystem.validateAction("player-1", "BONUS_ACTION", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/bonus action/i);
    });

    test("rejects REACTION when reaction_used", async () => {
        store.seed("player-1", { reaction_used: true });
        const result = await subsystem.validateAction("player-1", "REACTION", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/reaction/i);
    });

    test("rejects FREE_INTERACTION when already used", async () => {
        store.seed("player-1", { free_interaction_used: true });
        const result = await subsystem.validateAction("player-1", "FREE_INTERACTION", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/free/i);
    });

    test("rejects standard action when incapacitated condition passed", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "player-1", ["incapacitated"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("rejects BONUS_ACTION when paralyzed (includes incapacitated)", async () => {
        const result = await subsystem.validateAction("player-1", "BONUS_ACTION", "player-1", ["paralyzed"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("rejects REACTION when stunned (includes incapacitated)", async () => {
        const result = await subsystem.validateAction("player-1", "REACTION", "player-1", ["stunned"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("FREE_INTERACTION allowed even when incapacitated (spec: not blocked)", async () => {
        // FREE_INTERACTION is not in the list blocked by incapacitation per spec
        const result = await subsystem.validateAction("player-1", "FREE_INTERACTION", "player-1", ["incapacitated"]);
        expect(result.ok).toBe(true);
    });

    test("all 12 standard action types are blocked by incapacitation", async () => {
        const standardActions = [
            "ATTACK", "DASH", "DISENGAGE", "DODGE", "HELP", "HIDE",
            "INFLUENCE", "MAGIC", "READY", "SEARCH", "STUDY", "UTILIZE",
        ] as const;
        for (const action of standardActions) {
            store.seed("player-1", defaultResources());
            const result = await subsystem.validateAction("player-1", action, "player-1", ["incapacitated"]);
            expect(result.ok).toBe(false);
        }
    });
});

// ── spendMovement ─────────────────────────────────────────────────────────────

describe("spendMovement", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
        store.seed("player-1", { movement_remaining: 30 });
    });

    test("deducts feet on normal terrain", async () => {
        await subsystem.spendMovement("player-1", 10, false);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(20);
    });

    test("doubles cost on difficult terrain", async () => {
        await subsystem.spendMovement("player-1", 10, true);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(10); // 10*2 = 20 deducted from 30
    });

    test("clamps at 0, does not go negative", async () => {
        await subsystem.spendMovement("player-1", 100, false);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(0);
    });

    test("difficult terrain clamp at 0", async () => {
        await subsystem.spendMovement("player-1", 20, true); // cost = 40, remaining = 30
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(0);
    });
});

// ── resetBetweenTurns vs resetReaction ───────────────────────────────────────

describe("resetBetweenTurns", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
    });

    test("resets movement, actions, bonus action, attacks, free interaction", async () => {
        store.seed("player-1", {
            movement_remaining: 0,
            actions_remaining: 0,
            bonus_action_used: true,
            reaction_used: true,
            free_interaction_used: true,
            attacks_remaining: 0,
        });
        await subsystem.resetBetweenTurns("player-1", 30, 1, []);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(30);
        expect(res.actions_remaining).toBe(1);
        expect(res.bonus_action_used).toBe(false);
        expect(res.free_interaction_used).toBe(false);
        expect(res.attacks_remaining).toBe(1);
    });

    test("preserves reaction_used across turn transition", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetBetweenTurns("player-1", 30, 1, []);
        const res = await store.getTurnResources("player-1");
        expect(res.reaction_used).toBe(true);
    });

    test("counts grant_action effects in activeEffects", async () => {
        const activeEffects = [
            { type: "grant_action", id: "haste-1" },
            { type: "light", id: "torch-1" },
            { type: "grant_action", id: "surge-1" },
        ];
        await subsystem.resetBetweenTurns("player-1", 30, 1, activeEffects);
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(3); // 1 base + 2 grant_action
    });

    test("no grant_action effects leaves actions_remaining at 1", async () => {
        await subsystem.resetBetweenTurns("player-1", 30, 1, [{ type: "condition", id: "x" }]);
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(1);
    });
});

describe("resetReaction", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
    });

    test("sets reaction_used to false", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetReaction("player-1");
        const res = await store.getTurnResources("player-1");
        expect(res.reaction_used).toBe(false);
    });

    test("does not disturb other resources", async () => {
        store.seed("player-1", {
            movement_remaining: 15,
            actions_remaining: 0,
            bonus_action_used: true,
            reaction_used: true,
            free_interaction_used: true,
            attacks_remaining: 0,
        });
        await subsystem.resetReaction("player-1");
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(15);
        expect(res.actions_remaining).toBe(0);
        expect(res.bonus_action_used).toBe(true);
        expect(res.free_interaction_used).toBe(true);
        expect(res.attacks_remaining).toBe(0);
    });

    test("reaction not reset by resetBetweenTurns alone (requires resetReaction)", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetBetweenTurns("player-1", 30, 1, []);
        const afterBetweenTurns = await store.getTurnResources("player-1");
        expect(afterBetweenTurns.reaction_used).toBe(true); // still true

        await subsystem.resetReaction("player-1");
        const afterResetReaction = await store.getTurnResources("player-1");
        expect(afterResetReaction.reaction_used).toBe(false); // now false
    });
});

// ── initTurnResources ─────────────────────────────────────────────────────────

describe("initTurnResources", () => {
    test("writes fresh budget with provided speed and attacks", async () => {
        const [subsystem, store] = makeSubsystem();
        await subsystem.initTurnResources("player-1", 40, 2);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(40);
        expect(res.actions_remaining).toBe(1);
        expect(res.attacks_remaining).toBe(2);
        expect(res.bonus_action_used).toBe(false);
        expect(res.reaction_used).toBe(false);
        expect(res.free_interaction_used).toBe(false);
    });
});

// ── grantAdditionalAction ─────────────────────────────────────────────────────

describe("grantAdditionalAction", () => {
    test("increments actions_remaining by 1", async () => {
        const [subsystem, store] = makeSubsystem();
        store.seed("player-1", { actions_remaining: 1 });
        await subsystem.grantAdditionalAction("player-1");
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(2);
    });
});
