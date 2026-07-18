# BYO20 — Frontend Layer Spec v0.1.0

> **Status:** In progress. Covers decisions locked through session 1. Remaining components to be designed in session 2.

> **Note:** All designs in this document are subject to change during implementation.

---

## Overview

The frontend layer is the Electron app's renderer process — React, Babylon.js, and the Zustand bridge store. It is a dumb renderer. No game logic lives here. The server is always the source of truth. Client-side validation exists only for UX feedback (greyed buttons, movement range highlights) — the server re-validates every action on receipt.

---

## Tech Stack

| Concern | Library |
|---|---|
| UI framework | React |
| 3D rendering | Babylon.js (WebGPU backend) |
| State bridge | Zustand |
| Routing | React Router (memory mode) |
| Local DB access | Preload script (direct, no IPC) |

---

## Process Architecture

Electron has two processes. They cannot share memory directly.

### Main Process

Owns all native OS concerns:

- Spawning the Postgres sidecar (`byo20_local` always; `byo20_server` only if hosting)
- Spawning the Redis sidecar (only if hosting)
- Starting the WebSocket server (only if hosting)
- Starting Cloudflare Tunnel (only if hosting)
- `safeStorage` — API key encryption/decryption
- `electron-updater` — silent background app updates

### Renderer Process

Owns all UI concerns:

- React + Babylon.js + Zustand
- WebSocket client (connects to the game server same as any other player — even on the host machine)
- Reads from `byo20_local` directly via preload script

No game state flows through IPC. The renderer never talks to the game engine directly.

### IPC Channels

Minimal. Four channels only:

| Channel | Direction | Purpose |
|---|---|---|
| `server:start` | renderer → main | Host clicks "Start Game" |
| `server:ready` | main → renderer | Server is up, safe to connect |
| `tunnel:url` | main → renderer | Push Cloudflare URL to display in lobby |
| `update:available` | main → renderer | Notify of pending app update |

### Local DB Access

The renderer connects to `byo20_local` directly via a preload script — a `queryDB(sql)` function exposed to the renderer. No IPC round-trip per query. Acceptable because this is a local app with no multi-user security concerns on the client side.

### Sidecar Spawn Logic

```
User clicks "Host Game"
  → main spawns Postgres sidecar (byo20_server + byo20_local)
  → main spawns Redis sidecar
  → main starts WS server
  → main starts Cloudflare Tunnel
  → main pushes tunnel URL to renderer via IPC (tunnel:url)

User clicks "Join Game"
  → main spawns Postgres sidecar (byo20_local only)
  → that's it — renderer handles the rest via WS
```

---

## React ↔ Babylon.js Bridge

Babylon.js drives its own render loop via `engine.runRenderLoop()`. React has its own render cycle. They cannot share state through props — React re-renders triggered inside a 60fps loop would cause chaos.

**Zustand is the bridge.** It is not a cache — it is live session state. No invalidation logic, no TTL. Every `STATE_DELTA` from the server overwrites the relevant slice. It's not a copy of something, it IS the thing for the duration of the session.

### Data Hierarchy

| Layer | What lives here | Lifetime |
|---|---|---|
| Zustand | Live session state — entity positions, HP, conditions, initiative order, game phase, selected entity, fog state | In-memory, session only |
| `cache.*` (byo20_local) | Persistent mirror — character history, quest log, chat log, reference data. Lazy reads for bulky data (spell descriptions, item details) | Persists across sessions |
| Redis | Server-side only. Client never touches it. | Server session only |

### How It Works

```
WS message arrives
  → WS handler writes to Zustand store
  → React components re-render via selectors (only affected components)
  → Babylon.js reads updated values via getState() in runRenderLoop / onBeforeRenderObservable
```

```
Babylon.js pick fires (token clicked, hex selected)
  → store.getState().selectEntity(id)   ← direct store write, no React involved
  → React panels re-render via subscription
```

### Store Shape (abbreviated)

```typescript
const useStore = create((set, get) => ({
  // live game state
  gamePhase: 'exploration',
  selectedEntityId: null,
  entities: {},           // { [id]: { hp, conditions, position, name, ... } }
  initiativeOrder: [],
  fogState: {},

  // UI state
  spellPreview: null,     // { spellId, state: 'aiming' | 'confirmed', origin? }

  // actions
  selectEntity: (id) => set({ selectedEntityId: id }),
  patchEntity: (id, updates) => set((state) => ({
    entities: { ...state.entities, [id]: { ...state.entities[id], ...updates } }
  })),
  setSpellPreview: (preview) => set({ spellPreview: preview }),
}))
```

