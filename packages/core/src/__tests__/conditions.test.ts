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
import type { IEncounterEffectsStore, IExhaustionStore } from "../engines/dnd-5.5e/interfaces";
import { initEngine } from "../index";

// ── Initialise logger ─────────────────────────────────────────────────────────

beforeAll(() => {
    initEngine();
});

// ── Test doubles ──────────────────────────────────────────────────────────────

/** In-memory implementation of EncounterEffectsStore. Stores effects keyed by entityId. */
class MemoryEffectsStore implements IEncounterEffectsStore {
    private data = new Map<string, ActiveEffect[]>();

    async getActiveEffects(entityId: string): Promise<ActiveEffect[]> {
        return [...(this.data.get(entityId) ?? [])];
    }

    async addEntityEffect(entityId: string, effect: ActiveEffect): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        this.data.set(entityId, [...current, effect]);
    }

    async removeEntityEffectsBySource(entityId: string, name: string, sourceId: string): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        const remaining = current.filter((e) => !(e.name === name && e.sourceId === sourceId));
        if (remaining.length === 0) {
            this.data.delete(entityId);
        } else {
            this.data.set(entityId, remaining);
        }
    }

    async removeAllEffectsBySource(entityId: string, sourceId: string): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        const remaining = current.filter((e) => e.sourceId !== sourceId);
        if (remaining.length === 0) {
            this.data.delete(entityId);
        } else {
            this.data.set(entityId, remaining);
        }
    }

    async clearAllEffects(entityId: string): Promise<void> {
        this.data.delete(entityId);
    }

    async removeAllEffectsByCondition(entityId: string, name: string): Promise<void> {
        const current = this.data.get(entityId) ?? [];
        const remaining = current.filter((e) => e.name !== name);
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
class MemoryExhaustionStore implements IExhaustionStore {
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
        scope: "COMBAT",
        expiresAtRound: null,
        expiresAtTime: null,
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
    test("no conditions → all defaults", () => {
        const result = ConditionsSubsystem.getModifiers([], 0, "ATTACK_ROLL");
        expect(result.advantage).toBe(false);
        expect(result.disadvantage).toBe(false);
        expect(result.autoCrit).toBe(false);
        expect(result.autoFail).toBe(false);
        expect(result.speedOverride).toBeNull();
        expect(result.actionsBlocked).toBe(false);
        expect(result.sources).toHaveLength(0);
    });

    test("blinded → disadvantage on ATTACK_ROLL, not on ABILITY_CHECK", () => {
        const atk = ConditionsSubsystem.getModifiers(["blinded"], 0, "ATTACK_ROLL");
        expect(atk.disadvantage).toBe(true);
        expect(atk.sources).toContain("blinded");

        const chk = ConditionsSubsystem.getModifiers(["blinded"], 0, "ABILITY_CHECK");
        expect(chk.disadvantage).toBe(false);
    });

    test("poisoned → disadvantage on ATTACK_ROLL and ABILITY_CHECK, not on saves", () => {
        expect(ConditionsSubsystem.getModifiers(["poisoned"], 0, "ATTACK_ROLL").disadvantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["poisoned"], 0, "ABILITY_CHECK").disadvantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["poisoned"], 0, "SAVE_DEX").disadvantage).toBe(false);
        expect(ConditionsSubsystem.getModifiers(["poisoned"], 0, "SAVE_STR").disadvantage).toBe(false);
    });

    test("frightened → disadvantage on ATTACK_ROLL and ABILITY_CHECK, not on saves", () => {
        expect(ConditionsSubsystem.getModifiers(["frightened"], 0, "ATTACK_ROLL").disadvantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["frightened"], 0, "ABILITY_CHECK").disadvantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["frightened"], 0, "SAVE_DEX").disadvantage).toBe(false);
    });

    test("invisible → advantage on ATTACK_ROLL only", () => {
        expect(ConditionsSubsystem.getModifiers(["invisible"], 0, "ATTACK_ROLL").advantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["invisible"], 0, "ABILITY_CHECK").advantage).toBe(false);
    });

    test("grappled → speedOverride=0, no other modifiers", () => {
        const r = ConditionsSubsystem.getModifiers(["grappled"], 0, "ATTACK_ROLL");
        expect(r.speedOverride).toBe(0);
        expect(r.actionsBlocked).toBe(false);
        expect(r.autoFail).toBe(false);
        expect(r.autoCrit).toBe(false);
    });

    test("incapacitated → actionsBlocked only (speed not reduced)", () => {
        const r = ConditionsSubsystem.getModifiers(["incapacitated"], 0, "ATTACK_ROLL");
        expect(r.actionsBlocked).toBe(true);
        expect(r.speedOverride).toBeNull();
    });

    test("paralyzed → actionsBlocked, speedOverride=0, autoFail on SAVE_STR and SAVE_DEX, autoCrit on ATTACK_ROLL_TARGET", () => {
        const saveStr = ConditionsSubsystem.getModifiers(["paralyzed"], 0, "SAVE_STR");
        expect(saveStr.actionsBlocked).toBe(true);
        expect(saveStr.speedOverride).toBe(0);
        expect(saveStr.autoFail).toBe(true);
        expect(saveStr.sources).toContain("paralyzed");

        const saveDex = ConditionsSubsystem.getModifiers(["paralyzed"], 0, "SAVE_DEX");
        expect(saveDex.autoFail).toBe(true);

        // autoFail only on STR/DEX saves, not other saves
        const saveCon = ConditionsSubsystem.getModifiers(["paralyzed"], 0, "SAVE_CON");
        expect(saveCon.autoFail).toBe(false);

        // autoCrit only when this entity is the attack target
        const target = ConditionsSubsystem.getModifiers(["paralyzed"], 0, "ATTACK_ROLL_TARGET");
        expect(target.autoCrit).toBe(true);

        // autoCrit not set on other check types
        const atk = ConditionsSubsystem.getModifiers(["paralyzed"], 0, "ATTACK_ROLL");
        expect(atk.autoCrit).toBe(false);
        expect(atk.autoFail).toBe(false);
    });

    test("stunned → actionsBlocked, speedOverride=0, autoFail on SAVE_STR/DEX, no autoCrit", () => {
        const save = ConditionsSubsystem.getModifiers(["stunned"], 0, "SAVE_STR");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedOverride).toBe(0);
        expect(save.autoFail).toBe(true);

        const target = ConditionsSubsystem.getModifiers(["stunned"], 0, "ATTACK_ROLL_TARGET");
        expect(target.autoCrit).toBe(false);
    });

    test("unconscious → actionsBlocked, speedOverride=0, autoFail on SAVE_STR/DEX, autoCrit on ATTACK_ROLL_TARGET", () => {
        const save = ConditionsSubsystem.getModifiers(["unconscious"], 0, "SAVE_DEX");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedOverride).toBe(0);
        expect(save.autoFail).toBe(true);

        const target = ConditionsSubsystem.getModifiers(["unconscious"], 0, "ATTACK_ROLL_TARGET");
        expect(target.autoCrit).toBe(true);
    });

    test("petrified → actionsBlocked, speedOverride=0, autoFail on SAVE_STR/DEX, no autoCrit", () => {
        const save = ConditionsSubsystem.getModifiers(["petrified"], 0, "SAVE_STR");
        expect(save.actionsBlocked).toBe(true);
        expect(save.speedOverride).toBe(0);
        expect(save.autoFail).toBe(true);

        const target = ConditionsSubsystem.getModifiers(["petrified"], 0, "ATTACK_ROLL_TARGET");
        expect(target.autoCrit).toBe(false);
    });

    test("prone → disadvantage on ATTACK_ROLL only", () => {
        expect(ConditionsSubsystem.getModifiers(["prone"], 0, "ATTACK_ROLL").disadvantage).toBe(true);
        expect(ConditionsSubsystem.getModifiers(["prone"], 0, "ABILITY_CHECK").disadvantage).toBe(false);
    });

    test("restrained → speedOverride=0, disadvantage on ATTACK_ROLL and SAVE_DEX only", () => {
        const atk = ConditionsSubsystem.getModifiers(["restrained"], 0, "ATTACK_ROLL");
        expect(atk.speedOverride).toBe(0);
        expect(atk.disadvantage).toBe(true);

        const saveDex = ConditionsSubsystem.getModifiers(["restrained"], 0, "SAVE_DEX");
        expect(saveDex.disadvantage).toBe(true);

        // Restrained only imposes disadvantage on DEX saves, not other saves
        const saveStr = ConditionsSubsystem.getModifiers(["restrained"], 0, "SAVE_STR");
        expect(saveStr.disadvantage).toBe(false);
    });

    test("blinded + invisible → both advantage and disadvantage set (engine cancels)", () => {
        const r = ConditionsSubsystem.getModifiers(["blinded", "invisible"], 0, "ATTACK_ROLL");
        expect(r.advantage).toBe(true);
        expect(r.disadvantage).toBe(true);
        expect(r.sources).toContain("invisible");
        expect(r.sources).toContain("blinded");
    });

    test("sources only lists conditions that contributed", () => {
        // Poisoned contributes to ATTACK_ROLL disadvantage; deafened contributes nothing
        const r = ConditionsSubsystem.getModifiers(["poisoned", "deafened"], 0, "ATTACK_ROLL");
        expect(r.sources).toContain("poisoned");
        expect(r.sources).not.toContain("deafened");
    });

    test("exhaustion level 0 → flatBonus=0", () => {
        const r = ConditionsSubsystem.getModifiers([], 0, "ATTACK_ROLL");
        expect(r.flatBonus).toBe(0);
    });

    test("exhaustion level 3 → flatBonus=-6", () => {
        const r = ConditionsSubsystem.getModifiers([], 3, "ATTACK_ROLL");
        expect(r.flatBonus).toBe(-6);
    });

    test("exhaustion level 6 → flatBonus=-12", () => {
        const r = ConditionsSubsystem.getModifiers([], 6, "ABILITY_CHECK");
        expect(r.flatBonus).toBe(-12);
    });

    test("conditions + exhaustion: both flatBonus and condition modifiers apply", () => {
        const r = ConditionsSubsystem.getModifiers(["poisoned"], 2, "ATTACK_ROLL");
        expect(r.flatBonus).toBe(-4);
        expect(r.disadvantage).toBe(true);
    });
});

