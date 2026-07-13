---
paths:
  - "apps/desktop/src/renderer/**"
---

# Renderer Rules

## This Is a Dumb Display Layer
No game logic. No rules math. No validation beyond UX feedback.
Server always re-validates everything — client validation is cosmetic only.

## Imports
Only `@byo20/shared` — nothing else from packages/*.
No engine, no storage, no transport, no ai.

## Zustand
Zustand is the bridge between React and Babylon.js. It is live session state, not a cache.
- No TTL, no invalidation logic
- `STATE_DELTA` from server overwrites slices directly
- React subscribes via selectors — components only re-render on their slice changing
- Babylon.js reads via `useStore.getState()` in the animation loop
- Babylon.js internals (meshes, scene, camera, materials) NEVER go into Zustand

## Babylon.js Canvas
Canvas is rendered once and never touched by React again:
```tsx
const ThreeCanvas = memo(() => { ... }, () => true)
```
Empty deps, `memo()` — React renders it exactly once.

## Click Isolation
UI panels sit above canvas via CSS z-index.
DOM event propagation handles separation — no manual event filtering needed.
Babylon.js raycasting only fires when click lands on canvas.

## Local DB Access
Read from `byo20_local` via `window.localDb` (preload) only.
Never write through preload. Never open a DB connection directly.

## Icons
- UI chrome (buttons, close, settings): Phosphor Icons (`@phosphor-icons/react`)
- Game icons (conditions, damage types, spell schools): game-icons.net SVGs
  in `assets/icons/`, imported as React components via `?react` suffix
- Rarity indicators and action economy pips: in-house geometric shapes

## Component Conventions
- One component per file, filename matches component name (`UnitFrame.tsx`)
- Babylon.js scene setup in `scenes/`, not in components
- Store logic in `store/`, not inline in components
