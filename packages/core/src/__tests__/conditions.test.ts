/**
 * Unit tests for ConditionsSubsystem.
 *
 * All I/O is in-memory (MemoryEffectsStore, MemoryExhaustionStore, MemoryStateStore).
 * No Redis, no Postgres, no network — bun test runs headless.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type {
    ActiveEffect,
    ApplyConditionOptions,
    CharacterCampaignState,
    ConditionName,
    IGameStateStore,
} from "@byo20/shared";
import { ConditionsSubsystem } from "../engines/dnd-5.5e/conditions";
import type { EncounterEffectsStore, ExhaustionStore } from "../engines/dnd-5.5e/conditions";
import { initEngine } from "../index";

// ── Initialise logger ─────────────────────────────────────────────────────────

beforeAll(() => {
    initEngine();
});

// ── Test doubles ──────────────────────────────────────────────────────────────

/** In-memory implementation of EncounterEffectsStore. Stores effects keyed by entityId. */
class MemoryEffectsStore implements EncounterEffectsStore {
    private data = new Map<string, ActiveEffect[]>();

    async getActiveEffects(entityId: string): Promise<ActiveEffect[]> {
        return [...(this.data.get(entityId) ?? [])];
    }

    async addEntityEffect(entityId: string, effect: ActiveEffect): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        this.data.set(entityId, [...current, effect]);
    }

    async removeEntityEffectsBySource(
        entityId: string,
        conditionName: ConditionName,
        sourceId: string,
    ): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        const remaining = current.filter((e) => !(e.conditionName === conditionName && e.sourceId === sourceId));
        if (remaining.length === 0) {
            this.data.delete(entityId);
        } else {
            this.data.set(entityId, remaining);
        }
    }

    /** Test helper — preset effects without going through applyCondition. */
    seed(entityId: string, effects: ActiveEffect[]): void {
        this.data.set(entityId, [...effects]);
    }

    /** Test helper — inspect raw stored effects. */
    snapshot(entityId: string): ActiveEffect[] {
        return [...(this.data.get(entityId) ?? [])];
    }
}

/** In-memory implementation of ExhaustionStore. */
class MemoryExhaustionStore implements ExhaustionStore {
    private data = new Map<string, number>();

    async getExhaustionLevel(characterId: string): Promise<number> {
        return this.data.get(characterId) ?? 0;
    }

    async setExhaustionLevel(characterId: string, level: number): Promise<void> {
        this.data.set(characterId, level);
    }
}

/** Minimal game state store double — only implements what ConditionsSubsystem uses. */
class MemoryStateStore {
    private states = new Map<string, CharacterCampaignState>();

    /** Preset a CharacterCampaignState row. */
    seed(state: CharacterCampaignState): void {
        this.states.set(state.id, { ...state });
    }

    /** Read the last-saved state for assertions. */
    get(id: string): CharacterCampaignState | undefined {
        return this.states.get(id);
    }

    async getCharacterCampaignState(id: string): Promise<CharacterCampaignState> {
        const s = this.states.get(id);
        if (!s) throw new Error(`MemoryStateStore: no state for id=${id}`);
        return { ...s };
    }

    async saveCharacterCampaignState(state: CharacterCampaignState): Promise<void> {
        this.states.set(state.id, { ...state });
    }
}

/** Minimal CharacterCampaignState fixture. */
function makeCampaignState(overrides: Partial<CharacterCampaignState> = {}): CharacterCampaignState {
    return {
        id: "css-00000001",
        characterId: "char-00000001",
        campaignId: "camp-00000001",
        level: 1,
        xp: 0,
        hp: { current: 10, max: 10 },
        hitDiceRemaining: 1,
        spellSlots: null,
        conditions: [],
        deathSaves: null,
        position: null,
        isActive: true,
        exhaustionLevel: 0,
        tempHp: 0,
        heroicInspiration: false,
        classResources: null,
        preparedSpells: null,
        weaponMasteries: null,
        languages: ["common"],
        skillProficiencies: null,
        savingThrowProfs: [],
        featsTaken: [],
        concentratingOn: null,
        toolProficiencies: [],
        pendingLevelup: null,
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    };
}

