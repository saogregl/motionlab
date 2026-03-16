// Version constants and handshake helpers

// Mechanism schema types
export * from './generated/mechanism/mechanism_pb.js';
// Selected generated types for consumers
export type { EngineStatus, Event, HandshakeAck } from './generated/protocol/transport_pb.js';
export { EngineStatus_State } from './generated/protocol/transport_pb.js';
// Binary transport helpers
export {
  createHandshakeCommand,
  createPingCommand,
  engineStateToString,
  eventToDebugJson,
  parseEvent,
} from './transport.js';
export {
  createHandshake,
  isCompatible,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type ProtocolHandshake,
} from './version.js';
