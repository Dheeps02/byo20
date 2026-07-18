# 010 — SRD Data Seeding Strategy v1.0.0

## Status
Accepted

## Context

BYO20 needs static reference data for D&D 5.5e (2024): species, backgrounds, classes, subclasses, feats, spells, monsters, items, magic items, conditions, weapon masteries, XP thresholds, and loot tables. This data must be available offline — at no point should the app make network requests to a third-party API during gameplay.

The SRD 5.2 (Systems Reference Document) is the CC-BY-4.0-licensed subset of D&D 5.5e rules. Most of this data is available from community APIs.

## Decision

A one-time developer script (`scripts/fetch-srd.ts`) fetches data from `dnd5eapi.co/api/2024` for all endpoints, with a fallback to `dnd5eapi.co/api/2014` for spells (absent from the 2024 endpoint as of this writing). The script transforms responses to match BYO20's Drizzle schema shape and writes the results as committed JSON files to `seeds/srd/`. These files are committed to the repository.

At runtime, the seeder reads the committed JSON files — never the API. The app works fully offline from first launch onward.

Manual patches are applied on top of the fetched data:

- **Emanation AoE tags** — spells with Emanation area of effect are tagged correctly (missing from the API response)
- **Conjure spell reworks** — 2024 Conjure spells work differently from 2014; the API returns 2014 wording for some of these
- **2024 spell delta** — any spells added or changed in 2024 that the API doesn't yet cover
- **XP thresholds** — 20 rows, hand-written; simple lookup table, no API needed
- **Loot tables** — custom BYO20 content (not DMG verbatim, which is not SRD-licensed)
- **`ruleset_version`** — one hardcoded row: `{ ruleset_id: "dnd-5.5e-2024", srd_version: "5.2.1" }`

## Alternatives Considered

**Commit the full 5e-database npm package as a dependency** — Rejected because the package includes non-SRD content and its schema doesn't match BYO20's Drizzle schema. A custom transform is required either way; fetching from the API directly and committing the output is cleaner.

**Hit the API at runtime on first launch** — Rejected. Requires internet on first launch, adds failure surface, and adds latency to a first-launch experience that already involves downloading Ollama (~350MB). The committed seed files are a few hundred KB and are always present.

**Hand-write all seed data** — Rejected. The API covers the vast majority of SRD data correctly. Hand-writing it would be error-prone and time-consuming for 300+ spells, 400+ monsters, etc.

## Consequences

- `scripts/fetch-srd.ts` is a dev-only tool, never shipped in the app binary.
- Seed files in `seeds/srd/` are committed and reviewed like any other source file. Changes to the SRD data are PRs with a diff.
- When a new SRD version ships, re-running the fetch script + applying updated manual patches + committing the result is the update path. Versioned via `ruleset_version` table and `electron-updater`.
- Offline-first: no internet dependency at runtime, ever.
