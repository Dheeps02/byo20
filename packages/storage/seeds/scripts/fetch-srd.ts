/**
 * One-time dev script — fetch SRD 5.2 data from dnd5eapi.co and write
 * to seeds/srd/*.json. Run this once when the SRD content changes.
 *
 * Output files are committed to the repo so the seeder never hits the
 * network at runtime. The app is fully offline-capable after seed:srd runs.
 *
 *   bun run seeds/scripts/fetch-srd.ts
 *
 * API notes:
 *   - Most entities: https://www.dnd5eapi.co/api/2024/{entity}
 *   - Spells: https://www.dnd5eapi.co/api/2014/spells (2024 endpoint incomplete)
 *   - After fetching, manual patches in seeds/scripts/patches/ are applied
 *
 * Manual patches needed (see patches/ directory):
 *   - spells.ts:  Emanation AoE tags, Conjure reworks, 2024 spell delta
 *
 * Hand-written files (never fetched, don't overwrite):
 *   - xp_thresholds.json, loot_tables.json, ruleset_version.json
 */
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { applySpellPatches } from './patches/spells'

const OUT_DIR = resolve(import.meta.dir, '../srd')
const BASE_2024 = 'https://www.dnd5eapi.co/api/2024'
const BASE_2014 = 'https://www.dnd5eapi.co/api/2014'

/** Fetch all items at a list endpoint, then fetch each item's detail page in parallel. */
async function fetchAll(baseUrl: string, endpoint: string): Promise<unknown[]> {
  const list = await fetch(`${baseUrl}/${endpoint}`).then(r => r.json()) as { results: Array<{ index: string }> }
  console.log(`  Fetching ${list.results.length} ${endpoint}...`)
  return Promise.all(
    list.results.map(item =>
      fetch(`${baseUrl}/${endpoint}/${item.index}`).then(r => r.json()),
    ),
  )
}

/** JSON-serialize data and write it to a file in OUT_DIR. */
async function write(filename: string, data: unknown[]): Promise<void> {
  await writeFile(resolve(OUT_DIR, filename), JSON.stringify(data, null, 2))
  console.log(`  ✓ ${filename} (${data.length} rows)`)
}

// ── Transformers ──────────────────────────────────────────────────────────────
// Each transformer maps the API shape to our schema column names.

/** Map a raw API spell object to our srd.spells column shape. */
function transformSpell(s: Record<string, unknown>) {
  const comps = s.components as string[] ?? []
  const material = s.material as string | null ?? null
  return {
    id: s.index,
    name: s.name,
    description: Array.isArray(s.desc) ? (s.desc as string[]).join('\n') : s.desc,
    level: s.level,
    school: (s.school as Record<string, unknown>)?.index ?? null,
    casting_time: s.casting_time,
    range: s.range,
    components: { v: comps.includes('V'), s: comps.includes('S'), m: comps.includes('M'), material },
    duration: s.duration,
    concentration: s.concentration ?? false,
    ritual: s.ritual ?? false,
    classes: ((s.classes as Array<Record<string, unknown>>) ?? []).map(c => c.index),
    area_of_effect: s.area_of_effect ?? null,
    damage: s.damage ?? null,
    save: (s.dc as Record<string, unknown>)?.dc_type
      ? ((s.dc as Record<string, unknown>).dc_type as Record<string, unknown>).index
      : null,
    effects: [],
  }
}

/** Map a raw API monster object to our srd.monsters column shape. */
function transformMonster(m: Record<string, unknown>) {
  return {
    id: m.index,
    name: m.name,
    description: null,
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    ac: Array.isArray(m.armor_class) ? (m.armor_class as Array<Record<string, unknown>>)[0]?.value : m.armor_class,
    speed: m.speed,
    hp_average: m.hit_points,
    hp_die: m.hit_points_roll ?? null,
    stat_str: m.strength,
    stat_dex: m.dexterity,
    stat_con: m.constitution,
    stat_int: m.intelligence,
    stat_wis: m.wisdom,
    stat_cha: m.charisma,
    saving_throws: m.proficiencies ?? null,
    skills: null,
    damage_resistances: m.damage_resistances ?? null,
    damage_immunities: m.damage_immunities ?? null,
    condition_immunities: ((m.condition_immunities as Array<Record<string, unknown>>) ?? []).map(c => c.index as string),
    senses: m.senses ?? null,
    languages: m.languages ?? null,
    cr: String(m.challenge_rating),
    xp: m.xp ?? null,
    traits: m.special_abilities ?? null,
    actions: m.actions ?? null,
    bonus_actions: m.bonus_actions ?? null,
    reactions: m.reactions ?? null,
    legendary_actions: m.legendary_actions ?? null,
    treasure_type: 'individual',
  }
}

/** Map a raw API species/race object to our srd.species column shape. */
function transformSpecies(s: Record<string, unknown>) {
  return {
    id: s.index,
    name: s.name,
    description: (s.desc as string[] | undefined)?.join('\n') ?? null,
    size: s.size ?? null,
    speed: (s.speed as Record<string, unknown>)?.walk ?? null,
    traits: s.traits ?? null,
  }
}

/** Map a raw API background object to our srd.backgrounds column shape. */
function transformBackground(b: Record<string, unknown>) {
  return {
    id: b.index,
    name: b.name,
    description: null,
    ability_scores: b.ability_bonuses ?? null,
    skill_profs: b.starting_proficiencies ?? null,
    tool_profs: null,
    feat: null,
    languages: [],
    equipment: b.starting_equipment ?? null,
  }
}

