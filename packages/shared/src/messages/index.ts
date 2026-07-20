/**
 * WS message schemas for @byo20/shared.
 * Namespaced to avoid the TURN_END name collision between client and server.
 *
 * Usage:
 *   import { client, server } from '@byo20/shared/messages'
 *   client.ClientMessageSchema.parse(raw)
 *   server.ServerMessageSchema.parse(raw)
 */
export * as client from "./client";
export * as server from "./server";
