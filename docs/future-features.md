# Future Features

Ideas discussed and worth building — not scheduled, not specced. Captured here so they don't get lost. All entries below are Epic-tier features unless noted.

---

## Rumor System

NPCs in taverns, markets, and random encounters surface rumors. Some are true — seeded by the AI DM from `campaign_agenda` events and faction activity. Some are deliberately false — planted by the villain or rival factions as misinformation.

**Storage:** `rumor_entries` table, similar shape to `lore_entries`. `verified BOOLEAN DEFAULT FALSE` flips when the party independently confirms the rumor through play.

**AI integration:** Orchestrator injects relevant rumors into NPC Specialist context. NPCs can reference, spread, or react to rumors naturally.

**Why it's good:** gives the world a living gossip layer. Players start triangulating what to believe. Misinformation as a villain mechanic is powerful.

---

## Found Documents

Letters, journals, ledgers as loot items. AI DM generates content at loot time — a dead merchant's suspicious ledger, a cultist's instructions, the villain's correspondence with an ally. Stored as `lore_entries` rows with `source_type: 'found_document'`, linked to the loot item. Players read them in the Codex.

**Why it's good:** almost zero new infra — just a new `source_type` on `lore_entries` and a loot item linkage. Pure immersion payoff.

---

## Notice Boards

`source_type: 'bounty_board'` already exists in the quest schema. Notice boards are the physical in-world surface for that data. AI DM pre-seeds them per town during Epic world gen. Clicking the board object in-world opens a filtered Codex view.

**Why it's good:** no new data model needed. Just wiring a world object to a filtered Codex query.

---

## Bard Songs About the Party

As faction rep and `event_log` accumulate, bards in taverns sing about the party's deeds. AI DM generates a verse based on what actually happened — seeded from event_log entries and faction_events.

**Storage:** optional — can be ephemeral (generated fresh per encounter) or persisted as a `lore_entries` row if the party wants to read it later.

**Why it's good:** makes the party feel like they have a reputation in the world. Costs almost nothing — one NPC Specialist call with event_log context.

---

## Prophecies

Oracle NPCs can issue cryptic prophecies the AI DM generates at campaign creation time alongside `campaign_milestones`. Stored in a `prophecies` table. The Narration Specialist weaves callbacks to the prophecy when relevant milestone events occur, giving the campaign a mythic spine.

**Why it's good:** players love prophecies. Retroactive fulfillment feels earned because the AI DM authored the prophecy knowing the milestone structure.

---

## Notes

- All of the above are Epic-tier only. Standard campaigns get none of this.
- Rumor system and found documents are the highest-value / lowest-effort entries here. Build those first if any of these get scheduled.
- None of these require new AI architecture — they slot into the existing Orchestrator context assembly pattern (more pgvector sources to pull from).
