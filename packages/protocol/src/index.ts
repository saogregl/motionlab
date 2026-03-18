// Version constants and handshake helpers

// Mechanism schema types
export * from './generated/mechanism/mechanism_pb.js';
// Selected generated types for consumers
export type {
  BodyImportResult,
  CreateDatumCommand,
  CreateDatumResult,
  CreateJointCommand,
  CreateJointResult,
  DeleteDatumCommand,
  DeleteDatumResult,
  DeleteJointCommand,
  DeleteJointResult,
  EngineStatus,
  Event,
  HandshakeAck,
  ImportAssetCommand,
  ImportAssetResult,
  ImportOptions,
  RenameDatumCommand,
  RenameDatumResult,
  UpdateJointCommand,
  UpdateJointResult,
} from './generated/protocol/transport_pb.js';
export { EngineStatus_State } from './generated/protocol/transport_pb.js';
// Binary transport helpers
export {
  createCreateDatumCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteJointCommand,
  createHandshakeCommand,
  createImportAssetCommand,
  createPingCommand,
  createRenameDatumCommand,
  createUpdateJointCommand,
  engineStateToString,
  eventToDebugJson,
  mapJointType,
  parseEvent,
  toProtoJointType,
} from './transport.js';
export {
  createHandshake,
  isCompatible,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type ProtocolHandshake,
} from './version.js';