// ── isIncapacitated (pure function) ───────────────────────────────────────────

describe("isIncapacitated", () => {
    test("empty conditions → false", () => {
        expect(ConditionsSubsystem.isIncapacitated([])).toBe(false);
    });

    test.each([["incapacitated"], ["paralyzed"], ["stunned"], ["petrified"], ["unconscious"]] as ConditionName[][])(
        "%s → true",
        (condition) => {
            expect(ConditionsSubsystem.isIncapacitated([condition as ConditionName])).toBe(true);
        },
    );

    test("non-incapacitating conditions → false", () => {
        expect(ConditionsSubsystem.isIncapacitated(["blinded", "poisoned", "prone"])).toBe(false);
    });

    test("incapacitated in a mixed list → true", () => {
        expect(ConditionsSubsystem.isIncapacitated(["blinded", "stunned", "prone"])).toBe(true);
    });
});

// ── isEntityIncapacitated ─────────────────────────────────────────────────────

describe("isEntityIncapacitated", () => {
    test("returns true when entity has an incapacitating condition", async () => {
        const [sub] = makeSubsystem();
        await sub.applyCondition(makeOpts({ conditionName: "stunned", sourceId: "src-1" }));
        expect(await sub.isEntityIncapacitated("entity-00000001")).toBe(true);
    });

    test("returns false when entity has no incapacitating conditions", async () => {
        const [sub] = makeSubsystem();
        await sub.applyCondition(makeOpts({ conditionName: "blinded", sourceId: "src-1" }));
        expect(await sub.isEntityIncapacitated("entity-00000001")).toBe(false);
    });

    test("returns false when entity has no conditions", async () => {
        const [sub] = makeSubsystem();
        expect(await sub.isEntityIncapacitated("entity-none")).toBe(false);
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
        expect(effect.name).toBe("poisoned");
        expect(effect.targetId).toBe(opts.entityId);
        expect(effect.sourceId).toBe(opts.sourceId);
        expect(effect.scope).toBe("COMBAT");
        expect(effect.expiresAtRound).toBeNull();
        expect(typeof effect.id).toBe("string");
        expect(effect.id).toHaveLength(36); // UUID v4 length
    });

    test("stores the effect in the effects store", async () => {
        const opts = makeOpts({ entityId: "entity-A", conditionName: "blinded" });
        await sub.applyCondition(opts);

        const stored = store.snapshot("entity-A");
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe("blinded");
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

    test("omitting sourceId removes all sources for the condition", async () => {
        const entity = "entity-all-sources";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-A" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "src-B" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "blinded", sourceId: "src-C" }));

        const result = await sub.removeCondition(entity, "frightened");
        expect(result.ok).toBe(true);

        const remaining = store.snapshot(entity);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe("blinded");
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

// ── removeConditionsBySource ──────────────────────────────────────────────────

describe("removeConditionsBySource", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("removes all effects from the given source, leaves other sources intact", async () => {
        const entity = "entity-rcs";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "dragon" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "poisoned", sourceId: "dragon" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "blinded", sourceId: "goblin" }));

        const result = await sub.removeConditionsBySource(entity, "dragon");
        expect(result.ok).toBe(true);

        const remaining = store.snapshot(entity);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].sourceId).toBe("goblin");
    });

    test("returns ok when source has no effects", async () => {
        const result = await sub.removeConditionsBySource("entity-none", "no-source");
        expect(result.ok).toBe(true);
    });
});

