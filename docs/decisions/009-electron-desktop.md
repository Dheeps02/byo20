# 009 — Electron for Cross-Platform Desktop v1.0.0

## Status
Accepted

## Context

BYO20 needs a cross-platform desktop app for macOS and Windows. The same binary serves two roles depending on what the user does: DM mode (host mode — starts the server, sidecars, and Cloudflare Tunnel) and player mode (join mode — connects to an existing session via WebSocket). Both roles use the same Electron app; the DM just clicks "Host Game" instead of "Join Game."

A few hard requirements drove the technology decision:
- **`safeStorage`** — API keys must be encrypted using the OS keychain (macOS Keychain, Windows Credential Manager). A web app cannot do this.
- **Sidecar spawning** — Electron's main process must spawn Postgres, Redis, and the game server as child processes on host launch. A web app cannot spawn system processes.
- **Local Postgres access from the renderer** — The renderer reads `byo20_local` directly via a preload script, bypassing IPC round-trips. This requires a native runtime.

## Decision

Electron. The app runs on macOS and Windows from a single codebase. `electron-updater` delivers silent background updates so users stay current without manual action.

## Alternatives Considered

**Web app** — A browser-based client served from the DM's machine or hosted externally. Rejected because:
1. No `safeStorage` — API keys cannot be OS-encrypted in a web context. Local storage or cookies are not acceptable for LLM API keys.
2. No subprocess spawning — a web app can't start Postgres, Redis, or a game server as sidecars.
3. No direct local DB access — the preload-script pattern (`queryDB(sql)`) that gives the renderer a zero-IPC path to `byo20_local` requires a native runtime.

**Tauri** — A Rust-based desktop framework with a smaller binary than Electron. Rejected because Tauri's Node integration is weaker than Electron's for features BYO20 specifically needs: `safeStorage` equivalent (Tauri's credential store API differs), `electron-updater` (Tauri has its own updater but the ecosystem is less mature), and the preload-script `queryDB` pattern requires Electron's IPC/preload model to work as designed.

## Consequences

- Electron bundles its own Node. Users do not need Node installed to run the app.
- `electron-builder` is used for packaging. Separate Node install required to run the build step, but not to run the finished app.
- Larger binary than a Tauri equivalent. Acceptable trade-off for full native access and a mature ecosystem.
- The renderer process connects to the game server via WebSocket, exactly like a remote player. No special renderer-to-engine path exists. This keeps the renderer clean (it's a dumb client) and means the host has the same network path as everyone else.
- `safeStorage` integration: API key encrypted by the OS, stored as a blob in `campaigns.api_key_blob` in Postgres, decrypted in memory at the point of each LLM call — never written to disk in plaintext.
