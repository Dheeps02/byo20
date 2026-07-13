# Coding Conventions

## TypeScript
- Strict mode always. No `any` — if you think you need it, you don't
- `type` for plain data shapes, `interface` for contracts implementations fulfill
- Prefix interfaces with `I`: `IRulesEngine`, `IGameStateStore`
- No implicit returns on functions with meaningful output

## Imports
- Cross-package: always use package name (`@byo20/shared`), never relative paths
- Within a package: relative paths only
- Import order: external packages first, then internal packages, then relative

## File Naming
- `kebab-case` for all files and folders
- `PascalCase` for React components and their files (`UnitFrame.tsx`)
- `camelCase` for everything else

## Never Do
- Game logic in the renderer
- Game state through IPC
- Import engine/transport/ai from renderer
- Import ai from engine or vice versa
- Write to DB from renderer
- Babylon.js internals in Zustand
- Hardcode D&D rules outside `@byo20/engine`
- Skip server-side validation because client validated
- Log or persist decrypted API keys
- Bulk commits — one logical change per commit, always
