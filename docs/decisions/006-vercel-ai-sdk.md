# 006 — Vercel AI SDK as LLM Abstraction

## Status
Accepted

## Context

BYO20 is a bring-your-own-key (BYOK) project. Players connect with their own LLM API key — Claude, GPT, Gemini, or a local Ollama instance. The AI layer needs to support all of these without tying the codebase to any single provider's SDK.

The `packages/ai` layer needs a consistent interface for making completion and streaming calls regardless of which provider the DM configured.

## Decision

The Vercel AI SDK is the LLM abstraction layer. It's a TypeScript library bundled inside the app at build time — no third-party routing service, no external dependency at runtime. The Vercel AI SDK provides a unified interface across Anthropic, OpenAI, Google, and Ollama.

The SDK runs locally inside the `apps/server` process. API keys are stored encrypted via Electron's `safeStorage` API and decrypted in memory at the point of each LLM call.

When a provider updates their API in a breaking way, Vercel updates the SDK and BYO20 ships a new release. `electron-updater` delivers that release silently.

## Alternatives Considered

**Direct Anthropic SDK** — Rejected because it locks BYO20 to one provider. BYOK is a core feature.

**Custom abstraction layer** — Building our own unified interface over each provider's native SDK. Rejected because it's ongoing maintenance work every time a provider ships breaking changes. The Vercel AI SDK already does this and is actively maintained.

**LiteLLM or similar proxy** — Rejected because it introduces a runtime network dependency (or a separate process to manage). The Vercel AI SDK is a library; no extra process, no extra port, no extra failure surface.

## Consequences

- Provider support at launch: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama (local, no API key required).
- The internal `ILLMAdapter` interface (`complete()` and `stream()`) is what the Orchestrator calls. The Vercel AI SDK is an implementation detail behind that interface.
- Streaming is first-class: Narration Specialist output streams token-by-token to the transport layer via the `stream()` path.
- Ollama support means the app works fully offline for users who run local models. No API key needed.
- Provider API breaks are handled via BYO20 release updates, not config or environment changes on the user's machine.
