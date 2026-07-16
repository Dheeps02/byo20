# 017 — World Depth Tier (Standard vs Epic) v1.0.0

## Status
Accepted

## Context

BYO20 supports campaigns ranging from short 3-4 session one-shots to long-term campaigns spanning months or years of real time. Generating deep world lore, faction histories, prophecies, a Grand Library, and pre-authored found documents is wasted token spend for a short campaign. DMs running a quick adventure should not pay that cost.

## Decision

`campaigns.world_depth ENUM('standard', 'epic')` — set once at campaign creation, never changed mid-campaign.

**Standard** (default) — enough world to play. Faction skeleton, villain agenda, key NPCs, main quest hooks. Lazy zone gen fills the rest on exploration. No lore infrastructure. Codex has Rules, Spells, Bestiary, Conditions only.

**Epic** — full investment pass during world gen. Deep faction histories seeded as `lore_entries`, Grand Library placed as a world gen POI, prophecy generated, named NPCs get richer backstory, villain agenda is more elaborate, rumor pool pre-seeded with true and false rumors, found documents pre-authored for key locations. Codex gains a Lore tome.

World depth affects **world gen only**. After session one, both tiers behave identically during play. Token spend per event during play is controlled separately by the DM's narration mode (economy / balanced / quality).

DMs are shown a warning at campaign creation when selecting Epic: approximate additional LLM calls during world gen, and a note that this is a one-time cost not repeated during play. Guidance copy: "Epic world gen is built for long campaigns — think a 10-year Minecraft world. If you're investing serious time here, we'll make the world worth it."

## Alternatives Considered

**World depth affecting ongoing AI behavior** — Rejected. Narration mode already controls per-event token spend during play. Two overlapping dials for the same concern (ongoing cost) would confuse DMs. Clean separation: world_depth = upfront investment, narration_mode = ongoing cost.

**Boolean flag instead of enum** — Rejected. An enum (`standard | epic`) leaves room for a `quick` tier (one-shots, even leaner gen) without a schema migration.

**Always generating Epic depth** — Rejected. Wastes tokens and degrades UX for short campaigns that will never need faction lore or a Grand Library.

## Consequences

- `campaigns.world_depth` column added to the campaigns table.
- World gen skill file (`world-gen.md`) branches on depth tier. Epic runs additional lore-seeding passes after the standard 7-pass pipeline.
- All lore infrastructure (`lore_entries`, Grand Library, `library_access_unlocked`, remote access quest) is Epic-only. The table exists for Standard campaigns but stays empty.
- Campaign creation UI (`/host/setup`) shows the depth selector with the token cost warning inline.
- Codex Lore tome conditionally rendered: only when `world_depth = 'epic'`.
- Rumor system, found documents, notice board pre-seeding, bard songs, prophecies — all Epic-only. See `docs/future-features.md`.
