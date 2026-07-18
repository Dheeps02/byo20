# 013 — Result Type for Engine Rejections v1.0.0

## Status
Accepted

## Context

The game engine frequently needs to communicate that a player action was rejected for rule-based reasons (no spell slot, out of range, etc). Using thrown exceptions for this conflates expected game logic with exceptional infrastructure failures and makes it easy to accidentally swallow rejections at call sites.

## Decision

Engine layer methods that can produce rule-based rejections return `Result<T, GameRejection>` — a plain TypeScript discriminated union defined in `@byo20/shared`. No external library. TypeScript narrows the type on `if (result.ok)` checks, forcing call sites to handle both branches.

## Consequences

Slightly more verbose call sites. All `IRulesEngine` method signatures that can reject must be updated to reflect this return type.
