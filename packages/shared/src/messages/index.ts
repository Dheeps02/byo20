// Namespaced to avoid the TURN_END name collision: both client.ts and server.ts
// export TurnEndSchema / TurnEnd, but they represent different roles of the
// same wire type. Callers use `client.ClientMessageSchema` / `server.ServerMessageSchema`.
export * as client from './client'
export * as server from './server'
