---
paths:
  - "apps/server/**"
---

# Server Rules

## What This Is
Composition root only. The Bun subprocess spawned by Electron main.
Wires packages together and starts the server. No game logic lives here.

## Responsibilities
- Import and wire engine, transport, ai, storage
- Start the WS server
- Set up EventEmitter hooks between engine and ai layer
- Manage DB connections (byo20_server + Redis)
- Handle graceful shutdown

## What Does Not Live Here
- Game logic → engine
- LLM calls → ai
- WS message handling → transport
- Schema definitions → storage

## API Key
Arrives as `process.env.LLM_API_KEY` at spawn time, decrypted by Electron main.
Never log it. Never write it anywhere. Pass it to the Vercel AI SDK in memory only.

## Process Lifecycle
This process is supervised by Electron main.
On crash: Electron main restarts it.
On quit: clean shutdown — close WS connections, flush Redis to Postgres, close DB.