/** Minimal ApplyConditionOptions fixture. */
function makeOpts(overrides: Partial<ApplyConditionOptions> = {}): ApplyConditionOptions {
    return {
        encounterId: "enc-00000001",
        entityId: "entity-00000001",
        conditionName: "poisoned",
        sourceId: "source-00000001",
        sourceKind: "spell",
        scope: "COMBAT",
        expiresAtRound: null,
        causeId: "cause-00000001",
        ...overrides,
    };
}

/** Factory for a ConditionsSubsystem with optional pre-seeded stores. */
function makeSubsystem(
    effects?: MemoryEffectsStore,
    exhaustion?: MemoryExhaustionStore,
    stateStore?: MemoryStateStore,
    encounterId = "enc-00000001",
): [ConditionsSubsystem, MemoryEffectsStore, MemoryExhaustionStore, MemoryStateStore] {
    const e = effects ?? new MemoryEffectsStore();
    const x = exhaustion ?? new MemoryExhaustionStore();
    const s = stateStore ?? new MemoryStateStore();
    const sub = new ConditionsSubsystem(e, x, s as unknown as IGameStateStore, encounterId);
    return [sub, e, x, s];
}

// ── getModifiers (pure function) ──────────────────────────────────────────────

describe("getModifiers", () => {
    const [sub] = makeSubsystem();

    test("no conditions → all defaults", () => {
        const result = sub.getModifiers([], "ATTACK_ROLL");
        expect(result.advantage).toBe(false);
        expect(result.disadvantage).toBe(false);
        expect(result.autoCrit).toBe(false);
        expect(result.autoFail).toBe(false);
        expect(result.speedMultiplier).toBe(1);
        expect(result.actionsBlocked).toBe(false);
        expect(result.sources).toHaveLength(0);
    });

    test("blinded → disadvantage on ATTACK_ROLL, not on ABILITY_CHECK", () => {
        const atk = sub.getModifiers(["blinded"], "ATTACK_ROLL");
        expect(atk.disadvantage).toBe(true);
        expect(atk.sources).toContain("blinded");

        const chk = sub.getModifiers(["blinded"], "ABILITY_CHECK");
        expect(chk.disadvantage).toBe(false);
    });

    test("poisoned → disadvantage on ATTACK_ROLL and ABILITY_CHECK and SKILL_CHECK", () => {
        expect(sub.getModifiers(["poisoned"], "ATTACK_ROLL").disadvantage).toBe(true);
        expect(sub.getModifiers(["poisoned"], "ABILITY_CHECK").disadvantage).toBe(true);
        expect(sub.getModifiers(["poisoned"], "SKILL_CHECK").disadvantage).toBe(true);
        expect(sub.getModifiers(["poisoned"], "SAVING_THROW").disadvantage).toBe(false);
    });

    test("frightened → disadvantage on attacks, ability checks, and skill checks", () => {
        expect(sub.getModifiers(["frightened"], "ATTACK_ROLL").disadvantage).toBe(true);
        expect(sub.getModifiers(["frightened"], "ABILITY_CHECK").disadvantage).toBe(true);
        expect(sub.getModifiers(["frightened"], "SKILL_CHECK").disadvantage).toBe(true);
        expect(sub.getModifiers(["frightened"], "SAVING_THROW").disadvantage).toBe(false);
    });

    test("invisible → advantage on ATTACK_ROLL only", () => {
        expect(sub.getModifiers(["invisible"], "ATTACK_ROLL").advantage).toBe(true);
        expect(sub.getModifiers(["invisible"], "ABILITY_CHECK").advantage).toBe(false);
    });

    test("grappled → speedMultiplier=0, no other modifiers", () => {
        const r = sub.getModifiers(["grappled"], "ATTACK_ROLL");
        expect(r.speedMultiplier).toBe(0);
        expect(r.actionsBlocked).toBe(false);
        expect(r.autoFail).toBe(false);
        expect(r.autoCrit).toBe(false);
    });

    test("incapacitated → actionsBlocked only (speed not reduced)", () => {
        const r = sub.getModifiers(["incapacitated"], "ATTACK_ROLL");
        expect(r.actionsBlocked).toBe(true);
        expect(r.speedMultiplier).toBe(1);
    });

    test("paralyzed → actionsBlocked, speedMultiplier=0, autoFail on SAVING_THROW, autoCrit", () => {
        const save = sub.getModifiers(["paralyzed"], "SAVING_THROW");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedMultiplier).toBe(0);
        expect(save.autoFail).toBe(true);
        expect(save.autoCrit).toBe(true);
        expect(save.sources).toContain("paralyzed");

        // autoFail does not apply to non-saving-throw checks
        const atk = sub.getModifiers(["paralyzed"], "ATTACK_ROLL");
        expect(atk.autoFail).toBe(false);
    });

    test("stunned → actionsBlocked, speedMultiplier=0, autoFail on SAVING_THROW, no autoCrit", () => {
        const save = sub.getModifiers(["stunned"], "SAVING_THROW");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedMultiplier).toBe(0);
        expect(save.autoFail).toBe(true);
        expect(save.autoCrit).toBe(false);
    });

    test("unconscious → actionsBlocked, speedMultiplier=0, autoFail on SAVING_THROW, autoCrit", () => {
        const save = sub.getModifiers(["unconscious"], "SAVING_THROW");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedMultiplier).toBe(0);
        expect(save.autoFail).toBe(true);
        expect(save.autoCrit).toBe(true);
    });

    test("petrified → actionsBlocked, speedMultiplier=0, autoFail on SAVING_THROW, no autoCrit", () => {
        const save = sub.getModifiers(["petrified"], "SAVING_THROW");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedMultiplier).toBe(0);
        expect(save.autoFail).toBe(true);
        expect(save.autoCrit).toBe(false);
    });

    test("prone → disadvantage on ATTACK_ROLL only", () => {
        expect(sub.getModifiers(["prone"], "ATTACK_ROLL").disadvantage).toBe(true);
        expect(sub.getModifiers(["prone"], "ABILITY_CHECK").disadvantage).toBe(false);
    });

    test("restrained → speedMultiplier=0, disadvantage on ATTACK_ROLL and SAVING_THROW", () => {
        const atk = sub.getModifiers(["restrained"], "ATTACK_ROLL");
        expect(atk.speedMultiplier).toBe(0);
        expect(atk.disadvantage).toBe(true);

        const save = sub.getModifiers(["restrained"], "SAVING_THROW");
        expect(save.disadvantage).toBe(true);
    });

    test("blinded + invisible → both advantage and disadvantage set (engine cancels)", () => {
        const r = sub.getModifiers(["blinded", "invisible"], "ATTACK_ROLL");
        expect(r.advantage).toBe(true);
        expect(r.disadvantage).toBe(true);
        expect(r.sources).toContain("invisible");
        expect(r.sources).toContain("blinded");
    });

    test("sources only lists conditions that contributed", () => {
        // Poisoned contributes to ATTACK_ROLL disadvantage; deafened contributes nothing
        const r = sub.getModifiers(["poisoned", "deafened"], "ATTACK_ROLL");
        expect(r.sources).toContain("poisoned");
        expect(r.sources).not.toContain("deafened");
    });
});

