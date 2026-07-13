# 003 — XP-Based Leveling Over Milestone Mode

## Status
Accepted

## Context

D&D 5e supports two leveling systems: XP-based (characters earn XP for defeating monsters and completing challenges, leveling up when they cross a threshold) and milestone (the DM decides when the party levels up based on narrative progress). Some VTTs and groups use one, some use the other, and some offer both.

BYO20 needed to decide how many leveling modes to support.

## Decision

XP-based leveling only. There is no separate milestone mode.

DMs retain full discretion within the XP system: the DM (human or AI) can award bonus XP for non-combat challenges at any time, or grant a direct level-up outside of combat for narrative reasons. This covers the practical use cases of milestone leveling without requiring a separate system.

## Alternatives Considered

**Milestone only** — Rejected because it removes the deterministic progression signal that players get from seeing XP accumulate. It also makes the DM a bottleneck for every level-up, which doesn't work well in AI DM mode where the AI should be driving story decisions autonomously rather than requiring explicit DM level grants.

**Both modes** — Rejected because it doubles the spec surface. Two systems means two state models, two code paths, two sets of edge cases. The XP system with DM override covers the same ground without the complexity.

## Consequences

- XP is tracked per character in `character_campaign_state.xp` and checked against `srd.xp_thresholds` on every award.
- Level-up triggers immediately when the threshold is crossed — mid-combat if necessary. Mechanical benefits apply instantly; player choices (feat/ASI, subclass, spell selections) are flagged as pending and resolved asynchronously.
- DM-awarded XP and direct level grants are not voted on, even in AI DM mode. Rewards are DM authority.
- Narrative milestone-style progression is available by the DM issuing a direct level grant. Same outcome, one system.
