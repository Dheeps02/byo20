/**
 * Manual patches applied to the SRD monster data after fetching.
 *
 * The fetch transformer hard-codes treasure_type as 'individual' for every
 * monster, but the engine uses this field to pick the correct loot table:
 *   - individual: personal treasure on the creature (coins, mundane items)
 *   - hoard:      guards a collected hoard — uses hoard loot tables with magic items
 *   - none:       mindless undead, constructs, vermin — no treasure at all
 *
 * Keep patches minimal — only override what the transformer gets wrong.
 */

/** A single SRD monster row as returned by the fetch script transformer. */
type MonsterRow = Record<string, unknown>;

/**
 * Monsters that guard a hoard rather than carrying personal treasure.
 * Includes all age categories of chromatic and metallic dragons, plus
 * legendary intelligent hoarders.
 */
const HOARD_MONSTERS = new Set([
    "adult-black-dragon",
    "adult-blue-dragon",
    "adult-brass-dragon",
    "adult-bronze-dragon",
    "adult-copper-dragon",
    "adult-gold-dragon",
    "adult-green-dragon",
    "adult-red-dragon",
    "adult-silver-dragon",
    "adult-white-dragon",
    "ancient-black-dragon",
    "ancient-blue-dragon",
    "ancient-brass-dragon",
    "ancient-bronze-dragon",
    "ancient-copper-dragon",
    "ancient-gold-dragon",
    "ancient-green-dragon",
    "ancient-red-dragon",
    "ancient-silver-dragon",
    "ancient-white-dragon",
    "young-black-dragon",
    "young-blue-dragon",
    "young-brass-dragon",
    "young-bronze-dragon",
    "young-copper-dragon",
    "young-gold-dragon",
    "young-green-dragon",
    "young-red-dragon",
    "young-silver-dragon",
    "young-white-dragon",
    "lich",
    "vampire",
    "vampire-spawn",
    "beholder",
    "mind-flayer",
    "kraken",
    "tarrasque",
    "androsphinx",
    "gynosphinx",
]);

/**
 * Monsters that carry no treasure — undead husks, mindless constructs,
 * oozes, and giant vermin that exist to fight, not to loot.
 */
const NO_TREASURE_MONSTERS = new Set([
    "skeleton",
    "zombie",
    "shadow",
    "specter",
    "wraith",
    "wight",
    "ghoul",
    "ghast",
    "black-pudding",
    "gelatinous-cube",
    "gray-ooze",
    "ochre-jelly",
    "animated-armor",
    "flying-sword",
    "rug-of-smothering",
    "shield-guardian",
    "homunculus",
    "giant-rat",
    "giant-spider",
    "giant-bat",
    "giant-centipede",
    "giant-wasp",
    "swarm-of-bats",
    "swarm-of-rats",
    "swarm-of-ravens",
]);

/**
 * Apply treasure_type corrections to the fetched monster list.
 * Returns a new array — does not mutate the input.
 */
export function applyMonsterPatches(monsters: MonsterRow[]): MonsterRow[] {
    return monsters.map((monster) => {
        const id = monster.id as string;
        if (HOARD_MONSTERS.has(id)) {
            return { ...monster, treasure_type: "hoard" };
        }
        if (NO_TREASURE_MONSTERS.has(id)) {
            return { ...monster, treasure_type: "none" };
        }
        return monster;
    });
}