// ── isIncapacitated (pure function) ───────────────────────────────────────────

describe("isIncapacitated", () => {
    const [sub] = makeSubsystem();

    test("empty conditions → false", () => {
        expect(sub.isIncapacitated([])).toBe(false);
    });

    test.each([
        ["incapacitated"],
        ["paralyzed"],
        ["stunned"],
        ["petrified"],
        ["unconscious"],
    ] as ConditionName[][])("%s → true", (condition) => {
        expect(sub.isIncapacitated([condition as ConditionName])).toBe(true);
    });

    test("non-incapacitating conditions → false", () => {
        expect(sub.isIncapacitated(["blinded", "poisoned", "prone"])).toBe(false);
    });

    test("incapacitated in a mixed list → true", () => {
        expect(sub.isIncapacitated(["blinded", "stunned", "prone"])).toBe(true);
    });
});

// ── applyCondition ────────────────────────────────────────────────────────────

describe("applyCondition", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("creates an ActiveEffect with correct fields and returns it", async () => {
        const opts = makeOpts({ conditionName: "poisoned", scope: "COMBAT", expiresAtRound: null });
        const result = await sub.applyCondition(opts);

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const effect = result.value;
        expect(effect.conditionName).toBe("poisoned");
        expect(effect.targetId).toBe(opts.entityId);
        expect(effect.sourceId).toBe(opts.sourceId);
        expect(effect.sourceKind).toBe(opts.sourceKind);
        expect(effect.scope).toBe("COMBAT");
        expect(effect.expiresAtRound).toBeNull();
        expect(effect.causeId).toBe(opts.causeId);
        expect(typeof effect.id).toBe("string");
        expect(effect.id).toHaveLength(36); // UUID v4 length
    });

    test("stores the effect in the effects store", async () => {
        const opts = makeOpts({ entityId: "entity-A", conditionName: "blinded" });
        await sub.applyCondition(opts);

        const stored = store.snapshot("entity-A");
        expect(stored).toHaveLength(1);
        expect(stored[0].conditionName).toBe("blinded");
    });

    test("TIMED scope requires non-null expiresAtRound", async () => {
        const opts = makeOpts({ scope: "TIMED", expiresAtRound: null });
        const result = await sub.applyCondition(opts);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.action_type).toBe("CONDITION_APPLY");
    });

    test("COMBAT scope rejects non-null expiresAtRound", async () => {
        const opts = makeOpts({ scope: "COMBAT", expiresAtRound: 3 });
        const result = await sub.applyCondition(opts);
        expect(result.ok).toBe(false);
    });

    test("SUSTAINED scope rejects non-null expiresAtRound", async () => {
        const opts = makeOpts({ scope: "SUSTAINED", expiresAtRound: 5 });
        const result = await sub.applyCondition(opts);
        expect(result.ok).toBe(false);
    });

    test("TIMED scope with valid expiresAtRound succeeds", async () => {
        const opts = makeOpts({ scope: "TIMED", expiresAtRound: 3 });
        const result = await sub.applyCondition(opts);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.expiresAtRound).toBe(3);
    });

    test("idempotent: same (conditionName, sourceId) returns existing effect", async () => {
        const opts = makeOpts({ conditionName: "frightened", sourceId: "goblin-01" });
        const first = await sub.applyCondition(opts);
        const second = await sub.applyCondition(opts);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.value.id).toBe(first.value.id);

        // Only one effect should be stored
        const stored = store.snapshot(opts.entityId);
        expect(stored).toHaveLength(1);
    });

    test("different sourceId applies a second effect (multi-source stacking)", async () => {
        const entity = "entity-multi";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "dragon-01" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "goblin-01" }));

        const stored = store.snapshot(entity);
        expect(stored).toHaveLength(2);
        const sources = stored.map((e) => e.sourceId);
        expect(sources).toContain("dragon-01");
        expect(sources).toContain("goblin-01");
    });
});

