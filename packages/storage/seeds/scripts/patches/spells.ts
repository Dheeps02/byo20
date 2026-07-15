/**
 * Manual patches applied to the 2014 SRD spell data after fetching.
 *
 * Patches are needed because:
 *   1. The 2014 API lacks Emanation AoE tags (new in 2024 rules)
 *   2. Several Conjure spells were redesigned in 2024 (simplified summons)
 *   3. Some spells moved schools or changed components in the 2024 SRD
 *
 * Keep patches minimal — only override what the API gets wrong for our
 * 2024 ruleset. The engine reads area_of_effect and effects[] to drive
 * combat mechanics, so correctness here matters.
 */

/** A single SRD spell row as returned by the fetch script transformer. */
type SpellRow = Record<string, unknown>

/**
 * Spells that use Emanation AoE in 2024 (centered on caster, moves with them).
 * The 2014 API returns these as 'sphere' — we patch them to 'emanation'.
 */
const EMANATION_SPELLS = new Set([
  'blade-ward',
  'death-ward',
  'antimagic-field',
  'aura-of-life',
  'aura-of-purity',
  'aura-of-vitality',
  'crusaders-mantle',
  'mass-cure-wounds',
  'spirit-guardians',
  'thunder-step',
  'warding-bond',
])

/**
 * Conjure spells redesigned in 2024 — new description replaces the old
 * "roll on a table and the DM picks the creature" mechanic.
 */
const CONJURE_PATCHES: Record<string, Partial<SpellRow>> = {
  'conjure-animals': {
    description: [
      'You summon nature spirits that appear as a Large swarm of spectral animals in an unoccupied space you can see within range.',
      'The swarm uses the Swarm of Animals stat block. It disappears when it drops to 0 hit points or when the spell ends.',
      'The swarm is an ally to you and your companions. In combat, the swarm shares your initiative count, but it takes its turn immediately after yours.',
      'It obeys your verbal commands (no action required by you). If you don\'t give it any, it defends itself.',
    ].join('\n'),
  },
  'conjure-woodland-beings': {
    description: [
      'You summon a nature spirit that takes the form of a Fey creature in an unoccupied space you can see within range.',
      'The creature disappears when it drops to 0 hit points or when the spell ends.',
      'The creature is friendly to you and your companions for the duration.',
    ].join('\n'),
  },
  'conjure-elemental': {
    description: [
      'You call forth an elemental servant. Choose an area of air, earth, fire, or water that fills a 10-foot cube within range.',
      'An elemental of challenge rating 5 or lower appropriate to the area you chose appears in an unoccupied space within 10 feet of it.',
      'The elemental disappears when it drops to 0 hit points or when the spell ends.',
    ].join('\n'),
  },
  'conjure-fey': {
    description: [
      'You summon a Fey creature of challenge rating 6 or lower, or a Fey spirit that takes the form of a beast of challenge rating 6 or lower.',
      'It appears in an unoccupied space that you can see within range.',
      'The Fey creature disappears when it drops to 0 hit points or when the spell ends.',
    ].join('\n'),
  },
  'conjure-minor-elementals': {
    description: [
      'You summon elementals that appear in unoccupied spaces that you can see within range.',
      'Choose one of the following options for what appears: one elemental of challenge rating 2 or lower, or two elementals of challenge rating 1 or lower, or four elementals of challenge rating 1/2 or lower, or eight elementals of challenge rating 1/4 or lower.',
      'An elemental summoned by this spell disappears when it drops to 0 hit points or when the spell ends.',
    ].join('\n'),
  },
}

/**
 * Apply all 2024 patches to the fetched spell list.
 * Returns a new array — does not mutate the input.
 */
export function applySpellPatches(spells: SpellRow[]): SpellRow[] {
  return spells.map(spell => {
    const id = spell.id as string
    let patched = { ...spell }

    // Patch 1: Emanation AoE
    if (EMANATION_SPELLS.has(id)) {
      const aoe = patched.area_of_effect as Record<string, unknown> | null
      if (aoe && aoe.type === 'sphere') {
        patched = { ...patched, area_of_effect: { ...aoe, type: 'emanation' } }
      }
    }

    // Patch 2: Conjure spell redesigns
    if (id in CONJURE_PATCHES) {
      patched = { ...patched, ...CONJURE_PATCHES[id] }
    }

    return patched
  })
}
