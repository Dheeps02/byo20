# 002 — Babylon.js over Three.js

## Status
Accepted

## Context

BYO20 needs a 3D renderer for the VTT. The visual direction is low-mid poly with cell shading, point lighting, god rays, and emissive-driven mood — a Baldur's Gate 3 / TaleSpire aesthetic, not photorealism. One hard requirement is physics-driven dice: when the server resolves a roll, the client should animate a die tumbling and landing on the correct face, with the physics seed-driven so the result is deterministic.

The two obvious choices were Three.js and Babylon.js.

## Decision

Babylon.js with the WebGPU backend (`WebGPUEngine`).

Havok physics is integrated natively into Babylon.js and is the physics backend for dice. The WebGPU backend provides a forward+ rendering pipeline suited to the target aesthetic.

## Alternatives Considered

**Three.js** — Rejected for three reasons:
1. No native Havok physics. Achieving seed-driven deterministic dice would require a separate physics library and integration work.
2. Shadow budget ceiling of 4 shadow-casting lights. The lighting model (many point lights per scene) would hit this ceiling constantly and require workarounds.
3. LOD management requires more manual setup. Babylon.js handles it more cleanly at the target poly counts (1k–5k tris for characters, 500–2k for terrain patches).

## Consequences

- Native Havok integration: dice physics are seed-driven from the server's roll result, so the animation always resolves to the correct face without any reconciliation step.
- WebGPU forward+ rendering: better performance at medium poly counts and a clear upgrade path as WebGPU support widens.
- Babylon.js `PBRMaterial` supports cell shading, roughness maps, emissive, and the post-processing pipeline needed for god rays and emissive bloom — no custom shader work required for v1.
- Havok WASM ships with Babylon.js. No separate CDN fetch or external dependency.
- Babylon.js is a larger bundle than Three.js. Acceptable for a desktop Electron app; not relevant for web.