// ── removeCondition ───────────────────────────────────────────────────────────

describe("removeCondition", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("removes the matching (conditionName, sourceId) effect", async () => {
        const opts = makeOpts({ entityId: "entity-A", conditionName: "grappled", sourceId: "orc-01" });
        await sub.applyCondition(opts);

        const result = await sub.removeCondition("entity-A", "grappled", "orc-01");
        expect(result.ok).toBe(true);
        expect(store.snapshot("entity-A")).toHaveLength(0);
    });

    test("multi-source: removing one source leaves the other active", async () => {
        const entity = "entity-B";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-A" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-B" }));

        await sub.removeCondition(entity, "frightened", "src-A");
        const remaining = store.snapshot(entity);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].sourceId).toBe("src-B");
    });

    test("returns ok even when no matching effect exists", async () => {
        const result = await sub.removeCondition("entity-unknown", "blinded", "no-source");
        expect(result.ok).toBe(true);
    });
});

// ── getActiveConditions ───────────────────────────────────────────────────────

describe("getActiveConditions", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("returns empty array when no effects", async () => {
        const conditions = await sub.getActiveConditions("entity-none");
        expect(conditions).toHaveLength(0);
    });

    test("returns unique condition names across multiple effects", async () => {
        const entity = "entity-C";
        // Two frightened sources → should appear once in the result
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-1" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-2" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "poisoned", sourceId: "src-3" }));

        const conditions = await sub.getActiveConditions(entity);
        expect(conditions).toHaveLength(2);
        expect(conditions).toContain("frightened");
        expect(conditions).toContain("poisoned");
    });

    test("condition is absent after all sources are removed", async () => {
        const entity = "entity-D";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "grappled", sourceId: "src-1" }));
        await sub.removeCondition(entity, "grappled", "src-1");

        const conditions = await sub.getActiveConditions(entity);
        expect(conditions).toHaveLength(0);
    });
});

