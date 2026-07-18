# 011 — Forced Version Locking v1.0.0

## Status
Accepted

## Context

BYO20 is a real-time multiplayer game where the DM's server and all player clients must agree on game rules, message schemas, and database structure. A mismatch between client and server versions can cause silent data corruption, schema deserialization failures, or undefined game behavior.

The question was how strictly to enforce version matching between clients and the host.

## Decision

Forced updates via `electron-updater`. No opt-out.

Updates download silently in the background (`autoInstallOnAppQuit: true`) and apply on next launch — never mid-session. Players are notified when an update is ready; they apply it before the next session.

**Version enforcement at WebSocket handshake (after invite code validation, before `STATE_SNAPSHOT`):**

- Client app version >= DM app version → proceed
- Client < DM → reject: `"Your app is out of date. Please restart to update."`
- Client > DM → reject: `"The host's app is out of date. Ask them to restart."`

The `ruleset_version` table records the installed SRD data version and is included in the handshake check alongside the app version.

## Alternatives Considered

**Optional updates** — Rejected. A player joining with a mismatched schema version can corrupt game state silently. The complexity of supporting multiple client versions simultaneously is unjustified for a hobby project.

**Semver compatibility range (allow patch-level mismatch)** — Rejected. Even patch releases can ship schema migrations or message format changes during active development. Strict floor (client >= host) is simpler and safer.

## Consequences

- All players must be on an app version >= the DM's before joining a session. In practice: DM updates → DM starts server → players launch app → players update → session starts.
- No old client can join a newer server.
- `electron-updater`'s `autoInstallOnAppQuit` means the app is always up to date as long as users close and reopen it. No explicit "install update" step required.
- SRD data versioning is coupled to app versioning via `electron-updater`. No separate SRD version management.
