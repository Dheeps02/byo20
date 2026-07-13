---
paths:
  - "packages/ai/**"
---

# AI Layer Rules

## Spec First
Read `docs/spec/ai-layer.md` in full before touching this package.
The multi-agent architecture, specialist routing, and output formats are all load-bearing.

## What Lives Here
- Event Evaluator (deterministic gate — zero LLM cost, outputs tier only)
- Orchestrator (context assembly, specialist routing, chain management)
- DM Specialist (structured JSON output only — no prose)
- NPC Specialist (in-character dialogue, streamed prose)
- Narration Specialist (out-of-character prose, always streamed)
- World Gen pipeline (7-stage, terrain-first)
- Smart narration tier (pool / cheap model / frontier)
- Zod schemas for all LLM structured output validation

## What Does Not Live Here
- D&D rules math (engine)
- WS message sending (transport)
- DB writes — use MCP write tools, never import storage directly from specialists

## LLM Calls
- All LLM calls go through Vercel AI SDK — never call providers directly
- Provider is configured at runtime — never hardcode `anthropic` or `openai`
- Always stream narration — never buffer then send

## Output Validation
All structured JSON from specialists must pass Zod validation before reaching the engine.
Use `.strict()` on all schemas — unknown keys must be rejected.
On validation failure: retry once with error feedback, then escalate.

## Skill Files
Skill files are Markdown prompt docs in `apps/desktop/assets/skill-files/`.
Injected by the orchestrator at call time — never baked into base system prompts.
Do not duplicate skill file content in code.

## Event Evaluator
Must remain fully deterministic — zero LLM calls.
Reads Redis game state only. Outputs tier only — never routes to specialists directly.

## Token Economy
Every unnecessary LLM call is a design failure. Before adding a call, ask:
can this be resolved deterministically? If yes, it should be.