### React Reading From the Store

```typescript
// component only re-renders when selectedEntityId changes
const selectedId = useStore(s => s.selectedEntityId)

// reads entity data — re-renders only when that entity changes
const entity = useStore(s => s.entities[s.selectedEntityId])
```

### Babylon.js Reading From the Store

```typescript
// inside render loop — no hooks, no React, no subscriptions
// scene.onBeforeRenderObservable fires every frame before render
scene.onBeforeRenderObservable.add(() => {
  const { entities, selectedEntityId, spellPreview } = useStore.getState()
  // sync mesh positions, materials, visibility etc. directly
})
```

### Canvas Setup

```tsx
const BabylonCanvas = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let engine: WebGPUEngine

    const init = async () => {
      engine = new WebGPUEngine(canvasRef.current!)
      await engine.initAsync()  // WebGPU init is async — must await before creating scenes
      const scene = new Scene(engine)

      // scene setup: camera, lights, materials, observables...
      scene.onBeforeRenderObservable.add(() => {
        const { entities, selectedEntityId, spellPreview } = useStore.getState()
        // sync scene state to Zustand
      })

      engine.runRenderLoop(() => scene.render())

      window.addEventListener('resize', () => engine.resize())
    }

    init()

    return () => engine?.dispose()
  }, []) // empty deps — runs once, never again

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
})
```

`memo()` + empty deps array = React renders the canvas exactly once and never touches it again. The async `init()` inner function is required because `WebGPUEngine.initAsync()` must be awaited — React's `useEffect` cleanup return value can't be a Promise, so the async logic is wrapped inside.

### AoE Preview Flow

```
Player selects spell from hotbar
  → store.setSpellPreview({ spellId: 'fireball', state: 'aiming' })
  → Babylon.js reads in loop → spawns preview mesh (MeshBuilder.CreateSphere etc. per AoE shape)
  → player moves mouse → scene.pick() raycasts against terrain → updates preview position
    (purely internal to Babylon.js, no store write until confirmed)
  → player clicks to confirm
  → store.setSpellPreview({ spellId: 'fireball', state: 'confirmed', origin: {x,y,z} })
  → React sends PLAYER_ACTION over WS
  → Babylon.js disposes preview mesh
```

### Click Isolation

React UI panels sit above the canvas in z-index. DOM event propagation handles isolation naturally — clicking a hotbar button never reaches the canvas click listener. Babylon.js pointer picking (`scene.pick()`) only fires when interaction lands on the canvas.

---

## Visual Direction

Low-mid poly geometry with cell shading. Mood comes from lighting and post-processing, not geometry detail or texture complexity.

### Materials

- **Cell shading** — hard lighting bands rather than smooth gradients. Flat color base per material, minimal variation within a surface.
- **Flat colors** — no albedo textures. Color is authored per material.
- **Roughness maps** — used to break uniformity on surfaces where it matters (worn stone, rusted metal, bark). Optional normal maps for the same purpose.
- **Emissive** — primary source of visual interest: lantern glow, fire, magic aura, bioluminescent elements. Emissive intensity drives the mood of a scene.

Babylon.js `PBRMaterial` supports all of the above natively. Cell shading is achieved via a toon shading post-process or custom `ShaderMaterial` — locked at implementation time.

### Lighting

- **Point lights** — the primary light type. Placed at light sources: torches, lanterns, fires, magic. Tight radius, high intensity falloff.
- **Ambient** — very low. Scenes should feel dark between light sources.
- **God rays** — `VolumetricLightScatteringPostProcess` on key directional sources (shafts through fog, windows, dungeon openings). Used sparingly.
- No HDR skybox in v1 — sky is a simple dark gradient or solid colour.

### Rendering Pipeline

- **WebGPU backend** — `WebGPUEngine` for forward+ rendering, better perf at moderate poly counts.
- **Post-processing** — toon/cell shading pass, god rays, light bloom on emissive sources. Configured via Babylon.js `PostProcessRenderPipeline`.
- **Polygon budget** — medium-low. Characters/NPCs: ~1k–5k tris. Terrain patches and world objects: ~500–2k tris. No LOD system in v1.

