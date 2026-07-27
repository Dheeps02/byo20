# Coding Conventions

## TypeScript
- Strict mode always. No `any` — if you think you need it, you don't
- `type` for plain data shapes, `interface` for contracts implementations fulfill
- Prefix interfaces with `I`: `IRulesEngine`, `IGameStateStore`
- No implicit returns on functions with meaningful output

## Docstrings
- Every function, type, interface, class, and enum gets a JSDoc `/** ... */` docstring — exported or not
- One line is fine for obvious things; a short paragraph for anything with non-trivial behaviour or constraints
- No multi-line blocks for simple getters or trivial wrappers

## Imports
- Cross-package: always use package name (`@byo20/shared`), never relative paths
- Within a package: relative paths only
- Import order: external packages first, then internal packages, then relative

## File Naming
- `kebab-case` for all files and folders
- `PascalCase` for React components and their files (`UnitFrame.tsx`)
- `camelCase` for everything else

## String Literal Casing

- **Uppercase** for engine/protocol-level discriminants: `ActionType` values (`"ATTACK"`, `"BONUS_ACTION"`), WebSocket message types (`"TURN_START"`, `"ACTION_REJECTED"`). These are the engine's own invented vocabulary and never touch the DB.
- **Lowercase** for values that cross the storage boundary: condition names (`"incapacitated"`, `"paralyzed"`) match `ConditionName` in `@byo20/shared` and are stored as-is in Postgres/Redis. Changing these would require a DB migration.
- Do not unify casing across these two categories — the difference is meaningful and load-bearing.

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
