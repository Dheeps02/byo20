---
paths:
  - "apps/desktop/src/main/**"
---

# Desktop Main Rules

## What This Is
Thin supervisor. Electron's main process.
Manages native OS concerns and process lifecycle only.

## Responsibilities
- Spawn Postgres sidecar (byo20_local always, byo20_server + Redis if hosting)
- Spawn Bun server subprocess — pass decrypted API key as env var
- Handle safeStorage (encrypt/decrypt API key)
- 4 IPC channels only: `server:start`, `server:ready`, `tunnel:url`, `update:available`
- electron-updater

## Hard Rules
- Zero game logic
- Zero game state
- Zero WS handling
- No game data through IPC — ever

## safeStorage
Decrypt API key only when spawning the Bun server.
Pass as `LLM_API_KEY` env var. Never store decrypted value anywhere.
Never log it.

## Sidecar Spawn Order
1. Postgres (byo20_local always)
2. Postgres (byo20_server) + Redis — only if hosting
3. Bun server subprocess — only if hosting
4. Cloudflare Tunnel — only if hosting
5. Signal renderer via `server:ready` IPC

## IPC Channels
Only these four, nothing more:
- `server:start` (renderer → main) — host clicked Start Game
- `server:ready` (main → renderer) — server is up
- `tunnel:url` (main → renderer) — Cloudflare URL ready
- `update:available` (main → renderer) — new app version available
