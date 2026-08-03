import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { ActionResources } from "@byo20/shared";
import { ActionEconomySubsystem } from "../engines/dnd-5.5e/action-economy";
import type { ActionResourceStore, CombatantState, IConditionsSubsystem } from "../engines/dnd-5.5e/action-economy";
import { initEngine } from "../index";
import type { Vec3 } from "../utils/math";

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
        const stored = this.data.get(combatantId);
        // Return a copy, not the stored reference — mirrors Redis which always parses fresh.
        return stored ? { ...stored } : { ...defaultResources() };
    }

    async setTurnResources(combatantId: string, resources: ActionResources): Promise<void> {
        this.data.set(combatantId, { ...resources });
    }

    seed(combatantId: string, resources: Partial<ActionResources>): void {
        this.data.set(combatantId, { ...defaultResources(), ...resources });
    }
}

class NoopConditions implements IConditionsSubsystem {
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

    const moverPos: Vec3 = { x: 1, y: 0, z: 0 }; // 5ft from origin
    const farPos: Vec3 = { x: 10, y: 0, z: 0 }; // destination, 50ft from origin

    function enemy(overrides: Partial<CombatantState> = {}): CombatantState {
        return {
            id: "enemy-1",
            position: { x: 0, y: 0, z: 0 },
            teamId: "red",
            conditions: [],
            reaction_used: false,
            friendlyFire: false,
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
            friendlyFire: false,
            ...overrides,
        };
    }

    test("returns candidate when enemy within 5ft of prevPosition and mover left reach", () => {
        const combatants = [mover(), enemy()];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(1);
        expect(result[0].combatantId).toBe("enemy-1");
    });