/** Map a raw API class object to our srd.classes column shape. */
function transformClass(c: Record<string, unknown>) {
  return {
    id: c.index,
    name: c.name,
    description: null,
    hit_die: `d${c.hit_die}`,
    primary_ability: null,
    saving_throw_profs: c.saving_throws ?? null,
    armor_profs: null,
    weapon_profs: null,
    skill_choices: c.proficiency_choices ?? null,
    spell_slot_table: null,
    features_table: null,
  }
}

/** Map a raw API subclass object to our srd.subclasses column shape. */
function transformSubclass(s: Record<string, unknown>) {
  return {
    id: s.index,
    name: s.name,
    description: (s.desc as string[] | undefined)?.join('\n') ?? null,
    class_id: (s.class as Record<string, unknown>)?.index ?? null,
    level_gained: 3,
    features: null,
  }
}

/** Map a raw API feat object to our srd.feats column shape. */
function transformFeat(f: Record<string, unknown>) {
  return {
    id: f.index,
    name: f.name,
    description: (f.desc as string[] | undefined)?.join('\n') ?? null,
    category: 'general',
    prerequisite: f.prerequisites ?? null,
    ability_score_increase: f.ability_score_bonuses ?? null,
    benefits: null,
  }
}

/** Map a raw API equipment object to our srd.items column shape. */
function transformItem(i: Record<string, unknown>) {
  return {
    id: i.index,
    name: i.name,
    description: (i.desc as string[] | undefined)?.join('\n') ?? null,
    item_type: (i.equipment_category as Record<string, unknown>)?.index ?? 'gear',
    cost: (i.cost as Record<string, unknown>)?.quantity ?? null,
    weight: i.weight ?? null,
    properties: i.properties ?? null,
  }
}

/** Map a raw API magic item object to our srd.magic_items column shape. */
function transformMagicItem(i: Record<string, unknown>) {
  return {
    id: i.index,
    name: i.name,
    description: (i.desc as string[] | undefined)?.join('\n') ?? null,
    rarity: (i.rarity as Record<string, unknown>)?.name?.toLowerCase().replace(' ', '_') ?? 'common',
    item_type: (i.equipment_category as Record<string, unknown>)?.index ?? 'wondrous',
    attunement: String(i.desc ?? '').toLowerCase().includes('requires attunement'),
    charges_max: null,
    recharge: null,
    properties: null,
  }
}

/** Map a raw API condition object to our srd.conditions column shape. */
function transformCondition(c: Record<string, unknown>) {
  return {
    id: c.index,
    name: c.name,
    description: (c.desc as string[] | undefined)?.join('\n') ?? null,
    effects: null,
  }
}

/** Map a raw API weapon-property object to our srd.weapon_masteries column shape. */
function transformWeaponMastery(w: Record<string, unknown>) {
  return {
    id: w.index,
    name: w.name,
    description: (w.desc as string[] | undefined)?.join('\n') ?? null,
    applicable_weapons: null,
    effect: null,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

/** Fetch all SRD entities, apply patches, and write JSON seed files to seeds/srd/. */
async function main() {
  console.log('Fetching SRD data from dnd5eapi.co...\n')

  // Spells: 2014 endpoint (2024 is incomplete on the API)
  const rawSpells = await fetchAll(BASE_2014, 'spells')
  let spells = rawSpells.map(s => transformSpell(s as Record<string, unknown>))
  spells = applySpellPatches(spells)
  await write('spells.json', spells)

  const [monsters, species, backgrounds, classes, subclasses, feats, srdItems, magicItems, conditions, weaponMasteries] = await Promise.all([
    fetchAll(BASE_2024, 'monsters'),
    fetchAll(BASE_2024, 'races'),          // 2024 API uses 'races' for species
    fetchAll(BASE_2024, 'backgrounds'),
    fetchAll(BASE_2024, 'classes'),
    fetchAll(BASE_2024, 'subclasses'),
    fetchAll(BASE_2024, 'feats'),
    fetchAll(BASE_2024, 'equipment'),
    fetchAll(BASE_2024, 'magic-items'),
    fetchAll(BASE_2024, 'conditions'),
    // Fetches 8 of 9 PHB masteries. 'flex' is PHB-only, not in SRD 5.2 (CC-BY-4.0) —
    // absent from the API by design. Do not add it manually.
    fetchAll(BASE_2024, 'weapon-mastery-properties'),
  ])

  await Promise.all([
    write('monsters.json', monsters.map(m => transformMonster(m as Record<string, unknown>))),
    write('species.json', species.map(s => transformSpecies(s as Record<string, unknown>))),
    write('backgrounds.json', backgrounds.map(b => transformBackground(b as Record<string, unknown>))),
    write('classes.json', classes.map(c => transformClass(c as Record<string, unknown>))),
    write('subclasses.json', subclasses.map(s => transformSubclass(s as Record<string, unknown>))),
    write('feats.json', feats.map(f => transformFeat(f as Record<string, unknown>))),
    write('items.json', srdItems.map(i => transformItem(i as Record<string, unknown>))),
    write('magic_items.json', magicItems.map(i => transformMagicItem(i as Record<string, unknown>))),
    write('conditions.json', conditions.map(c => transformCondition(c as Record<string, unknown>))),
    write('weapon_masteries.json', weaponMasteries.map(w => transformWeaponMastery(w as Record<string, unknown>))),
  ])

  console.log('\nDone. Review seeds/srd/*.json before running seed:srd.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
