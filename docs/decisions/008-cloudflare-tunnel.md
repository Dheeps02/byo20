# 008 — Cloudflare Tunnel for Multiplayer Connectivity v1.0.0

## Status
Accepted

## Context

BYO20 is self-hosted. The DM runs the server on their own machine and players connect from their own homes. The fundamental networking problem: how do players reach the DM's server when it's behind a home router with NAT, a dynamic IP, and no open ports?

The solution needs to work for a non-technical DM with no networking knowledge — zero configuration, zero infrastructure, zero ongoing cost.

## Decision

Cloudflare Tunnel (`cloudflared`). The game server starts a tunnel on host launch. Cloudflare's edge returns a public HTTPS/WSS URL (e.g. `xyz.trycloudflare.com`). Players connect to that URL. The Electron app displays it in the lobby alongside the invite code.

The tunnel is on Cloudflare's free tier. No account required for `trycloudflare.com` URLs. No static IP, no port forwarding, no router configuration.

## Alternatives Considered

**Direct WebSocket (port forwarding)** — Requires the DM to open a port on their router and know their public IP. Rejected because this excludes a large portion of potential DMs who are not comfortable with networking configuration. Carrier-grade NAT (CGNAT) — increasingly common with ISPs — makes port forwarding impossible entirely for some users.

**Relay server** — A persistent server BYO20 operates that all traffic routes through. Rejected because it introduces infrastructure the project must maintain and pay for indefinitely, contradicts the self-hosted design, and creates a single point of failure the DM can't control.

**WebRTC** — Peer-to-peer with STUN/TURN fallback. Rejected because TURN server infrastructure has the same maintenance problem as a relay server, and WebRTC's complexity is hard to justify for a WebSocket-native protocol.

## Consequences

- Cloudflare Tunnel URL changes on every server restart (free tier limitation). Players need the new URL at the start of each session — the Electron lobby displays it and it can be shared easily.
- Invite codes are separate from the URL, so sharing the URL alone is not enough to join. This is a feature: a leaked URL doesn't expose the campaign.
- The trade-off (URL changes per session) is accepted for zero-config self-hosting. Players reconnect with their persistent campaign tokens on the new URL — the token is the auth, the URL is just the address.
- No infra to maintain, no cost, no CGNAT problems, no port forwarding required. The DM just clicks "Host Game."