// ── getActiveEffects ──────────────────────────────────────────────────────────

describe("getActiveEffects", () => {
    let sub: ConditionsSubsystem;

    beforeEach(() => {
        [sub] = makeSubsystem();
    });

    test("returns all stored effects including multi-source duplicates", async () => {
        const entity = "entity-E";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "s1" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "s2" }));

        const effects = await sub.getActiveEffects(entity);
        expect(effects).toHaveLength(2);
    });
});

// ── setExhaustionLevel / getExhaustionLevel ───────────────────────────────────

describe("setExhaustionLevel", () => {
    let sub: ConditionsSubsystem;
    let xStore: MemoryExhaustionStore;

    beforeEach(() => {
        [sub, , xStore] = makeSubsystem();
    });

    test.each([0, 1, 3, 6])("accepts valid level %i", async (level) => {
        const result = await sub.setExhaustionLevel("char-01", level);
        expect(result.ok).toBe(true);
        expect(await xStore.getExhaustionLevel("char-01")).toBe(level);
    });

    test("rejects level 7 (above max)", async () => {
        const result = await sub.setExhaustionLevel("char-01", 7);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.action_type).toBe("EXHAUSTION_SET");
    });

    test("rejects level -1 (below min)", async () => {
        const result = await sub.setExhaustionLevel("char-01", -1);
        expect(result.ok).toBe(false);
    });

    test("rejects non-integer (2.5)", async () => {
        const result = await sub.setExhaustionLevel("char-01", 2.5);
        expect(result.ok).toBe(false);
    });
});

describe("getExhaustionLevel", () => {
    test("returns stored level", async () => {
        const [sub, , xStore] = makeSubsystem();
        await xStore.setExhaustionLevel("char-02", 3);
        expect(await sub.getExhaustionLevel("char-02")).toBe(3);
    });

    test("returns 0 when key absent", async () => {
        const [sub] = makeSubsystem();
        expect(await sub.getExhaustionLevel("char-absent")).toBe(0);
    });
});

// ── flushConditionsToPostgres ─────────────────────────────────────────────────

describe("flushConditionsToPostgres", () => {
    test("writes deduplicated conditions and exhaustion level to Postgres", async () => {
        const stateStore = new MemoryStateStore();
        const initialState = makeCampaignState({ id: "css-01", conditions: [], exhaustionLevel: 0 });
        stateStore.seed(initialState);

        const xStore = new MemoryExhaustionStore();
        await xStore.setExhaustionLevel("entity-X", 2);

        const [sub, eStore] = makeSubsystem(undefined, xStore, stateStore);

        // Apply two sources of frightened (should flush as a single condition)
        await sub.applyCondition(makeOpts({ entityId: "entity-X", conditionName: "frightened", sourceId: "s1" }));
        await sub.applyCondition(makeOpts({ entityId: "entity-X", conditionName: "frightened", sourceId: "s2" }));
        await sub.applyCondition(makeOpts({ entityId: "entity-X", conditionName: "poisoned", sourceId: "s3" }));

        await sub.flushConditionsToPostgres("entity-X", "css-01");

        const saved = stateStore.get("css-01");
        expect(saved).toBeDefined();
        if (!saved) return;

        // Conditions deduplicated: frightened appears once despite two sources
        expect(saved.conditions.sort()).toEqual(["frightened", "poisoned"]);
        expect(saved.exhaustionLevel).toBe(2);
    });

    test("flushes empty conditions list when no effects are active", async () => {
        const stateStore = new MemoryStateStore();
        stateStore.seed(makeCampaignState({ id: "css-02", conditions: ["poisoned"], exhaustionLevel: 1 }));

        const [sub] = makeSubsystem(undefined, undefined, stateStore);
        await sub.flushConditionsToPostgres("entity-Y", "css-02");

        const saved = stateStore.get("css-02");
        expect(saved?.conditions).toHaveLength(0);
        expect(saved?.exhaustionLevel).toBe(0);
    });
});