---

## Havok Physics (Dice)

Havok is integrated natively into Babylon.js and is the physics backend for dice rolling only. No physics simulation elsewhere in v1.

### Dice Roll Feedback

When a dice roll event fires (server sends authoritative result + seed):

```
Server emits DICE_ROLL event
  → payload: { result: number, die: 'd20' | 'd12' | ... , seed: number }
  → Client spawns a floating mini-viewport (separate BabylonCanvas instance, canvas overlay)
  → Die mesh created (MeshBuilder.CreatePolyhedron or custom mesh per die type)
  → Havok physics body attached — die thrown with seed as RNG input
  → Physics simulation runs — die tumbles and lands
  → Die settles on the face matching server's authoritative result
  → Mini-viewport fades out after ~2s
```

Seed-driven determinism: the server sends the seed used for the roll. The client feeds this seed to Havok's RNG so the physics animation always resolves to the correct face. The visual matches the result; it doesn't influence it.

### Havok Init

```typescript
import HavokPhysics from '@babylonjs/havok'

const havokInstance = await HavokPhysics()
const physicsPlugin = new HavokPlugin(true, havokInstance)
scene.enablePhysics(new Vector3(0, -9.81, 0), physicsPlugin)
```

Havok WASM bundle ships with Babylon.js — no separate CDN fetch needed.

---

## App Entry + Routing

### Router

React Router in **memory mode**. Electron loads a local file — no real URL bar. Browser history mode breaks. Memory mode gives the same API with no URL dependency.

React Router owns navigation. Zustand owns game state. They are separate concerns. The router reads Zustand to decide when to push to the next route — it does not drive game state.

```typescript
// route guard example — in-game redirect
const phase = useStore(s => s.gamePhase)
useEffect(() => {
  if (phase === 'in_game') navigate('/game')
}, [phase])
```

### No Auth

No login screen, no accounts, no passwords. Local-only. The only auth is campaign-scoped tokens in Postgres (transport layer concern — invite code on first join, token on reconnect).

### Route Structure

```
/                       Landing — Host or Join
/host/campaigns         Campaign select or create new
/host/setup             Campaign setup form
/host/worldgen          World gen loading screen (staged)
/host/lobby             Waiting for players, show tunnel URL + invite code
/game                   In-game (both host and player land here)
/join                   URL + invite code entry
/join/connecting        Connecting state
```

### World Gen Loading Screen

Seven staged passes (see ai-layer.md World Gen). Server pushes progress via `SYSTEM` WS messages. Zustand holds current stage. Loading screen subscribes and updates.

```typescript
// server pushes as each stage completes
{ type: 'SYSTEM', payload: { event: 'world_gen_stage', stage: 'terrain', progress: 1/7 } }
```

Loading screen shows per-stage label and a progress indicator. DM cannot proceed until `campaigns.world_gen_status = 'complete'`.

---

## In-Game Layout

### Approach

Fixed layout with collapsible sidebars. No draggable docking in v1 — that's a window manager problem and not worth the complexity. Sidebar width is resizable. All UI panels are CSS overlays on top of the Babylon.js canvas — Electron is a Chromium window, z-index works normally.

### Regions

```
┌─────────────────────────────────────────┐
│              top bar                     │
├────────┬────────────────────┬───────────┤
│        │                    │           │
│  left  │  BABYLON.JS CANVAS │   right   │
│ sidebar│                    │  sidebar  │
│        │                    │           │
├────────┴────────────────────┴───────────┤
│              bottom bar                  │
└─────────────────────────────────────────┘
```

| Region | Contents | Default |
|---|---|---|
| Top bar | Phase indicator, world clock, session info | Always visible |
| Left sidebar | Character sheet drawer | Collapsed |
| Babylon.js canvas | Full 3D world | Always visible, expands to fill remaining space |
| Right sidebar | Initiative tracker + quest panel | Collapsed |
| Bottom bar | Hotbar (3 bars × 9 slots) + chat | Always visible |

Both sidebars collapse to a thin strip. Canvas expands to fill whatever space they leave.

---

## Components

### Locked

---

#### Unit Frame

