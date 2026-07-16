/**
 * SRD seed script — inserts all seeds/srd/*.json into byo20_local.
 *
 * Run this once on first launch (or any time the SRD JSON files change):
 *
 *   bun run seed:srd
 *
 * Expects LOCAL_DB_URL env var pointing at byo20_local.
 * All inserts use ON CONFLICT DO NOTHING so the script is safe to re-run.
 * Append-only tables are never touched here.
 */
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { createLocalDb } from '../src/postgres/client'
import {
  species, backgrounds, classes, subclasses, feats,
  spells, monsters, srd_items, magic_items, conditions,
  weapon_masteries, xp_thresholds, loot_tables, ruleset_version,
} from '../src/postgres/schema/local/srd'

const SRD_DIR = resolve(import.meta.dir, 'srd')

async function readJson<T>(filename: string): Promise<T[]> {
  const raw = await readFile(resolve(SRD_DIR, filename), 'utf8')
  return JSON.parse(raw) as T[]
}

async function seedTable<T extends Record<string, unknown>>(
  db: Awaited<ReturnType<typeof createLocalDb>>['db'],
  table: { $inferInsert: T } & Parameters<typeof db.insert>[0],
  rows: T[],
  label: string,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ○ ${label}: empty, skipping`)
    return
  }
  // Insert in batches of 500 to avoid parameter limit
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(table).values(rows.slice(i, i + BATCH) as T[]).onConflictDoNothing()
    inserted += Math.min(BATCH, rows.length - i)
  }
  console.log(`  ✓ ${label}: ${inserted} rows`)
}

async function main() {
  const url = process.env.LOCAL_DB_URL
  if (!url) {
    console.error('LOCAL_DB_URL is not set. Export it and re-run.')
    process.exit(1)
  }

  console.log('Seeding SRD data into byo20_local...\n')
  const { db, sql } = await createLocalDb(url)

  try {
    const [
      speciesData, bgData, classData, subclassData, featData,
      spellData, monsterData, itemData, magicItemData, conditionData,
      wmData, xpData, lootData, rulesetData,
    ] = await Promise.all([
      readJson('species.json'),
      readJson('backgrounds.json'),
      readJson('classes.json'),
      readJson('subclasses.json'),
      readJson('feats.json'),
      readJson('spells.json'),
      readJson('monsters.json'),
      readJson('items.json'),
      readJson('magic_items.json'),
      readJson('conditions.json'),
      readJson('weapon_masteries.json'),
      readJson('xp_thresholds.json'),
      readJson('loot_tables.json'),
      readJson('ruleset_version.json'),
    ])

    // subclasses references classes — seed classes first
    await seedTable(db, classes as never, classData as never[], 'classes')
    await seedTable(db, subclasses as never, subclassData as never[], 'subclasses')

    // Everything else is independent
    await Promise.all([
      seedTable(db, species as never, speciesData as never[], 'species'),
      seedTable(db, backgrounds as never, bgData as never[], 'backgrounds'),
      seedTable(db, feats as never, featData as never[], 'feats'),
      seedTable(db, spells as never, spellData as never[], 'spells'),
      seedTable(db, monsters as never, monsterData as never[], 'monsters'),
      seedTable(db, srd_items as never, itemData as never[], 'items'),
      seedTable(db, magic_items as never, magicItemData as never[], 'magic_items'),
      seedTable(db, conditions as never, conditionData as never[], 'conditions'),
      seedTable(db, weapon_masteries as never, wmData as never[], 'weapon_masteries'),
      seedTable(db, xp_thresholds as never, xpData as never[], 'xp_thresholds'),
      seedTable(db, loot_tables as never, lootData as never[], 'loot_tables'),
      seedTable(db, ruleset_version as never, rulesetData as never[], 'ruleset_version'),
    ])

    console.log('\nSRD seed complete.')
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