// ── clearAllConditions ────────────────────────────────────────────────────────

describe("clearAllConditions", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("wipes all effects for the entity", async () => {
        const entity = "entity-cac";
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "frightened", sourceId: "s1" }));
        await sub.applyCondition(makeOpts({ entityId: entity, conditionName: "poisoned", sourceId: "s2" }));

        const result = await sub.clearAllConditions(entity);
        expect(result.ok).toBe(true);
        expect(store.snapshot(entity)).toHaveLength(0);
    });

    test("returns ok when entity has no effects", async () => {
        const result = await sub.clearAllConditions("entity-empty");
        expect(result.ok).toBe(true);
    });
});

// ── tickExpirations ───────────────────────────────────────────────────────────

describe("tickExpirations", () => {
    let sub: ConditionsSubsystem;
    let store: MemoryEffectsStore;

    beforeEach(() => {
        [sub, store] = makeSubsystem();
    });

    test("removes TIMED effects whose expiresAtRound <= currentRound", async () => {
        const entity = "entity-tick";
        await sub.applyCondition(
            makeOpts({
                entityId: entity,
                conditionName: "frightened",
                scope: "TIMED",
                expiresAtRound: 3,
                sourceId: "s1",
            }),
        );
        await sub.applyCondition(
            makeOpts({
                entityId: entity,
                conditionName: "poisoned",
                scope: "TIMED",
                expiresAtRound: 5,
                sourceId: "s2",
            }),
        );

        const result = await sub.tickExpirations(entity, 3);
        expect(result.ok).toBe(true);

        const remaining = store.snapshot(entity);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe("poisoned");
    });

    test("does not remove COMBAT or SUSTAINED effects", async () => {
        const entity = "entity-tick2";
        await sub.applyCondition(
            makeOpts({
                entityId: entity,
                conditionName: "blinded",
                scope: "COMBAT",
                expiresAtRound: null,
                sourceId: "s1",
            }),
        );
        await sub.applyCondition(
            makeOpts({
                entityId: entity,
                conditionName: "grappled",
                scope: "SUSTAINED",
                expiresAtRound: null,
                sourceId: "s2",
            }),
        );

        await sub.tickExpirations(entity, 10);

        expect(store.snapshot(entity)).toHaveLength(2);
    });

    test("leaves TIMED effects that have not yet expired", async () => {
        const entity = "entity-tick3";
        await sub.applyCondition(
            makeOpts({
                entityId: entity,
                conditionName: "frightened",
                scope: "TIMED",
                expiresAtRound: 5,
                sourceId: "s1",
            }),
        );

        await sub.tickExpirations(entity, 4);

        expect(store.snapshot(entity)).toHaveLength(1);
    });
});