Persistent widget showing character status at a glance. Overlaid on canvas via CSS.

**Contents:**
- Character avatar (capsule placeholder in v1)
- HP bar with current/max values
- XP bar with current/max values
- Condition icons in a row (one icon per active condition)
- Action economy indicators (see below)

**Behaviour:**
- Click → opens character sheet drawer in left sidebar

**Position:** TBD — confirm with Claude Design. Likely top-left or bottom-left.

**Action economy display:** TODO — placement TBD, discuss with Claude Design. Resources to display:
- Action — boolean (available / used)
- Bonus Action — boolean
- Reaction — boolean (per round, not per turn)
- Movement — depleting bar (feet remaining)
- Attacks remaining — pip indicators (uint8, up to 4 for high-level fighters)

---

#### Left Sidebar — Character Sheet Drawer

Full character sheet, collapsed by default. Power users can pin it open permanently.

**Default state:** collapsed to a thin strip  
**Pinnable:** yes — stays open across turns if pinned  
**Contents:** full character sheet (stats, spell slots, class resources, equipment, proficiencies, etc.)  
**Trigger to open:** click unit frame, or click the sidebar strip

---

#### Hotbar

9 slots × 3 swappable bars. Overlaid on canvas. Player labels each bar (e.g. Attacks / Spells / Items).

**Slots:** any action, spell, item, or class ability can be slotted  
**Bars:** 3 max, swappable via tab or keyboard  
**End Turn button:** sits alongside the hotbar  
**Position:** bottom of canvas overlay

---

#### Chat

Tabbed chat panel in the bottom bar.

**Tabs:**
- **Party** — OOC chat, always present, always first tab
- **[NPC Name]** — opens when the party initiates dialogue with an NPC, closeable. Multiple NPC tabs possible (e.g. split party talking to different NPCs simultaneously)

**Mentions:**
- `@PlayerName` / `@NPCName` — mention a player or NPC currently in the chat
- `#ItemName` / `#QuestName` / `#SpellName` — link to any item, quest, or spell

Mention chips render as styled clickable tags in the message. Clicking a chip opens the referenced entity in the **Codex** (see TODO list).

**Persistence:** stored in `party_chat_log` (server) and mirrored to `cache.party_chat_log` (local). Players can cross-reference chat from previous sessions.

**NPC dialogue:** handled in NPC tab, not Party tab. Visually distinct from OOC messages.

---

#### Narration Display

AI narration streamed token-by-token. Overlaid on the canvas via CSS — not rendered inside Babylon.js.

Sits over the canvas at a fixed position. Text appears as it streams. Fades or dismisses after a configurable duration or on player interaction.

---

#### Codex

Player-facing reference panel. HTML/CSS modal overlay — not a Babylon.js scene element. Sits above the canvas via z-index, consistent with all other UI panels.

**Visual design:** bookshelf with distinct books per category. Clicking a book opens it with a CSS 3D page-flip animation to a table of contents. Selecting a ToC entry page-flips to that content. Animations use `perspective`, `transform-style: preserve-3d`, `rotateY` transitions.

**Trigger:** book icon overlay on canvas (always visible during play) or `#mention` chip clicks in chat (`#spell`, `#item`, `#npc`, `#quest`). Also openable via hotkey.

**Size:** centered modal, ~90% viewport. Not full screen. Clicking outside or pressing Escape closes it.

**Books / tab structure:**

| Book | Contents | Campaigns |
|---|---|---|
| Rules | Conditions, actions, action economy, rests, general mechanics | Both |
| Spells | Full SRD spell list with descriptions, components, ranges | Both |
| Bestiary | Monster stat blocks from SRD | Both |
| Conditions | Quick-reference condition cards | Both |
| Lore | Campaign history, faction records, world knowledge, NPC entries | **Epic only** |

**Lore tome (Epic only):**

- Only renders when `campaigns.world_depth = 'epic'`. Does not render in Standard campaigns — the bookshelf simply has one fewer book.
- Starts empty and locked at campaign start.
- **Physical library visit** — party visits the Grand Library (placed during Epic world gen). Visit event populates the Lore tome and enables it.
- **Remote access** — per-party quest reward. Completing the qualifying quest flips `campaigns.library_access_unlocked = true`. Lore tome then accessible from anywhere without returning to the library.
- Remote access is per-party. One player completing the quest unlocks it for everyone.

