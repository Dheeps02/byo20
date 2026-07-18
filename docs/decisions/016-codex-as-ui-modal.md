# 016 — Codex as HTML/CSS UI Modal v1.0.0

## Status
Accepted

## Context

BYO20 needs a player-facing reference panel — the Codex — covering SRD rules (conditions, spells, actions), and in Epic campaigns, discovered world lore. Two implementation approaches were considered: a 3D interactive bookshelf rendered inside Babylon.js, or an HTML/CSS modal overlay.

The visual design (agreed with design agent) is a bookshelf with distinct books per category. Clicking a book opens it with a page-flip animation to a table of contents; selecting an entry page-flips to that content.

## Decision

Codex is an HTML/CSS modal overlay — not a Babylon.js scene element.

CSS 3D transforms (`perspective`, `transform-style: preserve-3d`, `rotateY`) are sufficient for the bookshelf and page-flip animations. Babylon.js is reserved for the 3D game world; UI overlays sit above the canvas via z-index, consistent with every other panel in the layout.

The Codex has two content tiers:

- **Standard campaigns** — Rules, Conditions, Spells, Bestiary books only. Always accessible, no gate. No library exists in the world.
- **Epic campaigns** — adds a Lore tome. Gated: physical Grand Library visit populates it; remote access is a per-party quest reward. See ADR 017 for the world depth split.

## Alternatives Considered

**Babylon.js Codex** — Rejected. The Codex is a UI modal, not a world element. A Babylon implementation would require either a second nested canvas (extra memory, init overhead) or rendering 2D UI content inside the game world canvas (wrong layer). Text content, search, and scrolling are trivially handled in HTML/DOM and painful in Babylon's texture-based text rendering. Accessibility is only available in the DOM.

**Always-accessible lore** — Rejected. Lore is only meaningful in Epic campaigns that invest in world depth during gen. Standard campaigns have no lore infrastructure.

**Hard gate on lore** — Rejected in favour of quest-reward remote access. Hard gating punishes exploration-style players. The quest reward creates progression without friction.

## Consequences

- Codex is a React component, CSS 3D transforms for animation. Modal overlay layer.
- Lore tome only renders when `campaigns.world_depth = 'epic'`.
- `campaigns.library_access_unlocked` tracks per-party remote access. Only meaningful in Epic campaigns.
- Physical library visit and remote access quest reward are Epic-only features.
- `#mention` chips in chat, hotkey, and UI button all open the Codex.
