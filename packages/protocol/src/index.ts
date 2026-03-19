// Version constants and handshake helpers

// Mechanism schema types
export * from './generated/mechanism/mechanism_pb.js';
// Selected generated types for consumers
export type {
  BodyImportResult,
  CompilationResultEvent,
  CompileMechanismCommand,
  CreateDatumCommand,
  CreateDatumFromFaceCommand,
  CreateDatumFromFaceResult,
  CreateDatumFromFaceSuccess,
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
  OutputChannelDescriptor,
  RenameDatumCommand,
  RenameDatumResult,
  ScrubCommand,
  SimulationControlCommand,
  SimulationFrame,
  SimulationStateEvent,
  SimulationTrace,
  TimeSample,
  UpdateJointCommand,
  UpdateJointResult,
} from './generated/protocol/transport_pb.js';
export {
  ChannelDataType,
  EngineStatus_State,
  FaceSurfaceClass,
  SimulationAction,
  SimStateEnum,
} from './generated/protocol/transport_pb.js';
// Binary transport helpers
export {
  createCompileMechanismCommand,
  createCreateDatumCommand,
  createCreateDatumFromFaceCommand,
  createCreateJointCommand,
  createDeleteDatumCommand,
  createDeleteJointCommand,
  createHandshakeCommand,
  createImportAssetCommand,
  createPingCommand,
  createRenameDatumCommand,
  createScrubCommand,
  createSimulationControlCommand,
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