    test("returns nothing when mover is still within 5ft of enemy at newPosition", () => {
        // enemy at (0,0,0); mover moves from (1,0,0) to (0.5,0,0) — still in reach
        const newPos: Vec3 = { x: 0.5, y: 0, z: 0 };
        const combatants = [mover(), enemy()];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, newPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("returns nothing when enemy is outside 5ft of prevPosition", () => {
        const farEnemy = enemy({ position: { x: 5, y: 0, z: 0 } }); // 25ft away
        const combatants = [mover(), farEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("excludes enemy with reaction already spent", () => {
        const spentEnemy = enemy({ reaction_used: true });
        const combatants = [mover(), spentEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("excludes incapacitated enemy", () => {
        const incapacitatedEnemy = enemy({ conditions: ["incapacitated"] });
        const combatants = [mover(), incapacitatedEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("excludes paralyzed enemy (includes incapacitated)", () => {
        const paralyzedEnemy = enemy({ conditions: ["paralyzed"] });
        const combatants = [mover(), paralyzedEnemy];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("excludes ally (pvpEnabled: false, friendlyFire: false)", () => {
        const ally = enemy({ id: "ally-1", teamId: "blue" });
        const combatants = [mover(), ally];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(0);
    });

    test("includes ally when pvpEnabled: true", () => {
        const ally = enemy({ id: "ally-1", teamId: "blue" });
        const combatants = [mover(), ally];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, true);
        expect(result).toHaveLength(1);
        expect(result[0].combatantId).toBe("ally-1");
    });

    test("includes ally when friendlyFire: true (charmed to attack own team)", () => {
        const charmedAlly = enemy({ id: "charmed-ally", teamId: "blue", friendlyFire: true });
        const combatants = [mover(), charmedAlly];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
        expect(result).toHaveLength(1);
        expect(result[0].combatantId).toBe("charmed-ally");
    });

    test("excludes enemy when canSee returns false", () => {
        const combatants = [mover(), enemy()];
        const canSee = () => false;
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false, canSee);
        expect(result).toHaveLength(0);
    });

    test("includes enemy when canSee returns true", () => {
        const combatants = [mover(), enemy()];
        const canSee = () => true;
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false, canSee);
        expect(result).toHaveLength(1);
    });

    test("returns empty when moving combatant not found", () => {
        const result = subsystem.checkOpportunityAttacks("ghost", moverPos, farPos, [mover()], false);
        expect(result).toHaveLength(0);
    });

    test("multiple enemies — only eligible ones returned", () => {
        const eligible = enemy({ id: "enemy-eligible", position: { x: 0, y: 0, z: 0 } });
        const spentReaction = enemy({ id: "enemy-spent", position: { x: 0.5, y: 0, z: 0 }, reaction_used: true });
        const tooFar = enemy({ id: "enemy-far", position: { x: 5, y: 0, z: 0 } });
        const combatants = [mover(), eligible, spentReaction, tooFar];
        const result = subsystem.checkOpportunityAttacks("mover", moverPos, farPos, combatants, false);
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
        const result = await subsystem.validateAction("player-1", "ATTACK", "action", "player-1", []);
        expect(result.ok).toBe(true);
    });

    test("rejects when it is not this combatant's turn", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "action", "player-2", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/not your turn/i);
    });

    test("rejects when actions_remaining is 0", async () => {
        store.seed("player-1", { actions_remaining: 0 });
        const result = await subsystem.validateAction("player-1", "ATTACK", "action", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no actions remaining/i);
    });

    test("rejects when bonus_action already used", async () => {
        store.seed("player-1", { bonus_action_used: true });
        const result = await subsystem.validateAction("player-1", "MAGIC", "bonus_action", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/bonus action/i);
    });

    test("ok for bonus action when bonus_action_used is false", async () => {
        const result = await subsystem.validateAction("player-1", "MAGIC", "bonus_action", "player-1", []);
        expect(result.ok).toBe(true);
    });

    test("rejects when reaction already used", async () => {
        store.seed("player-1", { reaction_used: true });
        const result = await subsystem.validateAction("player-1", "ATTACK", "reaction", "player-1", []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/reaction/i);
    });

    test("ok for reaction when reaction_used is false", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "reaction", "player-1", []);
        expect(result.ok).toBe(true);
    });

    test("same action type (MAGIC) can cost action or reaction depending on ability", async () => {
        // Fireball costs action_remaining; Shield costs reaction_used
        store.seed("player-1", { actions_remaining: 1, reaction_used: true });
        const fireball = await subsystem.validateAction("player-1", "MAGIC", "action", "player-1", []);
        expect(fireball.ok).toBe(true);
        const shield = await subsystem.validateAction("player-1", "MAGIC", "reaction", "player-1", []);
        expect(shield.ok).toBe(false);
        if (!shield.ok) expect(shield.error.reason).toMatch(/reaction/i);
    });

    test("same action type (ATTACK) can cost action or reaction depending on ability", async () => {
        // Regular attack costs actions_remaining; opportunity attack costs reaction
        store.seed("player-1", { actions_remaining: 0, reaction_used: false });
        const regularAttack = await subsystem.validateAction("player-1", "ATTACK", "action", "player-1", []);
        expect(regularAttack.ok).toBe(false);
        if (!regularAttack.ok) expect(regularAttack.error.reason).toMatch(/no actions remaining/i);

        const opportunityAttack = await subsystem.validateAction("player-1", "ATTACK", "reaction", "player-1", []);
        expect(opportunityAttack.ok).toBe(true);
    });

    test("rejects standard action when incapacitated condition passed", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "action", "player-1", ["incapacitated"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("bonus action blocked when incapacitated", async () => {
        const result = await subsystem.validateAction("player-1", "MAGIC", "bonus_action", "player-1", [
            "incapacitated",
        ]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("reaction blocked when stunned", async () => {
        const result = await subsystem.validateAction("player-1", "ATTACK", "reaction", "player-1", ["stunned"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("DASH blocked when paralyzed (incapacitating condition)", async () => {
        const result = await subsystem.validateAction("player-1", "DASH", "action", "player-1", ["paralyzed"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("MAGIC blocked when stunned (incapacitating condition)", async () => {
        const result = await subsystem.validateAction("player-1", "MAGIC", "action", "player-1", ["stunned"]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/incapacitated/i);
    });

    test("all 13 action types are blocked by incapacitation when costing action", async () => {
        const allActions = [
            "ATTACK",
            "DASH",
            "DISENGAGE",
            "DODGE",
            "HELP",
            "HIDE",
            "IMPROVISED",
            "INFLUENCE",
            "MAGIC",
            "READY",
            "SEARCH",
            "STUDY",
            "UTILIZE",
        ] as const;
        for (const action of allActions) {
            store.seed("player-1", defaultResources());
            const result = await subsystem.validateAction("player-1", action, "action", "player-1", ["incapacitated"]);
            expect(result.ok).toBe(false);
        }
    });
});

// ── validateAttack ────────────────────────────────────────────────────────────

describe("validateAttack", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
        store.seed("player-1", defaultResources());
    });

    test("ok when attacks_remaining > 0", async () => {
        store.seed("player-1", { attacks_remaining: 2 });
        const result = await subsystem.validateAttack("player-1");
        expect(result.ok).toBe(true);
    });

    test("err when attacks_remaining is 0", async () => {
        store.seed("player-1", { attacks_remaining: 0 });
        const result = await subsystem.validateAttack("player-1");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no attacks remaining/i);
    });

    test("err when attacks_remaining exhausted mid Extra Attack sequence", async () => {
        store.seed("player-1", { attacks_remaining: 2 });

        // First attack — ok
        expect((await subsystem.validateAttack("player-1")).ok).toBe(true);
        await subsystem.spendResource("player-1", { resource: "attack" });

        // Second attack — ok
        expect((await subsystem.validateAttack("player-1")).ok).toBe(true);
        await subsystem.spendResource("player-1", { resource: "attack" });

        // Third attempt — exhausted
        const result = await subsystem.validateAttack("player-1");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no attacks remaining/i);
    });
});

// ── resetTurnResources ────────────────────────────────────────────────────────

describe("resetTurnResources", () => {
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
        await subsystem.resetTurnResources("player-1", 30, 1, [], true);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(30);
        expect(res.actions_remaining).toBe(1);
        expect(res.bonus_action_used).toBe(false);
        expect(res.free_interaction_used).toBe(false);
        expect(res.attacks_remaining).toBe(1);
    });

    test("preserveReaction: true — keeps reaction_used from previous state", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetTurnResources("player-1", 30, 1, [], true);
        const res = await store.getTurnResources("player-1");
        expect(res.reaction_used).toBe(true);
    });

    test("preserveReaction: false — clears reaction_used", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetTurnResources("player-1", 30, 1, [], false);
        const res = await store.getTurnResources("player-1");
        expect(res.reaction_used).toBe(false);
    });

    test("combat start — no existing key, preserveReaction: false writes clean state", async () => {
        // No seed — store returns defaults (reaction_used: false)
        await subsystem.resetTurnResources("player-1", 35, 2, [], false);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(35);
        expect(res.actions_remaining).toBe(1);
        expect(res.attacks_remaining).toBe(2);
        expect(res.reaction_used).toBe(false);
        expect(res.bonus_action_used).toBe(false);
        expect(res.free_interaction_used).toBe(false);
    });

    test("counts grant_action effects in activeEffects", async () => {
        const activeEffects = [
            { type: "grant_action", id: "haste-1" },
            { type: "light", id: "torch-1" },
            { type: "grant_action", id: "surge-1" },
        ];
        await subsystem.resetTurnResources("player-1", 30, 1, activeEffects, false);
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(3); // 1 base + 2 grant_action
    });

    test("no grant_action effects leaves actions_remaining at 1", async () => {
        await subsystem.resetTurnResources("player-1", 30, 1, [{ type: "condition", id: "x" }], false);
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(1);
    });
});

// ── resetReaction ─────────────────────────────────────────────────────────────

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

    test("reaction preserved by resetTurnResources(preserveReaction:true), cleared by resetReaction", async () => {
        store.seed("player-1", { reaction_used: true });
        await subsystem.resetTurnResources("player-1", 30, 1, [], true);
        const afterReset = await store.getTurnResources("player-1");
        expect(afterReset.reaction_used).toBe(true); // still true

        await subsystem.resetReaction("player-1");
        const afterResetReaction = await store.getTurnResources("player-1");
        expect(afterResetReaction.reaction_used).toBe(false); // now false
    });
});

// ── spendResource ─────────────────────────────────────────────────────────────

describe("spendResource", () => {
    let store: MemoryResourceStore;
    let subsystem: ActionEconomySubsystem;

    beforeEach(() => {
        [subsystem, store] = makeSubsystem();
        store.seed("player-1", defaultResources());
    });

    test("ok: decrements actions_remaining", async () => {
        const result = await subsystem.spendResource("player-1", { resource: "action" });
        expect(result.ok).toBe(true);
        const res = await store.getTurnResources("player-1");
        expect(res.actions_remaining).toBe(0);
    });

    test("ok: sets bonus_action_used to true", async () => {
        const result = await subsystem.spendResource("player-1", { resource: "bonus_action" });
        expect(result.ok).toBe(true);
        const res = await store.getTurnResources("player-1");
        expect(res.bonus_action_used).toBe(true);
    });

    test("ok: sets reaction_used to true", async () => {
        const result = await subsystem.spendResource("player-1", { resource: "reaction" });
        expect(result.ok).toBe(true);
        const res = await store.getTurnResources("player-1");
        expect(res.reaction_used).toBe(true);
    });

    test("ok: sets free_interaction_used to true", async () => {
        const result = await subsystem.spendResource("player-1", { resource: "free_interaction" });
        expect(result.ok).toBe(true);
        const res = await store.getTurnResources("player-1");
        expect(res.free_interaction_used).toBe(true);
    });

    test("ok: decrements attacks_remaining", async () => {
        const result = await subsystem.spendResource("player-1", { resource: "attack" });
        expect(result.ok).toBe(true);
        const res = await store.getTurnResources("player-1");
        expect(res.attacks_remaining).toBe(0);
    });

    test("rejects when actions_remaining is 0", async () => {
        store.seed("player-1", { actions_remaining: 0 });
        const result = await subsystem.spendResource("player-1", { resource: "action" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no actions remaining/i);
    });

    test("rejects when bonus_action already used", async () => {
        store.seed("player-1", { bonus_action_used: true });
        const result = await subsystem.spendResource("player-1", { resource: "bonus_action" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/bonus action/i);
    });

    test("rejects when reaction already used", async () => {
        store.seed("player-1", { reaction_used: true });
        const result = await subsystem.spendResource("player-1", { resource: "reaction" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/reaction/i);
    });

    test("rejects when free_interaction already used", async () => {
        store.seed("player-1", { free_interaction_used: true });
        const result = await subsystem.spendResource("player-1", { resource: "free_interaction" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/free/i);
    });

    test("rejects when attacks_remaining is 0", async () => {
        store.seed("player-1", { attacks_remaining: 0 });
        const result = await subsystem.spendResource("player-1", { resource: "attack" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/no attacks remaining/i);
    });

    test("movement: deducts feet on normal terrain", async () => {
        store.seed("player-1", { movement_remaining: 30 });
        await subsystem.spendResource("player-1", { resource: "movement", feet: 10 });
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(20);
    });

    test("movement: doubles cost on difficult terrain", async () => {
        store.seed("player-1", { movement_remaining: 30 });
        await subsystem.spendResource("player-1", { resource: "movement", feet: 10, difficultTerrain: true });
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(10); // 10*2 = 20 deducted from 30
    });

    test("movement: rejects when insufficient", async () => {
        store.seed("player-1", { movement_remaining: 30 });
        const result = await subsystem.spendResource("player-1", { resource: "movement", feet: 100 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/insufficient movement/i);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(30); // unchanged on rejection
    });

    test("movement: rejects on difficult terrain when cost exceeds remaining", async () => {
        store.seed("player-1", { movement_remaining: 30 });
        const result = await subsystem.spendResource("player-1", {
            resource: "movement",
            feet: 20,
            difficultTerrain: true,
        }); // cost = 40, remaining = 30
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.reason).toMatch(/insufficient movement/i);
        const res = await store.getTurnResources("player-1");
        expect(res.movement_remaining).toBe(30); // unchanged on rejection
    });
});