**Lore framing:** the Codex is narratively the Grand Library's catalogue. No tutorial needed — players understand the link once they visit in-world.

**Content sources:**
- Rules, Spells, Bestiary, Conditions: SRD data from `srd.*` tables
- Lore: `lore_entries` rows for this campaign, grouped by `category`

---

### TODO — Design in Session 2

- Initiative tracker (right sidebar)
- Quest panel (right sidebar)
- Top bar
- Character sheet drawer contents
- Dice roll feedback
- Toast / notification system
- Death save tracker
- ~~Codex~~ (designed — see Locked above)
- Modals: level up choices, loot survey, voting UI
- Input handling (canvas raycasting → React, keyboard shortcuts)
- Admin panel (host-only overlay)

---

## Storage Cross-References

Changes introduced by this layer and applied to storage-layer.md:

- `party_chat_log` — new table in `log.*` schema (`byo20_server`). Append-only OOC chat history scoped per session.
- `cache.party_chat_log` — added to `byo20_local` cache mirror. Full chat history synced to player's local DB.

---

## Summary of Locked Decisions

| Decision | Choice |
|---|---|
| Main process responsibilities | Sidecar spawning, WS server, Cloudflare Tunnel, safeStorage, electron-updater |
| Renderer process responsibilities | React, Babylon.js, Zustand, WS client, byo20_local reads |
| IPC channels | 4 only — server:start, server:ready, tunnel:url, update:available. No game state through IPC. |
| Local DB access from renderer | Direct via preload script — no IPC round-trip per query |
| Redis | Server-side only. Never touched by renderer, even on host machine. |
| Host UI | Connects via WebSocket same as any player — no special renderer-to-engine path |
| Sidecar spawn | byo20_local always. byo20_server + Redis only if hosting. |
| React ↔ Babylon.js bridge | Zustand — shared store, React subscribes via selectors, Babylon.js reads via getState() in runRenderLoop / onBeforeRenderObservable |
| Zustand role | Live session state — not a cache. No invalidation logic. STATE_DELTA overwrites relevant slice. |
| Babylon.js internals | Never in Zustand — scene objects, meshes, camera, engine stay internal to Babylon.js |
| Canvas setup | memo() + empty deps — React renders once, never again. WebGPUEngine.initAsync() requires inner async init function inside useEffect. |
| Click isolation | CSS z-index — UI panels above canvas, DOM event propagation handles separation |
| Router | React Router memory mode — no URL dependency in Electron |
| Auth | None — no login, no accounts. Token handling is transport layer concern. |
| Layout | Fixed regions, collapsible sidebars, resizable width. No draggable docking in v1. |
| UI overlay approach | All panels CSS-overlaid on canvas via z-index — standard Chromium behaviour |
| Left sidebar | Character sheet drawer — collapsed by default, pinnable |
| Right sidebar | Initiative tracker + quest panel — collapsed by default |
| Hotbar | 9 slots × 3 bars, overlaid on canvas, player-labelled bars |
| Chat tabs | Party OOC (permanent) + NPC tabs (per-interaction, closeable) |
| Chat mentions | @ for players/NPCs, # for items/quests/spells |
| Mention chips | Clickable → open in Codex |
| Chat persistence | party_chat_log (server) + cache.party_chat_log (local) |
| Narration display | CSS overlay on canvas — not inside Babylon.js |
| Visual direction | Low-mid poly, cell shading, flat colors + roughness maps. Mood via emissive, point lighting, god rays. |
| Rendering backend | WebGPU via WebGPUEngine. Post-processing pipeline for cell shading + god rays + emissive bloom. |
| Physics | Havok (via Babylon.js native integration). Dice only in v1. Seed-driven determinism — server sends seed, client feeds it to Havok RNG. |
| Action economy placement | TODO — Claude Design |
| Codex implementation | HTML/CSS modal — not Babylon.js |
| Codex animation | CSS 3D transforms (`perspective`, `rotateY`) for bookshelf + page flip |
| Codex utility books | Always accessible in all campaigns — no gate |
| Codex Lore tome | Epic only — does not render in Standard |
| Lore gate | Physical library visit populates; quest reward unlocks remote access |
| Library remote access scope | Per-party (campaign-scoped flag), not per-player |
