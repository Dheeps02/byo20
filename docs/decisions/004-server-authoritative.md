# 004 — Server-Authoritative Game State v1.0.0

## Status
Accepted

## Context

Any multiplayer game needs a clear answer to the question: who is right when the client and server disagree? The two main options are server-authoritative (server is always the source of truth, client shows what the server tells it) and optimistic updates with client-side reconciliation (client applies the action immediately and corrects itself if the server disagrees).

BYO20 is a turn-based game over WebSocket with moderate message volume (10–20 messages per combat round). Correctness of game state matters — D&D has strict rules about what actions are legal given what resources are available. A player should never see themselves take an action the server would reject.

## Decision

The server is always the source of truth. The client performs local validation for UX feedback only — greying out illegal action buttons, highlighting movement range — but these are display conveniences, not game logic. The server re-validates every received action regardless of what the client believes.

All game state changes go through a write-through pattern: `BEGIN TRANSACTION → write state → append to event_log → COMMIT → emit WS event`. Nothing reaches the client until it's committed.

## Alternatives Considered

**Optimistic updates with reconciliation** — The client applies the action immediately, shows the result, and corrects if the server disagrees. Rejected because: reconciliation requires tracking what the client thinks is true vs. what the server confirmed, rolling back visual state on rejection, and handling cases where multiple players acted simultaneously. For a turn-based game at low message volume, this complexity buys almost nothing. The latency difference between optimistic and server-authoritative is imperceptible in a turn-based context.

## Consequences

- The client is a dumb renderer. No game logic lives in `apps/desktop/renderer`. State flows one direction: server writes, transport delivers, Zustand stores, React/Babylon.js renders.
- Server rejects invalid actions with an `ACTION_REJECTED` message including the reason. Client displays the rejection.
- No rollback logic needed in the client.
- Fog-of-war is enforced server-side: the server computes each player's visible entity set before sending `STATE_DELTA`, so no entity data a player shouldn't see ever hits their machine.
- Dice animations on the client are visual only. The client spins the dice immediately on action send; when `ROLL_RESULT` arrives it resolves the animation to the actual server value. No optimistic update, no reconciliation — just animation timing.