// ── incrementExhaustion / decrementExhaustion ─────────────────────────────────

describe("incrementExhaustion", () => {
    let sub: ConditionsSubsystem;
    let xStore: MemoryExhaustionStore;

    beforeEach(() => {
        [sub, , xStore] = makeSubsystem();
    });

    test("increments from 0 to 1", async () => {
        const result = await sub.incrementExhaustion("char-inc");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBe(1);
        expect(await xStore.getExhaustionLevel("char-inc")).toBe(1);
    });

    test("increments from 5 to 6", async () => {
        await xStore.setExhaustionLevel("char-inc2", 5);
        const result = await sub.incrementExhaustion("char-inc2");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBe(6);
    });

    test("rejects increment at level 6 (maximum)", async () => {
        await xStore.setExhaustionLevel("char-max", 6);
        const result = await sub.incrementExhaustion("char-max");
        expect(result.ok).toBe(false);
    });
});

describe("decrementExhaustion", () => {
    let sub: ConditionsSubsystem;
    let xStore: MemoryExhaustionStore;

    beforeEach(() => {
        [sub, , xStore] = makeSubsystem();
    });

    test("decrements from 3 to 2", async () => {
        await xStore.setExhaustionLevel("char-dec", 3);
        const result = await sub.decrementExhaustion("char-dec");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBe(2);
        expect(await xStore.getExhaustionLevel("char-dec")).toBe(2);
    });

    test("rejects decrement at level 0 (minimum)", async () => {
        const result = await sub.decrementExhaustion("char-zero");
        expect(result.ok).toBe(false);
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
