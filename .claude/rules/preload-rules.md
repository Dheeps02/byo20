---
paths:
  - "apps/desktop/src/preload/**"
---

# Preload Rules

## What This Is
A single TypeScript file compiled by electron-vite into `preload.js`.
Runs before the renderer loads, in a hybrid context with Node access and window access.
Its only job: expose typed read functions on `window.localDb` via contextBridge.

## Rules
- Read-only — only expose read functions, never write functions
- No game logic
- No IPC — direct DB connection is fine, this is a local app
- Every exposed function must be explicitly typed — no `any`
- Keep it thin — if logic is growing here, it belongs in storage query functions instead

## Data Flow
```
Bun server → writes → byo20_local cache.*
Renderer   → reads → window.localDb.* (this file)
```
One direction only. Renderer never writes.

## contextBridge Pattern
```ts
contextBridge.exposeInMainWorld('localDb', {
  getCharacter: (id: string): Promise<Character> => ...,
  getSpell: (id: string): Promise<Spell> => ...,
  getChatLog: (sessionId: string): Promise<ChatMessage[]> => ...,
})
```
